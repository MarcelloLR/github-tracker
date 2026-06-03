// Pure (server-safe) transforms shared by the dashboard page. No Prisma/IO here
// so it stays trivially testable; the page does the DB reads and passes rows in.

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
