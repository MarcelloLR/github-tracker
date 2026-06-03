import styles from "./dashboard.module.css";

export interface GoalProgress {
  id: string;
  metric: "PRS" | "REVIEWS" | "ISSUES" | "COMMITS";
  period: "WEEKLY" | "MONTHLY";
  target: number;
  current: number;
}

const METRIC_LABEL: Record<GoalProgress["metric"], string> = {
  PRS: "PRs",
  REVIEWS: "Reviews",
  ISSUES: "Issues",
  COMMITS: "Commits",
};

/** Goal progress bars: current-period count vs target. Presentational. */
export default function Goals({ goals }: { goals: GoalProgress[] }) {
  if (goals.length === 0) {
    return (
      <div className={styles.empty}>
        No active goals yet. Set weekly or monthly targets in Settings.
      </div>
    );
  }

  return (
    <div className={styles.card}>
      {goals.map((g) => {
        const pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0;
        const met = g.current >= g.target && g.target > 0;
        const periodLabel = g.period === "WEEKLY" ? "this week" : "this month";
        return (
          <div key={g.id} className={styles.goal}>
            <div className={styles.goalHeader}>
              <span>
                {METRIC_LABEL[g.metric]} <span className={styles.muted}>{periodLabel}</span>
              </span>
              <span className={met ? styles.goalMet : undefined}>
                {g.current} / {g.target}
                {met ? " ✓" : ""}
              </span>
            </div>
            <div className={styles.progressTrack}>
              <div
                className={`${styles.progressFill} ${met ? styles.progressFillMet : ""}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
