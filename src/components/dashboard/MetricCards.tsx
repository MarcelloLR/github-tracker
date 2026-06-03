import type { Metrics } from "@/lib/metrics/compute";
import { StatCard, StatGrid } from "@/components/ui";

/** Human-friendly seconds → "2.3d" / "5h" / "12m". */
function fmtDuration(sec: number | null): string {
  if (sec == null) return "—";
  if (sec >= 86_400) return `${(sec / 86_400).toFixed(1)}d`;
  if (sec >= 3_600) return `${Math.round(sec / 3_600)}h`;
  if (sec >= 60) return `${Math.round(sec / 60)}m`;
  return `${Math.round(sec)}s`;
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Headline metric cards shared by the dashboard and profile pages. Pure
 * presentational — receives already-computed metrics as props.
 */
export default function MetricCards({ metrics }: { metrics: Metrics }) {
  const cards: { label: string; value: string }[] = [
    { label: "PRs opened", value: fmtNum(metrics.prsOpened) },
    { label: "PRs merged", value: fmtNum(metrics.prsMerged) },
    {
      label: "Merge rate",
      value: metrics.mergeRate == null ? "—" : `${Math.round(metrics.mergeRate * 100)}%`,
    },
    { label: "Reviews", value: fmtNum(metrics.reviews) },
    { label: "Issues opened", value: fmtNum(metrics.issuesOpened) },
    { label: "Commits", value: fmtNum(metrics.commits) },
    { label: "Cycle time p50", value: fmtDuration(metrics.cycleTimeP50) },
    { label: "Cycle time p90", value: fmtDuration(metrics.cycleTimeP90) },
    { label: "Lines added", value: fmtNum(metrics.additions) },
    { label: "Lines removed", value: fmtNum(metrics.deletions) },
  ];

  return (
    <StatGrid>
      {cards.map((c) => (
        <StatCard key={c.label} value={c.value} label={c.label} />
      ))}
    </StatGrid>
  );
}
