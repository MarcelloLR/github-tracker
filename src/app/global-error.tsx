"use client";

import { useEffect } from "react";

/**
 * Root error boundary. This REPLACES the root layout when it renders, so it
 * must provide its own <html>/<body>. The <Toaster/> lives in the root layout
 * (which is gone here), so we do NOT use `toast` — styling is inline and
 * self-contained for the same reason.
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
          margin: 0,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, sans-serif",
          lineHeight: 1.5,
          colorScheme: "light dark",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1rem",
        }}
      >
        <div
          style={{
            border: "1px solid color-mix(in srgb, currentColor 18%, transparent)",
            borderRadius: 10,
            padding: "1.5rem 1.75rem",
            maxWidth: "32rem",
            width: "100%",
          }}
        >
          <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 1rem", opacity: 0.8 }}>
            A critical error occurred and the page could not be displayed.
            Please try again.
          </p>
          {error.digest ? (
            <p
              style={{
                margin: "0 0 1rem",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.8rem",
                opacity: 0.6,
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
              padding: "0.45rem 0.9rem",
              border:
                "1px solid color-mix(in srgb, currentColor 30%, transparent)",
              borderRadius: 6,
              background: "color-mix(in srgb, currentColor 8%, transparent)",
              color: "inherit",
              font: "inherit",
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
