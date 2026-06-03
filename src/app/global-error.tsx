"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Root error boundary. This REPLACES the root layout when it renders, so it
 * must provide its own <html>/<body>. The <Toaster/> lives in the root layout
 * (which is gone here), so we do NOT use `toast`. We import globals.css so the
 * design tokens (var(--background) etc.) resolve; fonts fall back to the stack
 * in globals.css since the next/font className isn't applied here.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1rem",
        }}
      >
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "1.5rem 1.75rem",
            maxWidth: "32rem",
            width: "100%",
          }}
        >
          <h1
            style={{
              margin: "0 0 0.5rem",
              fontSize: "1.25rem",
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 1rem", color: "var(--muted-fg)" }}>
            A critical error occurred and the page could not be displayed.
            Please try again.
          </p>
          {error.digest ? (
            <p
              style={{
                margin: "0 0 1rem",
                fontFamily:
                  "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                fontSize: "0.8rem",
                color: "var(--faint-fg)",
                wordBreak: "break-all",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.5rem 0.9rem",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius)",
              background: "var(--card)",
              color: "inherit",
              font: "inherit",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
