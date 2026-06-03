import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeMetrics, type ContribType } from "@/lib/metrics/compute";

import MetricCards from "@/components/dashboard/MetricCards";
import Markdown from "@/components/dashboard/Markdown";
import { PageHeader, Panel, EmptyState } from "@/components/ui";
import styles from "./profile.module.css";

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
      <PageHeader
        title="Developer profile"
        description="An AI summary of your open-source work, with headline metrics."
      />

      <div className={styles.stack}>
        <Panel
          title="AI summary"
          actions={
            generated ? (
              <span className={styles.meta}>
                Generated {generated}
                {profile?.model ? ` · ${profile.model}` : ""}
              </span>
            ) : undefined
          }
        >
          {profile ? (
            <>
              <Markdown source={profile.summaryMd} />
              {highlights.length ? (
                <ul className={styles.highlights}>
                  {highlights.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <EmptyState>
              No profile summary yet. Once your contributions are synced, the
              worker generates an AI profile from your activity — check back after
              a sync.
            </EmptyState>
          )}
        </Panel>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Headline metrics</h2>
          <MetricCards metrics={metrics} />
        </section>
      </div>
    </main>
  );
}
