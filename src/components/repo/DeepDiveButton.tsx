"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { fetchJson, FetchError } from "@/lib/api/fetchJson";
import SummaryMarkdown from "./SummaryMarkdown";
import styles from "./DeepDiveButton.module.css";

type Status = "idle" | "running" | "done" | "error";

const TERMINAL = new Set(["completed", "failed", "unknown"]);
const POLL_MS = 2000;
const MAX_POLLS = 90; // ~3 min ceiling

/**
 * Enqueues an on-demand deep-dive (POST /api/repos/:id/deep-dive), polls the
 * returned job (GET /api/jobs/:id) until it terminates, then refreshes the
 * server component so a freshly-written DEEP_DIVE AISummary appears. If a
 * summary already exists it is shown immediately and the button re-runs it.
 */
export default function DeepDiveButton({
  repositoryId,
  existingSummary,
}: {
  repositoryId: string;
  existingSummary: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(
    (jobId: string, attempt: number) => {
      pollRef.current = setTimeout(async () => {
        try {
          // The jobs endpoint may 404 if the job has been cleaned up or lives
          // in a different queue; treat that as "unknown" and refresh to pick
          // up whatever the worker persisted. Suppress fetchJson's toast since
          // polling errors are transient and handled inline.
          let state = "unknown";
          try {
            const data = await fetchJson<{ state?: string }>(`/api/jobs/${jobId}`, {
              toastOnError: false,
            });
            state = data.state ?? "unknown";
          } catch (err) {
            if (!(err instanceof FetchError && err.status === 404)) throw err;
          }

          if (TERMINAL.has(state) || attempt >= MAX_POLLS) {
            setStatus(state === "failed" ? "error" : "done");
            if (state === "failed") {
              setError("Deep-dive job failed.");
              toast.error("Deep-dive job failed.");
            } else {
              router.refresh();
            }
            return;
          }
          poll(jobId, attempt + 1);
        } catch {
          // Network hiccup — keep trying up to the ceiling.
          if (attempt >= MAX_POLLS) {
            setStatus("error");
            setError("Lost connection while polling the deep-dive job.");
            toast.error("Lost connection while polling the deep-dive job.");
            return;
          }
          poll(jobId, attempt + 1);
        }
      }, POLL_MS);
    },
    [router],
  );

  const start = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      // Suppress fetchJson's auto-toast: we surface our own message below so
      // the toast and the inline error stay consistent.
      const { jobId } = await fetchJson<{ jobId?: string }>(
        `/api/repos/${repositoryId}/deep-dive`,
        { method: "POST", toastOnError: false },
      );
      if (!jobId) {
        setStatus("error");
        setError("Worker did not return a job id.");
        toast.error("Worker did not return a job id.");
        return;
      }
      poll(jobId, 0);
    } catch (err) {
      const message =
        err instanceof FetchError
          ? err.message
          : "Could not reach the server to start a deep dive.";
      setStatus("error");
      setError(message);
      toast.error(message);
    }
  }, [repositoryId, poll]);

  const running = status === "running";

  return (
    <div>
      <div className={styles.row}>
        <button className={styles.button} onClick={start} disabled={running}>
          {running
            ? "Deep dive running…"
            : existingSummary
              ? "Re-run deep dive"
              : "Deep dive"}
        </button>
        {running && (
          <span className={styles.hint}>
            Reading source files and summarizing — this can take a minute.
          </span>
        )}
        {status === "done" && !existingSummary && (
          <span className={styles.hint}>
            Deep dive finished. If it doesn&rsquo;t appear, refresh the page.
          </span>
        )}
        {status === "error" && error && (
          <span className={styles.error}>{error}</span>
        )}
      </div>

      {existingSummary && (
        <div className={styles.summary}>
          <SummaryMarkdown markdown={existingSummary} />
        </div>
      )}
    </div>
  );
}
