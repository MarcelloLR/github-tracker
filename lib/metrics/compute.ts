import { percentile } from "@/lib/metrics/percentiles";

export type ContribType = "PR_OPENED" | "PR_MERGED" | "REVIEW" | "ISSUE_OPENED" | "COMMIT";

export interface ContributionLike {
  type: ContribType;
  mergedAt: Date | null;
  cycleTimeSec: number | null;
  additions: number | null;
  deletions: number | null;
}

export interface Metrics {
  prsOpened: number;
  prsMerged: number;
  mergeRate: number | null;
  reviews: number;
  issuesOpened: number;
  commits: number;
  additions: number;
  deletions: number;
  cycleTimeP50: number | null;
  cycleTimeP90: number | null;
}

/**
 * Roll a set of Contribution facts into the headline metrics used per-repo,
 * per-org, and globally. No GitHub calls — operates on already-synced facts.
 */
export function computeMetrics(contribs: ContributionLike[]): Metrics {
  const count = (t: ContribType) => contribs.filter((c) => c.type === t).length;
  const sum = (f: (c: ContributionLike) => number) => contribs.reduce((a, c) => a + f(c), 0);

  const prsOpened = count("PR_OPENED");
  const prsMerged = contribs.filter((c) => c.type === "PR_OPENED" && c.mergedAt !== null).length;
  const cycleTimes = contribs
    .filter((c): c is ContributionLike & { cycleTimeSec: number } => c.cycleTimeSec != null)
    .map((c) => c.cycleTimeSec);

  return {
    prsOpened,
    prsMerged,
    mergeRate: prsOpened > 0 ? prsMerged / prsOpened : null,
    reviews: count("REVIEW"),
    issuesOpened: count("ISSUE_OPENED"),
    commits: count("COMMIT"),
    additions: sum((c) => c.additions ?? 0),
    deletions: sum((c) => c.deletions ?? 0),
    cycleTimeP50: percentile(cycleTimes, 50),
    cycleTimeP90: percentile(cycleTimes, 90),
  };
}
