"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export interface TimelinePoint {
  /** ISO date string (UTC day bucket). */
  date: string;
  prs: number;
  reviews: number;
  issues: number;
  commits: number;
}

const SERIES: { key: keyof Omit<TimelinePoint, "date">; label: string; color: string }[] = [
  { key: "prs", label: "PRs", color: "#6366f1" },
  { key: "reviews", label: "Reviews", color: "#10b981" },
  { key: "issues", label: "Issues", color: "#f59e0b" },
  { key: "commits", label: "Commits", color: "#ef4444" },
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Stacked-area contribution timeline. Data is pre-computed on the server
 * (from StatSnapshot REPO scope or aggregated Contributions) — this component
 * only renders; it never touches the network.
 */
export default function ContributionTimelineChart({ data }: { data: TimelinePoint[] }) {
  if (data.length === 0) {
    return (
      <p style={{ opacity: 0.6, fontStyle: "italic" }}>
        No contribution activity recorded yet.
      </p>
    );
  }

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            minTickGap={24}
            fontSize={12}
          />
          <YAxis allowDecimals={false} fontSize={12} />
          <Tooltip labelFormatter={(v) => fmtDate(String(v))} />
          <Legend />
          {SERIES.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stackId="1"
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.35}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
