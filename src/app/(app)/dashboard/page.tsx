import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeMetrics, type ContribType } from "@/lib/metrics/compute";
import { computeStreaks } from "@/lib/metrics/streaks";

import MetricCards from "@/components/dashboard/MetricCards";
import CalendarHeatmap from "@/components/dashboard/CalendarHeatmap";
import ContributionChart from "@/components/dashboard/ContributionChart";
import Streaks from "@/components/dashboard/Streaks";
import TopList, { type TopItem } from "@/components/dashboard/TopList";
import RefreshButton from "@/components/dashboard/RefreshButton";
import styles from "@/components/dashboard/dashboard.module.css";
import {
  activeDatesFromSnapshots,
  snapshotsToHeatmap,
  snapshotsToWeeklyTrend,
  type SnapshotRow,
} from "@/components/dashboard/transform";

// Always reflect the freshest synced data (router.refresh after a sync).
export const dynamic = "force-dynamic";

const HEATMAP_DAYS = 371; // ~53 weeks for the calendar window.

function formatSyncedAt(d: Date | null): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export default async function DashboardPage() {
  const session = await auth();
  // The (app) layout already redirects unauthenticated users; guard for types.
  const userId = session?.user?.id;
  if (!userId) return null;

  const since = new Date(Date.now() - HEATMAP_DAYS * 86_400_000);

  const [contribs, snapshots, syncState] = await Promise.all([
    prisma.contribution.findMany({
      where: { userId },
      select: {
        type: true,
        mergedAt: true,
        cycleTimeSec: true,
        additions: true,
        deletions: true,
        repositoryId: true,
      },
    }),
    prisma.statSnapshot.findMany({
      where: { userId, scope: "GLOBAL", date: { gte: since } },
      orderBy: { date: "asc" },
      select: {
        date: true,
        prsOpened: true,
        prsMerged: true,
        reviews: true,
        issuesOpened: true,
        commits: true,
      },
    }),
    prisma.syncState.findUnique({ where: { userId } }),
  ]);

  const metrics = computeMetrics(
    contribs.map((c) => ({
      type: c.type as ContribType,
      mergedAt: c.mergedAt,
      cycleTimeSec: c.cycleTimeSec,
      additions: c.additions,
      deletions: c.deletions,
    })),
  );

  const snapshotRows: SnapshotRow[] = snapshots;
  const now = new Date();
  const heatmap = snapshotsToHeatmap(snapshotRows);
  const trend = snapshotsToWeeklyTrend(snapshotRows);
  const streaks = computeStreaks(activeDatesFromSnapshots(snapshotRows), now);

  // Top repos by contribution count.
  const repoCounts = new Map<string, number>();
  for (const c of contribs) {
    repoCounts.set(c.repositoryId, (repoCounts.get(c.repositoryId) ?? 0) + 1);
  }
  const repoIds = [...repoCounts.keys()];
  const repos = repoIds.length
    ? await prisma.repository.findMany({
        where: { id: { in: repoIds } },
        select: {
          id: true,
          owner: true,
          name: true,
          nameWithOwner: true,
          organizationId: true,
          organization: { select: { login: true, name: true } },
        },
      })
    : [];
  const repoById = new Map(repos.map((r) => [r.id, r]));

  const topRepos: TopItem[] = repos
    .map((r) => ({
      key: r.id,
      name: r.nameWithOwner,
      count: repoCounts.get(r.id) ?? 0,
      href: `/repos/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.name)}`,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Top orgs by summed contribution count across their repos.
  const orgCounts = new Map<string, { count: number; login: string; name: string | null }>();
  for (const [repoId, count] of repoCounts) {
    const r = repoById.get(repoId);
    if (!r?.organizationId || !r.organization) continue;
    const existing = orgCounts.get(r.organizationId);
    if (existing) existing.count += count;
    else
      orgCounts.set(r.organizationId, {
        count,
        login: r.organization.login,
        name: r.organization.name,
      });
  }
  const topOrgs: TopItem[] = [...orgCounts.values()]
    .map((o) => ({
      key: o.login,
      name: o.name ?? o.login,
      sub: o.name ? `@${o.login}` : undefined,
      count: o.count,
      href: `/orgs/${encodeURIComponent(o.login)}`,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const hasAnyData = contribs.length > 0 || snapshotRows.length > 0;

  return (
    <main>
      <div className={styles.sectionHeader}>
        <h1 className={styles.sectionTitle} style={{ fontSize: "1.5rem" }}>
          Dashboard
        </h1>
        <RefreshButton lastSyncedAt={formatSyncedAt(syncState?.lastIncrSyncAt ?? null)} />
      </div>

      {!hasAnyData ? (
        <div className={styles.empty}>
          No contributions synced yet. Hit <strong>Refresh now</strong> to pull your
          GitHub activity — the dashboard fills in once the sync completes.
        </div>
      ) : null}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Headline metrics</h2>
        <MetricCards metrics={metrics} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Contribution calendar</h2>
        </div>
        {heatmap.length ? (
          <CalendarHeatmap data={heatmap} />
        ) : (
          <div className={styles.empty}>No daily activity recorded for the last year yet.</div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Weekly trend</h2>
        {trend.length ? (
          <ContributionChart data={trend} />
        ) : (
          <div className={styles.empty}>Trend chart appears once daily stats are computed.</div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Active streak</h2>
        <Streaks current={streaks.current} longest={streaks.longest} />
      </section>

      <div className={styles.twoCol}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Top repositories</h2>
          <TopList items={topRepos} emptyLabel="No contributed repositories yet." />
        </section>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Top organizations</h2>
          <TopList items={topOrgs} emptyLabel="No organizations yet." />
        </section>
      </div>
    </main>
  );
}
