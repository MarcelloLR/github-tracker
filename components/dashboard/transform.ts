// Pure (server-safe) transforms shared by the dashboard page. No Prisma/IO here
// so it stays trivially testable; the page does the DB reads and passes rows in.

import type { GoalProgress } from "./Goals";
import type { HeatmapDay } from "./CalendarHeatmap";
import type { TrendPoint } from "./ContributionChart";

export interface SnapshotRow {
  date: Date;
  prsOpened: number;
  prsMerged: number;
  reviews: number;
  issuesOpened: number;
  commits: number;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Build per-day heatmap input from GLOBAL daily StatSnapshot rows. */
export function snapshotsToHeatmap(rows: SnapshotRow[]): HeatmapDay[] {
  return rows.map((r) => ({
    date: isoDay(r.date),
    count: r.prsOpened + r.reviews + r.issuesOpened + r.commits,
  }));
}

/** Distinct active days (any qualifying contribution) for streak computation. */
export function activeDatesFromSnapshots(rows: SnapshotRow[]): Date[] {
  return rows
    .filter((r) => r.prsOpened + r.reviews + r.issuesOpened + r.commits > 0)
    .map((r) => r.date);
}

/**
 * Roll daily snapshots up to weekly trend points (one per ISO week, labelled
 * by the week's Monday) for the Recharts area chart.
 */
export function snapshotsToWeeklyTrend(rows: SnapshotRow[]): TrendPoint[] {
  const byWeek = new Map<string, TrendPoint>();
  for (const r of rows) {
    const d = new Date(
      Date.UTC(r.date.getUTCFullYear(), r.date.getUTCMonth(), r.date.getUTCDate()),
    );
    // Snap to Monday of the week.
    const dow = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dow);
    const key = isoDay(d);
    const pt = byWeek.get(key) ?? {
      date: key,
      prs: 0,
      reviews: 0,
      issues: 0,
      commits: 0,
    };
    pt.prs += r.prsOpened;
    pt.reviews += r.reviews;
    pt.issues += r.issuesOpened;
    pt.commits += r.commits;
    byWeek.set(key, pt);
  }
  return [...byWeek.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** UTC start of the current week (Monday) / month for goal windows. */
export function periodStart(period: "WEEKLY" | "MONTHLY", now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === "MONTHLY") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

export interface GoalRow {
  id: string;
  metric: GoalProgress["metric"];
  period: GoalProgress["period"];
  target: number;
}

/**
 * Compute current-period progress for each goal from GLOBAL daily snapshots.
 * Sums the relevant metric column over the goal's period window.
 */
export function computeGoalProgress(
  goals: GoalRow[],
  rows: SnapshotRow[],
  now: Date,
): GoalProgress[] {
  return goals.map((g) => {
    const start = periodStart(g.period, now);
    let current = 0;
    for (const r of rows) {
      if (r.date < start) continue;
      switch (g.metric) {
        case "PRS":
          current += r.prsOpened;
          break;
        case "REVIEWS":
          current += r.reviews;
          break;
        case "ISSUES":
          current += r.issuesOpened;
          break;
        case "COMMITS":
          current += r.commits;
          break;
      }
    }
    return { id: g.id, metric: g.metric, period: g.period, target: g.target, current };
  });
}
