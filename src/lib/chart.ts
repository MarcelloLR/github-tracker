/**
 * Unified chart palette — single source of truth for all data-viz colors.
 *
 * Before this, the dashboard ContributionChart and the repo
 * ContributionTimelineChart used *different* colors for the same series
 * (e.g. commits/PRs/reviews/issues). Everything now imports from here so the
 * meaning of a color is consistent across the whole app. Colors are concrete
 * hex (Recharts writes them to SVG fill/stroke attributes, which don't resolve
 * CSS var()), and tuned to read well on the dark canvas.
 */

export type ContribSeriesKey = "prs" | "reviews" | "issues" | "commits";

export interface ContribSeries {
  key: ContribSeriesKey;
  label: string;
  color: string;
}

/** Canonical contribution series order + colors (PRs, Reviews, Issues, Commits). */
export const CONTRIB_SERIES: ContribSeries[] = [
  { key: "prs", label: "PRs", color: "#2f81f7" },
  { key: "reviews", label: "Reviews", color: "#a371f7" },
  { key: "issues", label: "Issues", color: "#d29922" },
  { key: "commits", label: "Commits", color: "#8b949e" },
];

/** Lookup a single series color by key. */
export const CONTRIB_COLORS: Record<ContribSeriesKey, string> =
  CONTRIB_SERIES.reduce(
    (acc, s) => {
      acc[s.key] = s.color;
      return acc;
    },
    {} as Record<ContribSeriesKey, string>,
  );

/** Categorical palette for language mix bars/legends (cycles if exhausted). */
export const LANGUAGE_COLORS = [
  "#2f81f7",
  "#3fb950",
  "#d29922",
  "#f85149",
  "#a371f7",
  "#ec6cb9",
  "#39c5cf",
  "#e3b341",
  "#6e7681",
];

/** GitHub-style contribution heatmap, dark-mode intensity ramp (level 0..4). */
export const HEATMAP_LEVELS = [
  "#161b22",
  "#0e4429",
  "#006d32",
  "#26a641",
  "#39d353",
];

/** Shared Recharts axis/grid/tooltip theme so every chart matches the tokens. */
export const CHART_THEME = {
  grid: "#232323",
  axis: "#a1a1a1",
  axisLine: "#343434",
  tooltipBg: "#161616",
  tooltipBorder: "#343434",
  tooltipText: "#ededed",
} as const;

/** Pick a language color by index, wrapping around the palette. */
export function languageColor(index: number): string {
  return LANGUAGE_COLORS[index % LANGUAGE_COLORS.length];
}
