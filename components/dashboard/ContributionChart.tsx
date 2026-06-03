"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface TrendPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  prs: number;
  reviews: number;
  issues: number;
  commits: number;
}

const SERIES = [
  { key: "commits", label: "Commits", color: "#8b949e" },
  { key: "prs", label: "PRs", color: "#2da44e" },
  { key: "reviews", label: "Reviews", color: "#8250df" },
  { key: "issues", label: "Issues", color: "#bf8700" },
] as const;

/** Stacked area trend of weekly contribution counts (Recharts, client-only). */
export default function ContributionChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeOpacity={0.12} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, opacity: 0.6 }}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
        />
        <YAxis
          tick={{ fontSize: 11, opacity: 0.6 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={36}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid rgba(128,128,128,0.3)",
          }}
        />
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
  );
}
