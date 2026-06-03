import type { Metrics } from "@/lib/metrics/compute";
import type { MetricItem } from "./MetricCards";
import type { TimelinePoint } from "./ContributionTimelineChart";
import { fmtCompact, fmtDuration, fmtInt, fmtPercent } from "./format";

/** Map computed Metrics into headline metric tiles shared by repo/org views. */
export function metricCards(m: Metrics): MetricItem[] {
  return [
    { label: "PRs opened", value: fmtInt(m.prsOpened) },
    {
      label: "PRs merged",
      value: fmtInt(m.prsMerged),
      sub: m.mergeRate != null ? `${fmtPercent(m.mergeRate)} merge rate` : undefined,
    },
    { label: "Reviews", value: fmtInt(m.reviews) },
    { label: "Issues opened", value: fmtInt(m.issuesOpened) },
    { label: "Commits", value: fmtInt(m.commits) },
    {
      label: "Code churn",
      value: `+${fmtCompact(m.additions)} / -${fmtCompact(m.deletions)}`,
    },
    { label: "Cycle time p50", value: fmtDuration(m.cycleTimeP50) },
    { label: "Cycle time p90", value: fmtDuration(m.cycleTimeP90) },
  ];
}

/** Minimal shape of a Contribution needed to build a timeline. */
export interface TimelineContribution {
  type: "PR_OPENED" | "PR_MERGED" | "REVIEW" | "ISSUE_OPENED" | "COMMIT";
  occurredOn: Date;
}

/** Pre-rolled daily StatSnapshot shape used for repo timelines. */
export interface SnapshotRow {
  date: Date;
  prsOpened: number;
  reviews: number;
  issuesOpened: number;
  commits: number;
}

function dayKey(d: Date): string {
  // UTC midnight ISO date (YYYY-MM-DD), matching occurredOn / snapshot buckets.
  return d.toISOString().slice(0, 10);
}

/** Build a sorted, gap-free-enough timeline from StatSnapshot rows. */
export function timelineFromSnapshots(rows: SnapshotRow[]): TimelinePoint[] {
  return rows
    .map((r) => ({
      date: dayKey(r.date),
      prs: r.prsOpened,
      reviews: r.reviews,
      issues: r.issuesOpened,
      commits: r.commits,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Fallback timeline aggregated directly from Contribution facts by day. */
export function timelineFromContributions(
  contribs: TimelineContribution[],
): TimelinePoint[] {
  const byDay = new Map<string, TimelinePoint>();
  for (const c of contribs) {
    const key = dayKey(c.occurredOn);
    let pt = byDay.get(key);
    if (!pt) {
      pt = { date: key, prs: 0, reviews: 0, issues: 0, commits: 0 };
      byDay.set(key, pt);
    }
    switch (c.type) {
      case "PR_OPENED":
      case "PR_MERGED":
        pt.prs += 1;
        break;
      case "REVIEW":
        pt.reviews += 1;
        break;
      case "ISSUE_OPENED":
        pt.issues += 1;
        break;
      case "COMMIT":
        pt.commits += 1;
        break;
    }
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}
