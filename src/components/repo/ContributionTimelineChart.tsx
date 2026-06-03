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
import { CONTRIB_SERIES, CHART_THEME } from "@/lib/chart";

export interface TimelinePoint {
  /** ISO date string (UTC day bucket). */
  date: string;
  prs: number;
  reviews: number;
  issues: number;
  commits: number;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Stacked-area contribution timeline. Data is pre-computed on the server
 * (from StatSnapshot REPO scope or aggregated Contributions) — this component
 * only renders; it never touches the network. Colors come from the shared
 * CONTRIB_SERIES palette so series read the same as the dashboard chart.
 */
export default function ContributionTimelineChart({ data }: { data: TimelinePoint[] }) {
  if (data.length === 0) {
    return (
      <p style={{ color: "var(--muted-fg)", fontStyle: "italic", margin: 0 }}>
        No contribution activity recorded yet.
      </p>
    );
  }

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={CHART_THEME.grid}
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            minTickGap={24}
            tick={{ fontSize: 12, fill: CHART_THEME.axis }}
            tickLine={false}
            axisLine={{ stroke: CHART_THEME.axisLine }}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12, fill: CHART_THEME.axis }}
            tickLine={false}
            axisLine={{ stroke: CHART_THEME.axisLine }}
          />
          <Tooltip
            labelFormatter={(v) => fmtDate(String(v))}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              background: CHART_THEME.tooltipBg,
              border: `1px solid ${CHART_THEME.tooltipBorder}`,
              color: CHART_THEME.tooltipText,
            }}
            labelStyle={{ color: CHART_THEME.tooltipText }}
            itemStyle={{ color: CHART_THEME.tooltipText }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: CHART_THEME.axis }} />
          {CONTRIB_SERIES.map((s) => (
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
