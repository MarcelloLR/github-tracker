/** Shared formatting helpers for repo/org UI. Pure, no I/O. */

export function fmtPercent(v: number | null): string {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}

export function fmtInt(v: number): string {
  return v.toLocaleString();
}

/** Compact churn like 12.3k / 4.5M. */
export function fmtCompact(v: number): string {
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(1)}k`;
  return `${(v / 1_000_000).toFixed(1)}M`;
}

/** Seconds → human duration for PR cycle time (e.g. "2.5h", "3.1d"). */
export function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = seconds / 3600;
  if (h < 1) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
