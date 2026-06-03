"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { togglePortfolio, updatePublicSlug } from "@/app/actions";
import styles from "./settings.module.css";

export function PortfolioForm({
  portfolioPublic,
  publicSlug,
}: {
  portfolioPublic: boolean;
  publicSlug: string | null;
}) {
  const [isPublic, setIsPublic] = useState(portfolioPublic);
  const [slug, setSlug] = useState(publicSlug ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onToggle(next: boolean) {
    setStatus(null);
    setError(null);
    setIsPublic(next);
    startTransition(async () => {
      try {
        await togglePortfolio(next);
        // Enabling may have generated a slug server-side; reflect a placeholder
        // until the page revalidates with the real value.
        if (next && !slug) {
          setStatus("Portfolio is public. A shareable link was generated.");
        } else {
          setStatus(next ? "Portfolio is public." : "Portfolio is private.");
        }
        toast.success(next ? "Portfolio is now public." : "Portfolio is now private.");
      } catch {
        setIsPublic(!next);
        setError("Could not update portfolio visibility.");
        toast.error("Could not update portfolio visibility.");
      }
    });
  }

  function saveSlug() {
    setStatus(null);
    setError(null);
    if (!slug.trim()) {
      setError("Enter a slug for your public link.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await updatePublicSlug(slug.trim());
        setSlug(res.slug);
        setStatus(
          res.slug === slug.trim()
            ? "Link saved."
            : `Adjusted to an available slug: ${res.slug}`,
        );
        toast.success(
          res.slug === slug.trim()
            ? "Link saved."
            : `Adjusted to an available slug: ${res.slug}`,
        );
      } catch {
        setError("Could not update the public link.");
        toast.error("Could not update the public link.");
      }
    });
  }

  return (
    <section className={styles.section}>
      <h2>Public portfolio</h2>
      <p className={styles.hint}>
        Share a public, read-only summary of your contributions. Private repos are
        never shown.
      </p>

      <div className={styles.toggleRow}>
        <input
          id="portfolio-public"
          type="checkbox"
          checked={isPublic}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={pending}
        />
        <label htmlFor="portfolio-public">Make my portfolio public</label>
      </div>

      <div className={styles.row} style={{ marginTop: "1rem" }}>
        <div className={styles.field} style={{ flex: 1 }}>
          <label htmlFor="portfolio-slug">Public link</label>
          <div className={styles.toggleRow}>
            <span className={styles.slugPreview}>/p/</span>
            <input
              id="portfolio-slug"
              type="text"
              value={slug}
              placeholder="your-handle"
              onChange={(e) => setSlug(e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
        </div>
        <button
          type="button"
          className={styles.button}
          onClick={saveSlug}
          disabled={pending}
        >
          Save link
        </button>
      </div>

      {slug ? (
        <p className={styles.slugPreview}>
          Shareable URL: <strong>/p/{slug}</strong>
        </p>
      ) : null}

      {error ? (
        <p className={`${styles.status} ${styles.error}`}>{error}</p>
      ) : (
        <p className={styles.status}>{status}</p>
      )}
    </section>
  );
}
