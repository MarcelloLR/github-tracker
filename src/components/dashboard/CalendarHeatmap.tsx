"use client";

import { useMemo } from "react";
import { HEATMAP_LEVELS } from "@/lib/chart";
import styles from "./dashboard.module.css";

export interface HeatmapDay {
  /** ISO date (YYYY-MM-DD, UTC). */
  date: string;
  count: number;
}

const CELL = 12;
const GAP = 3;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Bucket a count into one of 5 intensity levels relative to the busiest day. */
function levelFor(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 0) return 0;
  const ratio = count / max;
  if (ratio > 0.66) return 4;
  if (ratio > 0.33) return 3;
  if (ratio > 0.1) return 2;
  return 1;
}

/**
 * GitHub-style contribution calendar: weeks as columns, weekdays as rows,
 * spanning the trailing `weeks` weeks ending today. Pure SVG so it needs no
 * charting lib; rendered client-side to keep the page a Server Component.
 */
export default function CalendarHeatmap({
  data,
  weeks = 53,
  today,
}: {
  data: HeatmapDay[];
  weeks?: number;
  /**
   * Anchor day for the trailing window — ISO YYYY-MM-DD (UTC). Supplied by the
   * server (a dynamic RSC) so SSR and client hydration compute an identical
   * grid; computing it here with `new Date()` would mismatch across a UTC
   * midnight boundary and break hydration.
   */
  today: string;
}) {
  const { columns, monthLabels, total, max } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of data) counts.set(d.date, (counts.get(d.date) ?? 0) + d.count);

    // Anchor end of grid to the Saturday on/after `today`, start `weeks` back.
    const anchor = new Date(`${today}T00:00:00.000Z`);
    const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
    // Move end to end-of-week (Saturday, getUTCDay()===6).
    end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
    const start = new Date(end.getTime() - (weeks * 7 - 1) * 86_400_000);
    // Snap start back to Sunday.
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());

    let maxCount = 0;
    for (const d of data) {
      const c = counts.get(d.date) ?? 0;
      if (c > maxCount) maxCount = c;
    }

    const cols: { x: number; cells: { y: number; date: string; count: number }[] }[] = [];
    const labels: { x: number; label: string }[] = [];
    let total = 0;
    let lastMonth = -1;

    let cursor = new Date(start.getTime());
    const todayKey = dateKey(end) >= today ? today : dateKey(end);
    for (let w = 0; w < weeks; w++) {
      const x = w * (CELL + GAP);
      const cells: { y: number; date: string; count: number }[] = [];
      for (let dow = 0; dow < 7; dow++) {
        const key = dateKey(cursor);
        if (key <= todayKey) {
          const count = counts.get(key) ?? 0;
          total += count;
          cells.push({ y: dow * (CELL + GAP), date: key, count });
        }
        // Month label when the first week-cell crosses into a new month.
        if (dow === 0) {
          const m = cursor.getUTCMonth();
          if (m !== lastMonth) {
            labels.push({ x, label: MONTHS[m] });
            lastMonth = m;
          }
        }
        cursor = new Date(cursor.getTime() + 86_400_000);
      }
      cols.push({ x, cells });
    }
    return { columns: cols, monthLabels: labels, total, max: maxCount };
  }, [data, weeks, today]);

  const width = weeks * (CELL + GAP);
  const gridHeight = 7 * (CELL + GAP);
  const labelH = 14;

  return (
    <div>
      <div className={styles.heatmapWrap}>
        <svg
          width={width}
          height={gridHeight + labelH}
          role="img"
          aria-label={`${total} contributions in the last ${weeks} weeks`}
        >
          {monthLabels.map((m, i) => (
            <text
              key={`${m.label}-${i}`}
              x={m.x}
              y={10}
              fontSize={10}
              fill="var(--faint-fg)"
            >
              {m.label}
            </text>
          ))}
          <g transform={`translate(0, ${labelH})`}>
            {columns.map((col) =>
              col.cells.map((c) => (
                <rect
                  key={c.date}
                  x={col.x}
                  y={c.y}
                  width={CELL}
                  height={CELL}
                  rx={2}
                  ry={2}
                  fill={HEATMAP_LEVELS[levelFor(c.count, max)]}
                >
                  <title>
                    {c.count} contribution{c.count === 1 ? "" : "s"} on {c.date}
                  </title>
                </rect>
              )),
            )}
          </g>
        </svg>
      </div>
      <div className={styles.heatmapLegend}>
        <span>{total} contributions</span>
        <span style={{ marginLeft: "auto" }}>Less</span>
        {HEATMAP_LEVELS.map((color, i) => (
          <span
            key={i}
            className={styles.legendSwatch}
            style={{ background: color }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
