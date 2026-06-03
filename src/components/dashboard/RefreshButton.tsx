"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { fetchJson, FetchError } from "@/lib/api/fetchJson";
import styles from "./dashboard.module.css";

type Phase = "idle" | "starting" | "syncing" | "done" | "error";

const TERMINAL = new Set(["completed", "failed", "unknown"]);
const POLL_MS = 1500;
const MAX_POLLS = 120; // ~3 minutes ceiling, then stop polling.

/**
 * "Refresh now" — POSTs /api/sync, then polls GET /api/jobs/[id] until the
 * enqueued discover job reaches a terminal state, then refreshes the page so
 * the Server Component re-reads freshly-synced data from Postgres.
 */
export default function RefreshButton({
  lastSyncedAt,
}: {
  lastSyncedAt: string | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const busy = phase === "starting" || phase === "syncing";
  const cancelled = useRef(false);

  const pollJob = useCallback(
    async (jobId: string) => {
      for (let i = 0; i < MAX_POLLS; i++) {
        if (cancelled.current) return;
        await new Promise((r) => setTimeout(r, POLL_MS));
        let state = "unknown";
        try {
          // 404 means the job already drained from the queue — treat as
          // complete. Suppress fetchJson's toast since polling errors are
          // transient and handled inline.
          const data = await fetchJson<{ state?: string }>(`/api/jobs/${jobId}`, {
            cache: "no-store",
            toastOnError: false,
          });
          state = data.state ?? "unknown";
        } catch (err) {
          if (err instanceof FetchError && err.status === 404) {
            state = "completed";
          }
          // Otherwise a transient network/server error; keep polling.
        }
        if (TERMINAL.has(state)) {
          if (state === "failed") {
            setPhase("error");
            setMessage("Sync failed. Try again shortly.");
            toast.error("Sync failed. Try again shortly.");
            return;
          }
          setPhase("done");
          setMessage("Synced. Refreshing…");
          router.refresh();
          return;
        }
      }
      // Polling ceiling reached; refresh anyway so any partial progress shows.
      setPhase("done");
      setMessage("Still syncing in the background…");
      router.refresh();
    },
    [router],
  );

  const onClick = useCallback(async () => {
    cancelled.current = false;
    setPhase("starting");
    setMessage(null);
    try {
      // Suppress fetchJson's auto-toast: we surface our own message below so
      // the toast and the inline status stay consistent.
      const data = await fetchJson<{ jobId?: string; debounced?: boolean }>(
        "/api/sync",
        { method: "POST", toastOnError: false },
      );
      if (!data.jobId) {
        // Debounced — a sync is already in flight; just refresh.
        setPhase("done");
        setMessage(data.debounced ? "Already syncing…" : "Refreshing…");
        router.refresh();
        return;
      }
      setPhase("syncing");
      setMessage("Syncing your contributions…");
      await pollJob(data.jobId);
    } catch (err) {
      const message =
        err instanceof FetchError ? err.message : "Could not start sync. Try again.";
      setPhase("error");
      setMessage(message);
      toast.error(message);
    }
  }, [pollJob, router]);

  return (
    <div className={styles.refreshBar}>
      <button
        type="button"
        className={styles.refreshBtn}
        onClick={onClick}
        disabled={busy}
      >
        {busy ? "Refreshing…" : "Refresh now"}
      </button>
      {message ? (
        <span className={phase === "error" ? styles.refreshError : styles.refreshStatus}>
          {message}
        </span>
      ) : lastSyncedAt ? (
        <span className={styles.refreshStatus}>Last synced {lastSyncedAt}</span>
      ) : (
        <span className={styles.refreshStatus}>Never synced</span>
      )}
    </div>
  );
}
