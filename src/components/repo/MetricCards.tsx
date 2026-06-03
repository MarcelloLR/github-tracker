import { StatCard, StatGrid } from "@/components/ui";

export interface MetricItem {
  label: string;
  value: string;
  sub?: string;
}

/** Responsive grid of headline metric tiles. Presentational only. */
export default function MetricCards({ items }: { items: MetricItem[] }) {
  return (
    <StatGrid>
      {items.map((m) => (
        <StatCard key={m.label} value={m.value} label={m.label} sub={m.sub} />
      ))}
    </StatGrid>
  );
}
