import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeMetrics } from "@/lib/metrics/compute";
import MetricCards from "@/components/repo/MetricCards";
import LanguageMix from "@/components/repo/LanguageMix";
import SummaryMarkdown from "@/components/repo/SummaryMarkdown";
import DeepDiveButton from "@/components/repo/DeepDiveButton";
import ContributionTimelineChart from "@/components/repo/ContributionTimelineChart";
import {
  metricCards,
  timelineFromSnapshots,
  timelineFromContributions,
} from "@/components/repo/metricsView";
import { fmtDate, fmtInt } from "@/components/repo/format";
import styles from "@/components/repo/detail.module.css";

export const dynamic = "force-dynamic";

export default async function RepoDetailPage({
  params,
}: {
  params: Promise<{ owner: string; name: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();
  const userId = session.user.id;

  const { owner, name } = await params;
  const nameWithOwner = `${owner}/${name}`;

  const repo = await prisma.repository.findUnique({
    where: { nameWithOwner },
    include: { languages: true, organization: true },
  });
  if (!repo) notFound();

  // Confirm the signed-in user actually contributes to this repo.
  const link = await prisma.userRepository.findUnique({
    where: { userId_repositoryId: { userId, repositoryId: repo.id } },
  });
  if (!link) notFound();

  const [contribs, snapshots, metadataSummary, deepDiveSummary] = await Promise.all([
    prisma.contribution.findMany({
      where: { userId, repositoryId: repo.id },
      select: {
        type: true,
        mergedAt: true,
        cycleTimeSec: true,
        additions: true,
        deletions: true,
        occurredOn: true,
      },
    }),
    prisma.statSnapshot.findMany({
      where: { userId, scope: "REPO", scopeId: repo.id },
      orderBy: { date: "asc" },
      select: {
        date: true,
        prsOpened: true,
        reviews: true,
        issuesOpened: true,
        commits: true,
      },
    }),
    // Repo-tier metadata summary is user-agnostic (userId null).
    prisma.aISummary.findFirst({
      where: { repositoryId: repo.id, tier: "METADATA" },
      orderBy: { generatedAt: "desc" },
    }),
    prisma.aISummary.findFirst({
      where: { repositoryId: repo.id, tier: "DEEP_DIVE" },
      orderBy: { generatedAt: "desc" },
    }),
  ]);

  const metrics = computeMetrics(contribs);
  const timeline =
    snapshots.length > 0
      ? timelineFromSnapshots(snapshots)
      : timelineFromContributions(contribs);

  return (
    <main className={styles.page}>
      <p className={styles.breadcrumb}>
        <Link href="/repos">Repositories</Link> /{" "}
        {repo.organization && (
          <>
            <Link href={`/orgs/${repo.organization.login}`}>
              {repo.organization.login}
            </Link>{" "}
            /{" "}
          </>
        )}
        {repo.name}
      </p>

      <header className={styles.header}>
        <h1 className={styles.title}>
          <a
            href={`https://github.com/${repo.nameWithOwner}`}
            target="_blank"
            rel="noreferrer"
          >
            {repo.nameWithOwner}
          </a>
        </h1>
        {repo.description && <p className={styles.desc}>{repo.description}</p>}
        <div className={styles.facts}>
          {repo.primaryLang && <span>{repo.primaryLang}</span>}
          <span>★ {fmtInt(repo.stargazers)}</span>
          {repo.license && <span>{repo.license}</span>}
          {repo.isPrivate && <span className={styles.badge}>private</span>}
          <span>
            Contributing {fmtDate(link.firstContributedAt)} – {fmtDate(link.lastContributedAt)}
          </span>
          {link.lastSyncedAt && (
            <span className={styles.synced}>Synced {fmtDate(link.lastSyncedAt)}</span>
          )}
        </div>
        {repo.topics.length > 0 && (
          <div className={styles.topics}>
            {repo.topics.map((t) => (
              <span key={t} className={styles.topic}>
                {t}
              </span>
            ))}
          </div>
        )}
      </header>

      <section>
        <h2>Your contributions</h2>
        <MetricCards items={metricCards(metrics)} />
      </section>

      <section>
        <h2>Contribution timeline</h2>
        <ContributionTimelineChart data={timeline} />
      </section>

      <section>
        <h2>Language mix</h2>
        <LanguageMix languages={repo.languages} />
      </section>

      <section>
        <h2>Codebase summary</h2>
        {metadataSummary ? (
          <div className={styles.summaryBox}>
            <SummaryMarkdown markdown={metadataSummary.summaryMd} />
            <p className={styles.summaryMeta}>
              {metadataSummary.model} · {fmtDate(metadataSummary.generatedAt)}
            </p>
          </div>
        ) : (
          <p className={styles.muted}>
            No metadata summary yet. It&rsquo;s generated when the repo is synced.
          </p>
        )}
      </section>

      <section>
        <h2>Deep dive</h2>
        <p className={styles.muted}>
          Reads a selection of high-signal source files and summarizes the
          architecture. May use part of your monthly deep-dive budget.
        </p>
        <DeepDiveButton
          repositoryId={repo.id}
          existingSummary={deepDiveSummary?.summaryMd ?? null}
        />
      </section>
    </main>
  );
}
