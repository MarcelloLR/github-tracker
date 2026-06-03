/** Days since the unix epoch (UTC) — a comparable integer day bucket. */
function dayKey(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
}

/**
 * Longest and current run of consecutive active days. "Current" is anchored to
 * `today` and is allowed to extend through yesterday (so it doesn't reset before
 * the day's first contribution). This is the user-defined streak, distinct from
 * GitHub's heatmap. See docs/SPEC.md.
 */
export function computeStreaks(
  activeDates: Date[],
  today: Date,
): { current: number; longest: number } {
  const days = new Set(activeDates.map(dayKey));

  let longest = 0;
  for (const key of days) {
    if (days.has(key - 1)) continue; // only start counting from a run's first day
    let len = 1;
    while (days.has(key + len)) len++;
    if (len > longest) longest = len;
  }

  let current = 0;
  let cursor = dayKey(today);
  if (!days.has(cursor)) cursor -= 1; // allow streak to run through yesterday
  while (days.has(cursor)) {
    current++;
    cursor -= 1;
  }

  return { current, longest };
}
