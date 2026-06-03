import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeMetrics } from "@/lib/metrics/compute";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui";
import { fmtDate, fmtInt, fmtPercent } from "@/components/repo/format";
import styles from "@/components/repo/repos.module.css";

export const dynamic = "force-dynamic";

export default async function ReposPage() {
  const session = await auth();
  if (!session?.user?.id) notFound();
  const userId = session.user.id;

  // The user's contributed repos (UserRepository ⋈ Repository) plus all of this
  // user's Contributions for per-repo headline metrics. Reads Prisma directly —
  // no GitHub/Claude in the request path.
  const [links, contribs] = await Promise.all([
    prisma.userRepository.findMany({
      where: { userId },
      include: { repository: true },
    }),
    prisma.contribution.findMany({
      where: { userId },
      select: {
        repositoryId: true,
        type: true,
        mergedAt: true,
        cycleTimeSec: true,
        additions: true,
        deletions: true,
      },
    }),
  ]);

  // Group contributions by repository for computeMetrics.
  const byRepo = new Map<string, typeof contribs>();
  for (const c of contribs) {
    const arr = byRepo.get(c.repositoryId);
    if (arr) arr.push(c);
    else byRepo.set(c.repositoryId, [c]);
  }

  const rows = links
    .map((l) => {
      const repo = l.repository;
      const metrics = computeMetrics(byRepo.get(repo.id) ?? []);
      return { link: l, repo, metrics };
    })
    // Most recently active first; fall back to PR/commit volume.
    .sort((a, b) => {
      const at = a.link.lastContributedAt?.getTime() ?? 0;
      const bt = b.link.lastContributedAt?.getTime() ?? 0;
      if (bt !== at) return bt - at;
      return b.metrics.prsOpened + b.metrics.commits - (a.metrics.prsOpened + a.metrics.commits);
    });

  return (
    <main>
      <PageHeader
        title="Repositories"
        description={
          rows.length > 0
            ? `${rows.length} ${rows.length === 1 ? "repository" : "repositories"} you contribute to.`
            : "Repos you contribute to will appear here once a sync has run."
        }
      />

      {rows.length === 0 ? (
        <EmptyState>
          No repositories yet. Once the background worker discovers and syncs your
          contributions, they&rsquo;ll show up here with headline metrics.
        </EmptyState>
      ) : (
        <Panel noBodyPadding>
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
                  <th className={styles.num}>Stars</th>
                  <th>Last active</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ link, repo, metrics }) => (
                  <tr key={repo.id}>
                    <td>
                      <Link
                        href={`/repos/${repo.owner}/${repo.name}`}
                        className={styles.repoLink}
                      >
                        {repo.nameWithOwner}
                      </Link>
                      <div className={styles.meta}>
                        {repo.primaryLang && <Badge>{repo.primaryLang}</Badge>}
                        {repo.isPrivate && <Badge tone="warn">Private</Badge>}
                        {repo.description && (
                          <span className={styles.desc}>{repo.description}</span>
                        )}
                      </div>
                    </td>
                    <td className={`${styles.num} tnum`}>
                      {fmtInt(metrics.prsOpened)}
                      <span className={styles.subNum}> ({fmtInt(metrics.prsMerged)} merged)</span>
                    </td>
                    <td className={`${styles.num} tnum`}>{fmtPercent(metrics.mergeRate)}</td>
                    <td className={`${styles.num} tnum`}>{fmtInt(metrics.reviews)}</td>
                    <td className={`${styles.num} tnum`}>{fmtInt(metrics.issuesOpened)}</td>
                    <td className={`${styles.num} tnum`}>{fmtInt(metrics.commits)}</td>
                    <td className={`${styles.num} tnum`}>{fmtInt(repo.stargazers)}</td>
                    <td className={styles.lastActive}>{fmtDate(link.lastContributedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </main>
  );
}
