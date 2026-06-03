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
import { Badge, Panel, Pill, EmptyState } from "@/components/ui";
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
      <nav className={styles.breadcrumb}>
        <Link href="/repos">Repositories</Link>
        <span className={styles.sep}>/</span>
        {repo.organization && (
          <>
            <Link href={`/orgs/${repo.organization.login}`}>
              {repo.organization.login}
            </Link>
            <span className={styles.sep}>/</span>
          </>
        )}
        <span className={styles.crumbCurrent}>{repo.name}</span>
      </nav>

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
          {repo.primaryLang && <span className={styles.fact}>{repo.primaryLang}</span>}
          <span className={`${styles.fact} tnum`}>★ {fmtInt(repo.stargazers)}</span>
          {repo.license && <span className={styles.fact}>{repo.license}</span>}
          {repo.isPrivate && <Badge tone="warn">Private</Badge>}
          <span className={styles.fact}>
            Contributing {fmtDate(link.firstContributedAt)} – {fmtDate(link.lastContributedAt)}
          </span>
          {link.lastSyncedAt && (
            <span className={styles.fact}>Synced {fmtDate(link.lastSyncedAt)}</span>
          )}
        </div>
        {repo.topics.length > 0 && (
          <div className={styles.topics}>
            {repo.topics.map((t) => (
              <Pill key={t}>{t}</Pill>
            ))}
          </div>
        )}
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Your contributions</h2>
        <MetricCards items={metricCards(metrics)} />
      </section>

      <Panel title="Contribution timeline" className={styles.section}>
        <ContributionTimelineChart data={timeline} />
      </Panel>

      <Panel title="Language mix" className={styles.section}>
        <LanguageMix languages={repo.languages} />
      </Panel>

      <Panel title="Codebase summary" className={styles.section}>
        {metadataSummary ? (
          <>
            <SummaryMarkdown markdown={metadataSummary.summaryMd} />
            <p className={styles.summaryMeta}>
              {metadataSummary.model} · {fmtDate(metadataSummary.generatedAt)}
            </p>
          </>
        ) : (
          <EmptyState>
            No metadata summary yet. It&rsquo;s generated when the repo is synced.
          </EmptyState>
        )}
      </Panel>

      <Panel
        title="Deep dive"
        description="Reads a selection of high-signal source files and summarizes the architecture. May use part of your monthly deep-dive budget."
        className={styles.section}
      >
        <DeepDiveButton
          repositoryId={repo.id}
          existingSummary={deepDiveSummary?.summaryMd ?? null}
        />
      </Panel>
    </main>
  );
}
