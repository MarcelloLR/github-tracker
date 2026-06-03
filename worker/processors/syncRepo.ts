import { DelayedError, type Job } from "bullmq";
import { createHash } from "node:crypto";
import type { ContributionState, ContributionType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";
import { getUserToken } from "@/lib/github/token";
import {
  fetchCommitHistory,
  fetchRepoMetadata,
  fetchViewer,
  githubGraphql,
  searchIssues,
  type CommitNode,
  type GithubGraphql,
  type SearchIssueOrPr,
} from "@/lib/github/graphql";
import { rateLimitDelayMs } from "@/lib/github/rateLimit";

interface SyncRepoData {
  userId: string;
  repositoryId: string;
}

interface RepoCursor {
  // ISO timestamp marking the previous sync boundary (we re-scan from here).
  lastSyncAt?: string;
  commitCursor?: string;
  contributionCount?: number;
  [k: string]: unknown;
}

// Re-scan window overlap so an item updated right at the boundary is not missed.
const OVERLAP_MS = 24 * 60 * 60 * 1000; // 1 day
// Hard page caps so a huge backlog can't run a single job unbounded (deeper
// history backfill is intentionally simplified — see PR notes).
const MAX_PAGES = 10;
const PAGE_SIZE = 50;

export async function syncRepo(job: Job): Promise<void> {
  const { userId, repositoryId } = job.data as SyncRepoData;

  const link = await prisma.userRepository.findUnique({
    where: { userId_repositoryId: { userId, repositoryId } },
    select: { syncCursor: true },
  });
  const repo = await prisma.repository.findUnique({
    where: { id: repositoryId },
    select: {
      id: true,
      owner: true,
      name: true,
      nameWithOwner: true,
      readmeHash: true,
      topics: true,
    },
  });
  if (!repo) return; // repo was removed between discover and sync

  const cursor = (link?.syncCursor as RepoCursor | null) ?? {};
  // since: re-scan from the previous boundary minus overlap; null means full window.
  const since = cursor.lastSyncAt
    ? new Date(new Date(cursor.lastSyncAt).getTime() - OVERLAP_MS)
    : null;
  const now = new Date();

  // Gate before issuing any GitHub calls.
  const delay = await rateLimitDelayMs(userId);
  if (delay > 0) {
    await job.moveToDelayed(Date.now() + delay, job.token);
    throw new DelayedError();
  }

  const token = await getUserToken(userId);
  const client = githubGraphql(token);
  const viewer = await fetchViewer(client, userId);

  // --- PRs (author), issues (author), reviews (reviewed-by) -----------------
  const prNodes = await collectIssueSearch(
    client,
    userId,
    `repo:${repo.nameWithOwner} author:${viewer.login} type:pr`,
    since,
  );
  const issueNodes = await collectIssueSearch(
    client,
    userId,
    `repo:${repo.nameWithOwner} author:${viewer.login} type:issue`,
    since,
  );
  const reviewedNodes = await collectIssueSearch(
    client,
    userId,
    `repo:${repo.nameWithOwner} reviewed-by:${viewer.login} type:pr`,
    since,
  );

  await upsertPullRequests(userId, repositoryId, prNodes);
  await upsertIssues(userId, repositoryId, issueNodes);
  await upsertReviews(userId, repositoryId, reviewedNodes);

  // --- Commits (author id, default branch history) --------------------------
  const commits = await collectCommits(client, userId, repo.owner, repo.name, viewer.id, since);
  await upsertCommitDays(userId, repositoryId, commits);

  // --- Refresh shared repo metadata + languages (ETag-aware not needed for the
  //     GraphQL metadata read; readmeHash/headSha/topics drive summary regen) -
  const metaChanged = await refreshRepoMetadata(client, userId, repo);

  // --- Advance the per-user cursor -----------------------------------------
  const newCursor: RepoCursor = { ...cursor, lastSyncAt: now.toISOString() };
  await prisma.userRepository.update({
    where: { userId_repositoryId: { userId, repositoryId } },
    data: { lastSyncedAt: now, syncCursor: newCursor as unknown as Prisma.InputJsonValue },
  });

  // --- Downstream jobs ------------------------------------------------------
  await getQueue(QUEUE_NAMES.computeStats).add(
    "compute",
    { userId, repositoryId },
    { jobId: `compute-stats-${userId}-${repositoryId}-${Date.now()}` },
  );
  if (metaChanged) {
    await getQueue(QUEUE_NAMES.summaryMetadata).add(
      "metadata",
      { repositoryId },
      { jobId: `summary-metadata-${repositoryId}-${Date.now()}` },
    );
  }
}

// ---------------------------------------------------------------------------
// Search collection (paged, with date filter + rate-limit gate between pages)
// ---------------------------------------------------------------------------

async function collectIssueSearch(
  client: GithubGraphql,
  userId: string,
  baseQuery: string,
  since: Date | null,
): Promise<SearchIssueOrPr[]> {
  // GitHub search supports a date range filter on `updated`/`created`. Use
  // `updated` so a PR that merged after creation (outside the window) is still
  // re-scanned; on first sync (since == null) fetch the whole window.
  const query = since
    ? `${baseQuery} updated:>=${since.toISOString().slice(0, 10)}`
    : baseQuery;

  const out: SearchIssueOrPr[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const interDelay = await rateLimitDelayMs(userId);
    if (interDelay > 0) break; // stop paging; next sync picks up the rest
    const res = await searchIssues(client, userId, query, PAGE_SIZE, after);
    out.push(...res.nodes);
    if (!res.hasNextPage || !res.endCursor) break;
    after = res.endCursor;
  }
  return out;
}

async function collectCommits(
  client: GithubGraphql,
  userId: string,
  owner: string,
  name: string,
  authorId: string,
  since: Date | null,
): Promise<CommitNode[]> {
  const out: CommitNode[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const interDelay = await rateLimitDelayMs(userId);
    if (interDelay > 0) break;
    const res = await fetchCommitHistory(client, userId, {
      owner,
      name,
      authorId,
      since: since ? since.toISOString() : null,
      first: 100,
      after,
    });
    out.push(...res.nodes);
    if (!res.hasNextPage || !res.endCursor) break;
    after = res.endCursor;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Upserts (idempotent on (userId, type, githubNodeId))
// ---------------------------------------------------------------------------

function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayString(d: Date): string {
  return utcDay(d).toISOString().slice(0, 10);
}

async function upsertContribution(
  userId: string,
  type: ContributionType,
  githubNodeId: string,
  data: Omit<Prisma.ContributionCreateInput, "user" | "repository" | "type" | "githubNodeId">,
  repositoryId: string,
): Promise<void> {
  await prisma.contribution.upsert({
    where: { userId_type_githubNodeId: { userId, type, githubNodeId } },
    create: {
      user: { connect: { id: userId } },
      repository: { connect: { id: repositoryId } },
      type,
      githubNodeId,
      ...data,
    },
    update: {
      repository: { connect: { id: repositoryId } },
      ...data,
    },
  });
}

function mapState(s: "OPEN" | "CLOSED" | "MERGED"): ContributionState {
  if (s === "MERGED") return "MERGED";
  if (s === "CLOSED") return "CLOSED";
  return "OPEN";
}

async function upsertPullRequests(
  userId: string,
  repositoryId: string,
  nodes: SearchIssueOrPr[],
): Promise<void> {
  for (const n of nodes) {
    if (n.__typename !== "PullRequest") continue;
    const createdAt = new Date(n.createdAt);
    const mergedAt = n.mergedAt ? new Date(n.mergedAt) : null;
    const closedAt = n.closedAt ? new Date(n.closedAt) : null;
    const cycleTimeSec = mergedAt
      ? Math.max(0, Math.round((mergedAt.getTime() - createdAt.getTime()) / 1000))
      : null;
    await upsertContribution(
      userId,
      "PR_OPENED",
      n.id,
      {
        state: mergedAt ? "MERGED" : mapState(n.state),
        title: n.title,
        number: n.number,
        additions: n.additions,
        deletions: n.deletions,
        reviewCount: n.reviews.totalCount,
        createdAt,
        mergedAt,
        closedAt,
        cycleTimeSec,
        // Bucket on merge day if merged, else creation day, for timeline rollups.
        occurredOn: utcDay(mergedAt ?? createdAt),
      },
      repositoryId,
    );
  }
}

async function upsertIssues(
  userId: string,
  repositoryId: string,
  nodes: SearchIssueOrPr[],
): Promise<void> {
  for (const n of nodes) {
    if (n.__typename !== "Issue") continue;
    const createdAt = new Date(n.createdAt);
    const closedAt = n.closedAt ? new Date(n.closedAt) : null;
    await upsertContribution(
      userId,
      "ISSUE_OPENED",
      n.id,
      {
        state: mapState(n.state),
        title: n.title,
        number: n.number,
        createdAt,
        closedAt,
        occurredOn: utcDay(createdAt),
      },
      repositoryId,
    );
  }
}

async function upsertReviews(
  userId: string,
  repositoryId: string,
  nodes: SearchIssueOrPr[],
): Promise<void> {
  for (const n of nodes) {
    if (n.__typename !== "PullRequest") continue;
    // One REVIEW fact per reviewed PR (keyed by the PR node id). Approximates
    // "reviews given" at PR granularity — see PR notes for the simplification.
    const createdAt = new Date(n.createdAt);
    await upsertContribution(
      userId,
      "REVIEW",
      n.id,
      {
        state: mapState(n.state),
        title: n.title,
        number: n.number,
        reviewCount: 1,
        createdAt,
        occurredOn: utcDay(createdAt),
      },
      repositoryId,
    );
  }
}

async function upsertCommitDays(
  userId: string,
  repositoryId: string,
  commits: CommitNode[],
): Promise<void> {
  // Aggregate commits per UTC day; one COMMIT fact per day with a stable
  // synthetic node id so re-runs stay idempotent.
  const byDay = new Map<string, { count: number; additions: number; deletions: number }>();
  for (const c of commits) {
    const day = dayString(new Date(c.committedDate));
    const agg = byDay.get(day) ?? { count: 0, additions: 0, deletions: 0 };
    agg.count += 1;
    agg.additions += c.additions ?? 0;
    agg.deletions += c.deletions ?? 0;
    byDay.set(day, agg);
  }

  for (const [day, agg] of byDay) {
    const nodeId = `commit:${repositoryId}:${day}`;
    await upsertContribution(
      userId,
      "COMMIT",
      nodeId,
      {
        additions: agg.additions,
        deletions: agg.deletions,
        // reviewCount field reused to carry the per-day commit count.
        reviewCount: agg.count,
        createdAt: new Date(`${day}T00:00:00.000Z`),
        occurredOn: new Date(`${day}T00:00:00.000Z`),
      },
      repositoryId,
    );
  }
}

// ---------------------------------------------------------------------------
// Shared repo metadata + language refresh
// ---------------------------------------------------------------------------

async function refreshRepoMetadata(
  client: GithubGraphql,
  userId: string,
  repo: { id: string; owner: string; name: string; readmeHash: string | null; topics: string[] },
): Promise<boolean> {
  const meta = await fetchRepoMetadata(client, userId, repo.owner, repo.name);
  if (!meta) return false;

  const readmeText = meta.object?.text ?? "";
  const readmeHash = readmeText ? sha256(readmeText) : null;
  const topics = meta.repositoryTopics.nodes.map((n) => n.topic.name);
  const headSha = meta.defaultBranchRef?.target?.oid ?? null;

  // Compare incoming languages against stored ones BEFORE rewriting them, so we
  // only flag a real change (drives summary-metadata regen).
  const langs = meta.languages.edges.map((e) => ({ language: e.node.name, bytes: e.size }));
  const prevLangs = await prisma.repoLanguage.findMany({
    where: { repositoryId: repo.id },
    select: { language: true, bytes: true },
  });
  const langChanged = !sameLanguages(prevLangs, langs);

  // Refresh shared language byte counts (delete-then-insert keeps it simple and
  // idempotent; these are user-agnostic shared rows).
  await prisma.$transaction([
    prisma.repoLanguage.deleteMany({ where: { repositoryId: repo.id } }),
    ...(langs.length
      ? [
          prisma.repoLanguage.createMany({
            data: langs.map((l) => ({ repositoryId: repo.id, ...l })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  const readmeChanged = readmeHash !== repo.readmeHash;
  const topicsChanged = !sameStringSet(topics, repo.topics);

  await prisma.repository.update({
    where: { id: repo.id },
    data: {
      description: meta.description,
      stargazers: meta.stargazerCount,
      primaryLang: meta.primaryLanguage?.name ?? null,
      topics,
      license: meta.licenseInfo?.spdxId ?? null,
      defaultBranch: meta.defaultBranchRef?.name ?? null,
      headSha,
      readmeHash,
      pushedAt: meta.pushedAt ? new Date(meta.pushedAt) : null,
    },
  });

  return readmeChanged || topicsChanged || langChanged;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

function sameLanguages(
  a: { language: string; bytes: number }[],
  b: { language: string; bytes: number }[],
): boolean {
  if (a.length !== b.length) return false;
  const map = new Map(a.map((l) => [l.language, l.bytes]));
  return b.every((l) => map.get(l.language) === l.bytes);
}
