import { DelayedError, type Job } from "bullmq";
import { prisma } from "@/lib/db";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";
import { getUserToken } from "@/lib/github/token";
import {
  fetchContributions,
  fetchRepoMetadata,
  fetchViewer,
  githubGraphql,
  type ContributionsByRepository,
  type RepoMetadata,
} from "@/lib/github/graphql";
import { rateLimitDelayMs } from "@/lib/github/rateLimit";

interface DiscoverData {
  userId?: string;
  sweep?: boolean;
}

// First-sync backfill window and the overlap re-scanned on every incremental
// sync so a contribution made right at the previous cursor is never missed.
const BACKFILL_MONTHS = 12;
const OVERLAP_MS = 24 * 60 * 60 * 1000; // 1 day
// Stagger per-user discover jobs in the sweep so we don't hammer GitHub at once.
const SWEEP_STAGGER_MS = 30 * 1000;

export async function discover(job: Job): Promise<void> {
  const data = job.data as DiscoverData;
  if (data.sweep) {
    await runSweep();
    return;
  }
  if (!data.userId) {
    throw new Error("discover: job has neither sweep nor userId");
  }
  await runUserDiscover(job, data.userId);
}

/** Fan out one per-user discover job per active user, staggered. */
async function runSweep(): Promise<void> {
  // Active = has a linked GitHub account (and therefore a usable token).
  const accounts = await prisma.account.findMany({
    where: { provider: "github" },
    select: { userId: true },
    distinct: ["userId"],
  });

  const queue = getQueue(QUEUE_NAMES.discover);
  let i = 0;
  for (const { userId } of accounts) {
    await queue.add(
      "user",
      { userId },
      { delay: i * SWEEP_STAGGER_MS, jobId: `discover-user-${userId}-${Date.now()}` },
    );
    i++;
  }
}

/** Run discovery for a single user. */
async function runUserDiscover(job: Job, userId: string): Promise<void> {
  // Ensure a SyncState row exists (recordRateLimit + rateLimitDelayMs need it),
  // and mark RUNNING.
  const state = await prisma.syncState.upsert({
    where: { userId },
    create: { userId, status: "RUNNING" },
    update: { status: "RUNNING", lastError: null },
  });

  try {
    const token = await getUserToken(userId);
    const client = githubGraphql(token);

    // Respect the rate-limit gate before issuing calls.
    const delay = await rateLimitDelayMs(userId);
    if (delay > 0) {
      await prisma.syncState.update({ where: { userId }, data: { status: "QUEUED" } });
      await job.moveToDelayed(Date.now() + delay, job.token);
      throw new DelayedError();
    }

    // Resolve the token owner's login (the user's stored login may be stale/null).
    const viewer = await fetchViewer(client, userId);

    // Sync window: first sync backfills BACKFILL_MONTHS; later syncs re-scan from
    // the last incremental sync minus an overlap.
    const now = new Date();
    const lastIncrSyncAt = state.lastIncrSyncAt;
    const isFirstSync = lastIncrSyncAt == null;
    const from = lastIncrSyncAt
      ? new Date(lastIncrSyncAt.getTime() - OVERLAP_MS)
      : monthsAgo(now, BACKFILL_MONTHS);

    const contributions = await fetchContributions(client, userId, {
      login: viewer.login,
      from: from.toISOString(),
      to: now.toISOString(),
    });

    const collection = contributions.user?.contributionsCollection;
    if (!collection) {
      // No contributions data (e.g. login mismatch); finish cleanly.
      await prisma.syncState.update({
        where: { userId },
        data: { status: "IDLE", lastIncrSyncAt: now, lastError: null },
      });
      return;
    }

    // Aggregate per-repo contribution counts across all four categories.
    const counts = aggregateCounts(collection);
    const syncRepoQueue = getQueue(QUEUE_NAMES.syncRepo);

    for (const [nameWithOwner, contributionCount] of counts) {
      // Re-check the gate between repos; bail to delayed if we dipped below floor.
      const interDelay = await rateLimitDelayMs(userId);
      if (interDelay > 0) {
        await prisma.syncState.update({ where: { userId }, data: { status: "QUEUED" } });
        await job.moveToDelayed(Date.now() + interDelay, job.token);
        throw new DelayedError();
      }

      const [owner, name] = nameWithOwner.split("/");
      if (!owner || !name) continue;

      const meta = await fetchRepoMetadata(client, userId, owner, name);
      if (!meta) continue; // repo deleted / inaccessible

      const { repository, changed } = await upsertRepoAndLinks(userId, meta, contributionCount);

      // Skip-untouched: only enqueue a per-repo sync when pushedAt / counts moved
      // (or on the very first sync where there is nothing stored yet).
      if (changed || isFirstSync) {
        await syncRepoQueue.add(
          "sync",
          { userId, repositoryId: repository.id },
          { jobId: `sync-repo-${userId}-${repository.id}-${Date.now()}` },
        );
      }
    }

    await prisma.syncState.update({
      where: { userId },
      data: {
        status: "IDLE",
        lastIncrSyncAt: now,
        lastFullSyncAt: isFirstSync ? now : state.lastFullSyncAt,
        lastError: null,
      },
    });
  } catch (err) {
    // A DelayedError means we deliberately re-queued for the rate-limit reset —
    // not a failure. Leave status QUEUED and let BullMQ requeue.
    if (err instanceof DelayedError) throw err;
    await prisma.syncState.update({
      where: { userId },
      data: { status: "ERROR", lastError: errorMessage(err) },
    });
    throw err;
  }
}

