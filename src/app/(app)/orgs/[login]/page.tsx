import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeMetrics } from "@/lib/metrics/compute";
import MetricCards from "@/components/repo/MetricCards";
import LanguageMix, { type LanguageDatum } from "@/components/repo/LanguageMix";
import { EmptyState, Panel } from "@/components/ui";
import { metricCards } from "@/components/repo/metricsView";
import { fmtInt, fmtPercent } from "@/components/repo/format";
import styles from "@/components/repo/org.module.css";

export const dynamic = "force-dynamic";

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ login: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();
  const userId = session.user.id;

  const { login } = await params;

  const org = await prisma.organization.findUnique({
    where: { login },
    include: {
      repositories: { include: { languages: true } },
    },
  });
  if (!org) notFound();

  // Confirm the user is linked to this org.
  const membership = await prisma.userOrganization.findUnique({
    where: { userId_organizationId: { userId, organizationId: org.id } },
  });
  if (!membership) notFound();

  const repoIds = org.repositories.map((r) => r.id);

  // All of the user's contributions in repos belonging to this org.
  const contribs =
    repoIds.length === 0
      ? []
      : await prisma.contribution.findMany({
          where: { userId, repositoryId: { in: repoIds } },
          select: {
            repositoryId: true,
            type: true,
            mergedAt: true,
            cycleTimeSec: true,
            additions: true,
            deletions: true,
          },
        });

  // Aggregate org-wide metrics over every contribution.
  const orgMetrics = computeMetrics(contribs);

  // Per-repo-within-org breakdown.
  const byRepo = new Map<string, typeof contribs>();
  for (const c of contribs) {
    const arr = byRepo.get(c.repositoryId);
    if (arr) arr.push(c);
    else byRepo.set(c.repositoryId, [c]);
  }

  const repoRows = org.repositories
    .map((r) => ({ repo: r, metrics: computeMetrics(byRepo.get(r.id) ?? []) }))
    .sort((a, b) => {
      const score = (m: ReturnType<typeof computeMetrics>) =>
        m.prsOpened + m.reviews + m.issuesOpened + m.commits;
      return score(b.metrics) - score(a.metrics);
    });

  // Byte-weighted org language mix: sum RepoLanguage bytes across all repos.
  const langTotals = new Map<string, number>();
  for (const r of org.repositories) {
    for (const l of r.languages) {
      langTotals.set(l.language, (langTotals.get(l.language) ?? 0) + l.bytes);
    }
  }
  const orgLanguages: LanguageDatum[] = [...langTotals.entries()].map(
    ([language, bytes]) => ({ language, bytes }),
  );

  const activeRepoCount = repoRows.filter(
    (r) =>
      r.metrics.prsOpened +
        r.metrics.reviews +
        r.metrics.issuesOpened +
        r.metrics.commits >
      0,
  ).length;

  return (
    <main className={styles.page}>
      <nav className={styles.breadcrumb}>
        <Link href="/repos">Repositories</Link>
        <span className={styles.sep}>/</span>
        <span className={styles.crumbCurrent}>{org.login}</span>
      </nav>

      <header className={styles.header}>
        <h1 className={styles.title}>
          {org.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.avatar} src={org.avatarUrl} alt="" width={36} height={36} />
          )}
          <a href={`https://github.com/${org.login}`} target="_blank" rel="noreferrer">
            {org.name ?? org.login}
          </a>
        </h1>
        {org.description && <p className={styles.desc}>{org.description}</p>}
        <p className={styles.facts}>
          <span className="tnum">{fmtInt(org.repositories.length)}</span> repos · contributing to{" "}
          <span className="tnum">{fmtInt(activeRepoCount)}</span>
        </p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Your contributions across {org.login}</h2>
        <MetricCards items={metricCards(orgMetrics)} />
      </section>

      <Panel title="Language mix" className={styles.section}>
        <LanguageMix languages={orgLanguages} />
      </Panel>

      <Panel title="Per-repo breakdown" className={styles.section} noBodyPadding>
        {repoRows.length === 0 ? (
          <div className={styles.emptyWrap}>
            <EmptyState>No repositories recorded for this org yet.</EmptyState>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Repository</th>
                  <th className={styles.num}>PRs</th>
                  <th className={styles.num}>Merge rate</th>
                  <th className={styles.num}>Reviews</th>
                  <th className={styles.num}>Issues</th>
                  <th className={styles.num}>Commits</th>
                </tr>
              </thead>
              <tbody>
                {repoRows.map(({ repo, metrics }) => (
                  <tr key={repo.id}>
                    <td>
                      <Link href={`/repos/${repo.owner}/${repo.name}`} className={styles.repoLink}>
                        {repo.name}
                      </Link>
                    </td>
                    <td className={`${styles.num} tnum`}>
                      {fmtInt(metrics.prsOpened)}
                      <span className={styles.subNum}> ({fmtInt(metrics.prsMerged)})</span>
                    </td>
                    <td className={`${styles.num} tnum`}>{fmtPercent(metrics.mergeRate)}</td>
                    <td className={`${styles.num} tnum`}>{fmtInt(metrics.reviews)}</td>
                    <td className={`${styles.num} tnum`}>{fmtInt(metrics.issuesOpened)}</td>
                    <td className={`${styles.num} tnum`}>{fmtInt(metrics.commits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </main>
  );
}
