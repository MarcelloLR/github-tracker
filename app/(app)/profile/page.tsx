import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeMetrics, type ContribType } from "@/lib/metrics/compute";

import MetricCards from "@/components/dashboard/MetricCards";
import Markdown from "@/components/dashboard/Markdown";
import styles from "@/components/dashboard/dashboard.module.css";

export const dynamic = "force-dynamic";

function highlightStrings(highlights: unknown): string[] {
  if (Array.isArray(highlights)) {
    return highlights.filter((h): h is string => typeof h === "string");
  }
  return [];
}

export default async function ProfilePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const [profile, contribs] = await Promise.all([
    prisma.aISummary.findFirst({
      where: { userId, tier: "PROFILE" },
      orderBy: { generatedAt: "desc" },
      select: { summaryMd: true, highlights: true, generatedAt: true, model: true },
    }),
    prisma.contribution.findMany({
      where: { userId },
      select: {
        type: true,
        mergedAt: true,
        cycleTimeSec: true,
        additions: true,
        deletions: true,
      },
    }),
  ]);

  const metrics = computeMetrics(
    contribs.map((c) => ({
      type: c.type as ContribType,
      mergedAt: c.mergedAt,
      cycleTimeSec: c.cycleTimeSec,
      additions: c.additions,
      deletions: c.deletions,
    })),
  );

  const highlights = highlightStrings(profile?.highlights);
  const generated = profile
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(profile.generatedAt)
    : null;

  return (
    <main>
      <h1 className={styles.sectionTitle} style={{ fontSize: "1.5rem" }}>
        Developer profile
      </h1>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>AI summary</h2>
          {generated ? (
            <span className={styles.muted}>
              Generated {generated}
              {profile?.model ? ` · ${profile.model}` : ""}
            </span>
          ) : null}
        </div>

        {profile ? (
          <div className={styles.card}>
            <Markdown source={profile.summaryMd} />
            {highlights.length ? (
              <ul className={styles.highlights}>
                {highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className={styles.empty}>
            No profile summary yet. Once your contributions are synced, the worker
            generates an AI profile from your activity — check back after a sync.
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Headline metrics</h2>
        <MetricCards metrics={metrics} />
      </section>
    </main>
  );
}
