"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import styles from "./error.module.css";

/**
 * App Router segment error boundary. Renders inside the root layout (so the
 * <Toaster/> is still mounted), catching render/runtime errors thrown by a
 * nested route segment. `reset()` re-attempts to render the segment.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface a non-blocking toast in addition to the inline panel.
    toast.error("Something went wrong.");
    // Log for diagnostics; `digest` correlates with the server-side error.
    console.error(error);
  }, [error]);

  return (
    <div className={`container ${styles.wrap}`}>
      <div className={styles.panel}>
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.message}>
          An unexpected error occurred while loading this page. You can try
          again, or head back to your dashboard.
        </p>
        {error.digest ? (
          <p className={styles.digest}>Reference: {error.digest}</p>
        ) : null}
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={() => reset()}>
            Try again
          </button>
          <a href="/dashboard" className={styles.link}>
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
