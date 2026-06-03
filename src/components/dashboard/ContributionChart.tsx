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
import { CHART_THEME, CONTRIB_SERIES } from "@/lib/chart";

export interface TrendPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  prs: number;
  reviews: number;
  issues: number;
  commits: number;
}

/** Stacked area trend of weekly contribution counts (Recharts, client-only). */
export default function ContributionChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: CHART_THEME.axis }}
          stroke={CHART_THEME.axisLine}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
        />
        <YAxis
          tick={{ fontSize: 11, fill: CHART_THEME.axis }}
          stroke={CHART_THEME.axisLine}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={36}
        />
        <Tooltip
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
  );
}
