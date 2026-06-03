import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { computeMetrics, type ContribType } from "@/lib/metrics/compute";
import styles from "./portfolio.module.css";

// Public, unauthenticated portfolio export. Only renders when the owner has
// opted in (UserSettings.portfolioPublic). The viewer is NOT authenticated, so
// we resolve the user via the settings row's userId — never auth(). Private
// repositories are excluded from everything shown here.
export default async function PortfolioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const settings = await prisma.userSettings.findUnique({ where: { publicSlug: slug } });
  if (!settings || !settings.portfolioPublic) notFound();

  const userId = settings.userId;

  const [user, contributions, languages, repoLinks, profileSummary] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { login: true, name: true },
    }),
    prisma.contribution.findMany({
      where: { userId, repository: { isPrivate: false } },
      select: { type: true, mergedAt: true, cycleTimeSec: true, additions: true, deletions: true },
    }),
    prisma.repoLanguage.findMany({
      where: { repository: { isPrivate: false, userLinks: { some: { userId } } } },
      select: { language: true, bytes: true },
    }),
    prisma.userRepository.findMany({
      where: { userId, repository: { isPrivate: false } },
      select: {
        repository: {
          select: {
            nameWithOwner: true,
            description: true,
            stargazers: true,
            primaryLang: true,
          },
        },
      },
    }),
    prisma.aISummary.findFirst({
      where: { userId, tier: "PROFILE" },
      orderBy: { generatedAt: "desc" },
      select: { summaryMd: true },
    }),
  ]);

  const metrics = computeMetrics(
    contributions.map((c) => ({
      type: c.type as ContribType,
      mergedAt: c.mergedAt,
      cycleTimeSec: c.cycleTimeSec,
      additions: c.additions,
      deletions: c.deletions,
    })),
  );

  // Aggregate language bytes across the user's public repos -> top 8 by share.
  const langTotals = new Map<string, number>();
  for (const { language, bytes } of languages) {
    langTotals.set(language, (langTotals.get(language) ?? 0) + bytes);
  }
  const langBytesTotal = [...langTotals.values()].reduce((a, b) => a + b, 0);
  const topLanguages = [...langTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([language, bytes]) => ({
      language,
      pct: langBytesTotal > 0 ? (bytes / langBytesTotal) * 100 : 0,
    }));

  // Top repos by stars (public only). Dedupe defensively on nameWithOwner.
  const seen = new Set<string>();
  const topRepos = repoLinks
    .map((l) => l.repository)
    .filter((r) => {
      if (seen.has(r.nameWithOwner)) return false;
      seen.add(r.nameWithOwner);
      return true;
    })
    .sort((a, b) => b.stargazers - a.stargazers)
    .slice(0, 8);

  const displayName = user?.name || user?.login || "Developer";

  const headline: { label: string; value: number | string }[] = [
    { label: "PRs opened", value: metrics.prsOpened },
    { label: "PRs merged", value: metrics.prsMerged },
    {
      label: "Merge rate",
      value: metrics.mergeRate == null ? "—" : `${Math.round(metrics.mergeRate * 100)}%`,
    },
    { label: "Reviews", value: metrics.reviews },
    { label: "Issues", value: metrics.issuesOpened },
    { label: "Commits", value: metrics.commits },
  ];

  const hasAnyData =
    contributions.length > 0 || topRepos.length > 0 || topLanguages.length > 0;

  return (
    <main className="container">
      <header className={styles.header}>
        <h1>{displayName}</h1>
        {user?.login ? <p className={styles.subtle}>@{user.login}</p> : null}
        <p className={styles.subtle}>Open-source contribution portfolio</p>
      </header>

      {!hasAnyData ? (
        <p className={styles.empty}>
          This portfolio doesn&apos;t have any public contribution data yet.
        </p>
      ) : null}

      <section className={styles.section}>
        <h2>Headline metrics</h2>
        <ul className={styles.metrics}>
          {headline.map((m) => (
            <li key={m.label} className={styles.metric}>
              <div className={styles.metricValue}>{m.value}</div>
              <div className={styles.metricLabel}>{m.label}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Top languages</h2>
        {topLanguages.length === 0 ? (
          <p className={styles.empty}>No language data yet.</p>
        ) : (
          <ul className={styles.langList}>
            {topLanguages.map((l) => (
              <li key={l.language} className={styles.lang}>
                <span className={styles.langName}>{l.language}</span>
                <span className={styles.bar}>
                  <span
                    className={styles.barFill}
                    style={{ width: `${l.pct}%` }}
                  />
                </span>
                <span className={styles.langPct}>{l.pct.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2>Top repositories</h2>
        {topRepos.length === 0 ? (
          <p className={styles.empty}>No public repositories yet.</p>
        ) : (
          <ul className={styles.repoList}>
            {topRepos.map((r) => (
              <li key={r.nameWithOwner} className={styles.repo}>
                <span>
                  <span className={styles.repoName}>{r.nameWithOwner}</span>
                  {r.description ? (
                    <span className={styles.subtle}> — {r.description}</span>
                  ) : null}
                </span>
                <span className={styles.repoMeta}>
                  {r.primaryLang ? `${r.primaryLang} · ` : ""}★ {r.stargazers}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {profileSummary?.summaryMd ? (
        <section className={styles.section}>
          <h2>Developer profile</h2>
          {/* Render Markdown simply: preserve author line breaks as plain text
              (no new deps, no raw HTML injection). */}
          <div className={styles.summary} style={{ whiteSpace: "pre-wrap" }}>
            {profileSummary.summaryMd}
          </div>
        </section>
      ) : null}
    </main>
  );
}
