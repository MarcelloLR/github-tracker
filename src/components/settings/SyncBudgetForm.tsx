"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateSettings } from "@/app/actions";
import { Button } from "@/components/ui";
import styles from "./settings.module.css";

export function SyncBudgetForm({
  syncIntervalHrs,
  deepDiveBudget,
}: {
  syncIntervalHrs: number;
  deepDiveBudget: number;
}) {
  const [interval, setInterval] = useState(syncIntervalHrs);
  const [budget, setBudget] = useState(deepDiveBudget);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setStatus(null);
    setError(null);
    if (!Number.isFinite(interval) || interval < 1) {
      setError("Sync interval must be at least 1 hour.");
      return;
    }
    if (!Number.isFinite(budget) || budget < 0) {
      setError("Deep-dive budget cannot be negative.");
      return;
    }
    startTransition(async () => {
      try {
        await updateSettings({
          syncIntervalHrs: Math.floor(interval),
          deepDiveBudget: Math.floor(budget),
        });
        setStatus("Saved.");
        toast.success("Settings saved.");
      } catch {
        setError("Could not save settings.");
        toast.error("Could not save settings.");
      }
    });
  }

  return (
    <section className={styles.section}>
      <h2>Sync &amp; budget</h2>
      <p className={styles.hint}>
        How often your contributions refresh, and your monthly cap on on-demand
        deep-dive summaries.
      </p>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="sync-interval">Sync interval (hours)</label>
          <input
            id="sync-interval"
            type="number"
            min={1}
            value={interval}
            onChange={(e) => setInterval(e.target.valueAsNumber)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="deep-dive-budget">Deep-dive budget (per month)</label>
          <input
            id="deep-dive-budget"
            type="number"
            min={0}
            value={budget}
            onChange={(e) => setBudget(e.target.valueAsNumber)}
          />
        </div>

        <Button type="button" onClick={save} disabled={pending}>
          Save
        </Button>
      </div>

      {error ? (
        <p className={`${styles.status} ${styles.error}`}>{error}</p>
      ) : (
        <p className={styles.status}>{status}</p>
      )}
    </section>
  );
}
