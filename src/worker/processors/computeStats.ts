import type { ContributionType, Prisma, StatScope } from "@prisma/client";
import type { JobContext } from "@/worker/runJob";
import { prisma } from "@/lib/db";
import { getQueue, QUEUE_NAMES, withCorrelation } from "@/lib/queue";

interface ComputeStatsData {
  userId: string;
  repositoryId?: string;
}

interface DailyBucket {
  prsOpened: number;
  prsMerged: number;
  reviews: number;
  issuesOpened: number;
  commits: number;
  additions: number;
  deletions: number;
}

function emptyBucket(): DailyBucket {
  return {
    prsOpened: 0,
    prsMerged: 0,
    reviews: 0,
    issuesOpened: 0,
    commits: 0,
    additions: 0,
    deletions: 0,
  };
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Stage 3 (DB-only). Recompute the user's StatSnapshot rollups from their
 * Contribution facts: one row per (userId, scope, scopeId, date) for GLOBAL
 * (scopeId null), REPO (scopeId = repositoryId) and ORG (scopeId =
 * organizationId). Idempotent: rewrites the user's snapshots from scratch.
 *
 * Note: `repositoryId` in the job is advisory — GLOBAL/ORG rollups need all of
 * the user's facts, so we recompute the full set. A targeted incremental
 * recompute is a documented follow-up.
 */
export async function computeStats(ctx: JobContext): Promise<void> {
  const { job, log, correlationId } = ctx;
  const { userId } = job.data as ComputeStatsData;

  const contributions = await prisma.contribution.findMany({
    where: { userId },
    select: {
      type: true,
      occurredOn: true,
      createdAt: true,
      mergedAt: true,
      additions: true,
      deletions: true,
      reviewCount: true,
      repositoryId: true,
      repository: { select: { organizationId: true } },
    },
  });

  // scope|scopeId|dayMs -> bucket
  const buckets = new Map<string, DailyBucket>();

  const bump = (
    scope: StatScope,
    scopeId: string | null,
    day: Date,
    mutate: (b: DailyBucket) => void,
  ) => {
    const key = `${scope}|${scopeId ?? ""}|${day.getTime()}`;
    let b = buckets.get(key);
    if (!b) {
      b = emptyBucket();
      buckets.set(key, b);
    }
    mutate(b);
  };

  const applyAll = (day: Date, repositoryId: string, orgId: string | null, f: (b: DailyBucket) => void) => {
    bump("GLOBAL", null, day, f);
    bump("REPO", repositoryId, day, f);
    if (orgId) bump("ORG", orgId, day, f);
  };

  for (const c of contributions) {
    const day = utcMidnight(c.occurredOn);
    const orgId = c.repository?.organizationId ?? null;
    const type = c.type as ContributionType;

    if (type === "PR_OPENED") {
      // Opened (+ churn) counts on the creation day; merged counts on the merge
      // day. We use createdAt/mergedAt directly so the buckets are correct
      // regardless of which day `occurredOn` was set to.
      applyAll(utcMidnight(c.createdAt), c.repositoryId, orgId, (b) => {
        b.prsOpened += 1;
        // Note: daily additions/deletions churn is attributed to COMMIT facts
        // only (below) to avoid double-counting the same lines via PR diffs.
      });
      if (c.mergedAt) {
        applyAll(utcMidnight(c.mergedAt), c.repositoryId, orgId, (b) => {
          b.prsMerged += 1;
        });
      }
    } else if (type === "REVIEW") {
      applyAll(day, c.repositoryId, orgId, (b) => {
        b.reviews += 1;
      });
    } else if (type === "ISSUE_OPENED") {
      applyAll(day, c.repositoryId, orgId, (b) => {
        b.issuesOpened += 1;
      });
    } else if (type === "COMMIT") {
      applyAll(day, c.repositoryId, orgId, (b) => {
        // reviewCount carries the per-day commit count (see syncRepo).
        b.commits += c.reviewCount ?? 1;
        b.additions += c.additions ?? 0;
        b.deletions += c.deletions ?? 0;
      });
    }
  }

  // Build the upsert rows.
  const rows: Prisma.StatSnapshotCreateManyInput[] = [];
  for (const [key, b] of buckets) {
    const [scope, scopeId, dayMs] = key.split("|");
    rows.push({
      userId,
      scope: scope as StatScope,
      scopeId: scopeId === "" ? null : scopeId,
      date: new Date(Number(dayMs)),
      ...b,
    });
  }

  // Rewrite the user's snapshots idempotently: clear then re-insert. Wrapped in
  // a transaction so charts never see a partially-written state.
  await prisma.$transaction([
    prisma.statSnapshot.deleteMany({ where: { userId } }),
    ...(rows.length
      ? [prisma.statSnapshot.createMany({ data: rows, skipDuplicates: true })]
      : []),
  ]);
  log.debug({ snapshotRows: rows.length }, "computeStats.snapshots_written");

  // Profile summary is throttled to material changes; enqueue best-effort.
  await getQueue(QUEUE_NAMES.summaryProfile).add(
    "profile",
    withCorrelation({ userId }, correlationId),
    { jobId: `summary-profile-${userId}-${Date.now()}` },
  );
}