/** Sum the four contribution categories into a per-repo total count. */
function aggregateCounts(collection: {
  commitContributionsByRepository: ContributionsByRepository[];
  pullRequestContributionsByRepository: ContributionsByRepository[];
  pullRequestReviewContributionsByRepository: ContributionsByRepository[];
  issueContributionsByRepository: ContributionsByRepository[];
}): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (list: ContributionsByRepository[]) => {
    for (const item of list) {
      const key = item.repository.nameWithOwner;
      counts.set(key, (counts.get(key) ?? 0) + item.contributions.totalCount);
    }
  };
  add(collection.commitContributionsByRepository);
  add(collection.pullRequestContributionsByRepository);
  add(collection.pullRequestReviewContributionsByRepository);
  add(collection.issueContributionsByRepository);
  return counts;
}

/**
 * Upsert the shared Repository (+ Organization) and the per-user link rows.
 * Returns the repository and whether its `pushedAt` (or the stored contribution
 * count) changed vs what we had — driving the skip-untouched decision.
 *
 * Per-user data (contribution counts, cursors, lastContributedAt) lives ONLY on
 * UserRepository; the shared Repository/Organization rows are user-agnostic.
 */
async function upsertRepoAndLinks(
  userId: string,
  meta: RepoMetadata,
  contributionCount: number,
): Promise<{ repository: { id: string }; changed: boolean }> {
  const [owner, name] = meta.nameWithOwner.split("/");
  const pushedAt = meta.pushedAt ? new Date(meta.pushedAt) : null;

  // Upsert the org (shared) if the repo is owned by an Organization.
  let organizationId: string | null = null;
  if (meta.owner.id && meta.owner.login) {
    const org = await prisma.organization.upsert({
      where: { githubNodeId: meta.owner.id },
      create: {
        githubNodeId: meta.owner.id,
        login: meta.owner.login,
        name: meta.owner.name ?? null,
        avatarUrl: meta.owner.avatarUrl ?? null,
        description: meta.owner.description ?? null,
      },
      update: {
        login: meta.owner.login,
        name: meta.owner.name ?? null,
        avatarUrl: meta.owner.avatarUrl ?? null,
        description: meta.owner.description ?? null,
      },
    });
    organizationId = org.id;
    // Per-user org membership link (idempotent).
    await prisma.userOrganization.upsert({
      where: { userId_organizationId: { userId, organizationId: org.id } },
      create: { userId, organizationId: org.id },
      update: {},
    });
  }

  const topics = meta.repositoryTopics.nodes.map((n) => n.topic.name);

  // Did the shared repo move since we last saw it? (pushedAt is the cheap signal)
  const existing = await prisma.repository.findUnique({
    where: { githubNodeId: meta.id },
    select: { id: true, pushedAt: true },
  });
  const pushedChanged =
    existing?.pushedAt?.getTime() !== (pushedAt ? pushedAt.getTime() : undefined);

  const repository = await prisma.repository.upsert({
    where: { githubNodeId: meta.id },
    create: {
      githubNodeId: meta.id,
      owner: owner ?? meta.owner.login,
      name: name ?? meta.nameWithOwner,
      nameWithOwner: meta.nameWithOwner,
      description: meta.description,
      isPrivate: meta.isPrivate,
      stargazers: meta.stargazerCount,
      primaryLang: meta.primaryLanguage?.name ?? null,
      topics,
      license: meta.licenseInfo?.spdxId ?? null,
      defaultBranch: meta.defaultBranchRef?.name ?? null,
      headSha: meta.defaultBranchRef?.target?.oid ?? null,
      pushedAt,
      organizationId,
    },
    update: {
      description: meta.description,
      isPrivate: meta.isPrivate,
      stargazers: meta.stargazerCount,
      primaryLang: meta.primaryLanguage?.name ?? null,
      topics,
      license: meta.licenseInfo?.spdxId ?? null,
      defaultBranch: meta.defaultBranchRef?.name ?? null,
      headSha: meta.defaultBranchRef?.target?.oid ?? null,
      pushedAt,
      organizationId,
    },
  });

  // Per-user link: track contribution counts + lastContributedAt here, never on
  // the shared Repository row. Detect a count change for skip-untouched.
  const link = await prisma.userRepository.findUnique({
    where: { userId_repositoryId: { userId, repositoryId: repository.id } },
    select: { syncCursor: true },
  });
  const prevCount =
    link?.syncCursor && typeof link.syncCursor === "object" && !Array.isArray(link.syncCursor)
      ? Number((link.syncCursor as Record<string, unknown>).contributionCount ?? NaN)
      : NaN;
  const countChanged = prevCount !== contributionCount;

  const mergedCursor =
    link?.syncCursor && typeof link.syncCursor === "object" && !Array.isArray(link.syncCursor)
      ? { ...(link.syncCursor as Record<string, unknown>), contributionCount }
      : { contributionCount };

  await prisma.userRepository.upsert({
    where: { userId_repositoryId: { userId, repositoryId: repository.id } },
    create: {
      userId,
      repositoryId: repository.id,
      firstContributedAt: new Date(),
      lastContributedAt: new Date(),
      syncCursor: mergedCursor,
    },
    update: {
      lastContributedAt: new Date(),
      syncCursor: mergedCursor,
    },
  });

  return { repository, changed: pushedChanged || countChanged };
}

function monthsAgo(from: Date, months: number): Date {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
