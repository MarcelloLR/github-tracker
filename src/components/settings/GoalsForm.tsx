"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createGoal, deleteGoal } from "@/app/actions";
import styles from "./settings.module.css";

type Metric = "PRS" | "REVIEWS" | "ISSUES" | "COMMITS";
type Period = "WEEKLY" | "MONTHLY";

export interface GoalItem {
  id: string;
  metric: Metric;
  period: Period;
  target: number;
}

const METRIC_LABELS: Record<Metric, string> = {
  PRS: "Pull requests",
  REVIEWS: "Reviews",
  ISSUES: "Issues",
  COMMITS: "Commits",
};

const PERIOD_LABELS: Record<Period, string> = {
  WEEKLY: "per week",
  MONTHLY: "per month",
};

export function GoalsForm({ goals }: { goals: GoalItem[] }) {
  const [metric, setMetric] = useState<Metric>("PRS");
  const [period, setPeriod] = useState<Period>("WEEKLY");
  const [target, setTarget] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    if (!Number.isFinite(target) || target < 1) {
      setError("Target must be a positive number.");
      return;
    }
    startTransition(async () => {
      try {
        await createGoal({ metric, period, target: Math.floor(target) });
        toast.success("Goal added.");
      } catch {
        setError("Could not create goal.");
        toast.error("Could not create goal.");
      }
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        await deleteGoal(id);
        toast.success("Goal deleted.");
      } catch {
        setError("Could not delete goal.");
        toast.error("Could not delete goal.");
      }
    });
  }

  return (
    <section className={styles.section}>
      <h2>Goals</h2>
      <p className={styles.hint}>
        Set contribution targets. Progress is tracked against your synced activity.
      </p>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="goal-metric">Metric</label>
          <select
            id="goal-metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value as Metric)}
          >
            {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
              <option key={m} value={m}>
                {METRIC_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="goal-period">Period</label>
          <select
            id="goal-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
          >
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="goal-target">Target</label>
          <input
            id="goal-target"
            type="number"
            min={1}
            value={target}
            onChange={(e) => setTarget(e.target.valueAsNumber)}
          />
        </div>

        <button
          type="button"
          className={styles.button}
          onClick={add}
          disabled={pending}
        >
          Add goal
        </button>
      </div>

      {error ? <p className={`${styles.status} ${styles.error}`}>{error}</p> : null}

      {goals.length === 0 ? (
        <p className={styles.empty}>No goals yet. Add one above.</p>
      ) : (
        <ul className={styles.list}>
          {goals.map((g) => (
            <li key={g.id} className={styles.listItem}>
              <span>
                {g.target} {METRIC_LABELS[g.metric].toLowerCase()} {PERIOD_LABELS[g.period]}
              </span>
              <button
                type="button"
                className={`${styles.button} ${styles.danger}`}
                onClick={() => remove(g.id)}
                disabled={pending}
                aria-label="Delete goal"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
