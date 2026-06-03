import type { Job } from "bullmq";
import { prisma } from "@/lib/db";
import { computeMetrics, type ContributionLike } from "@/lib/metrics/compute";
import { computeStreaks } from "@/lib/metrics/streaks";
import { MODELS } from "@/lib/anthropic/client";
import {
  profileSystemPrompt,
  profileUserPrompt,
  type ProfileContext,
  type ProfileRepoHighlight,
  TOKEN_CAPS,
} from "@/lib/anthropic/prompts";
import { generateSummary } from "@/lib/anthropic/generate";
import {
  cacheKey,
  getCachedSummary,
  hashJson,
  upsertSummary,
} from "@/lib/anthropic/cache";

const TOP_REPOS = 5;

/**
 * Developer profile summary (Sonnet) assembled from the user's computed metrics
 * plus highlights from already-generated repo METADATA summaries (no re-fetch).
 * Cache key hashes rounded metrics + the member summary ids, so it naturally
 * throttles regeneration to material changes. PROFILE rows set userId.
 * See docs/SPEC.md.
 */
export async function summaryProfile(job: Job): Promise<void> {
  const { userId } = job.data as { userId: string };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { login: true },
  });

  // All of this user's contribution facts → global metrics + streak.
  const contribs = await prisma.contribution.findMany({
    where: { userId },
    select: {
      type: true,
      mergedAt: true,
      cycleTimeSec: true,
      additions: true,
      deletions: true,
      occurredOn: true,
      repositoryId: true,
    },
  });

  const metrics = computeMetrics(contribs as ContributionLike[]);
  const streak = computeStreaks(
    contribs.map((c) => c.occurredOn),
    new Date(),
  );
  const distinctRepos = new Set(contribs.map((c) => c.repositoryId)).size;

  // Top repos by this user's contribution volume, then reuse their existing
  // METADATA summaries (shared, userId null) as profile highlights. No re-fetch.
  const topRepoIds = rankTopRepos(contribs, TOP_REPOS);
  const highlights = await loadRepoHighlights(topRepoIds);

  // Cache key sha = hash(rounded metrics + member summary ids). Rounding keeps
  // immaterial drift (e.g. one extra commit) from invalidating the cache.
  const sha = hashJson({
    metrics: roundMetrics(metrics),
    streak,
    distinctRepos,
    summaryIds: highlights.summaryIds,
  });
  const scope = user?.login ?? userId;
  const key = cacheKey("PROFILE", scope, sha);

  if (await getCachedSummary(key)) return;

  const ctx: ProfileContext = {
    login: user?.login,
    metrics,
    streak,
    distinctRepos,
    topRepoHighlights: highlights.items,
  };

  const result = await generateSummary({
    model: MODELS.profile,
    system: profileSystemPrompt(),
    stableBlocks: [profileUserPrompt(ctx)],
    inputTokenCap: TOKEN_CAPS.profile,
    maxTokens: 2048,
  });

  await upsertSummary({
    tier: "PROFILE",
    cacheKey: key,
    model: MODELS.profile,
    inputHash: sha,
    summaryMd: result.summaryMd,
    highlights: result.highlights,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    // Per-user summary.
    userId,
    repositoryId: null,
  });
}

/** Most-contributed-to repository ids for this user, by row count. */
function rankTopRepos(
  contribs: { repositoryId: string }[],
  top: number,
): string[] {
  const counts = new Map<string, number>();
  for (const c of contribs) {
    counts.set(c.repositoryId, (counts.get(c.repositoryId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([id]) => id);
}

/**
 * Load the shared METADATA summaries for the given repos and turn each into a
 * compact highlight (summary highlights, falling back to a markdown snippet).
 * Returns the highlight items plus the stable summary ids for the cache key.
 */
async function loadRepoHighlights(
  repositoryIds: string[],
): Promise<{ items: ProfileRepoHighlight[]; summaryIds: string[] }> {
  if (repositoryIds.length === 0) return { items: [], summaryIds: [] };

  const summaries = await prisma.aISummary.findMany({
    where: { tier: "METADATA", repositoryId: { in: repositoryIds } },
    select: {
      id: true,
      repositoryId: true,
      summaryMd: true,
      highlights: true,
      repository: { select: { nameWithOwner: true } },
    },
  });

  // Preserve the input (rank) order.
  const byRepo = new Map(summaries.map((s) => [s.repositoryId, s]));
  const items: ProfileRepoHighlight[] = [];
  const summaryIds: string[] = [];

  for (const repoId of repositoryIds) {
    const s = byRepo.get(repoId);
    if (!s || !s.repository) continue;
    summaryIds.push(s.id);
    items.push({
      nameWithOwner: s.repository.nameWithOwner,
      summary: highlightSnippet(s.highlights, s.summaryMd),
    });
  }
  return { items, summaryIds };
}

/** Prefer the structured highlights array; else a short slice of the markdown. */
function highlightSnippet(highlights: unknown, summaryMd: string): string {
  if (Array.isArray(highlights) && highlights.length > 0) {
    return highlights
      .filter((h): h is string => typeof h === "string")
      .map((h) => `- ${h}`)
      .join("\n");
  }
  return summaryMd.length > 600 ? `${summaryMd.slice(0, 600)}…` : summaryMd;
}

/** Round metrics so immaterial changes don't invalidate the profile cache. */
function roundMetrics(m: ReturnType<typeof computeMetrics>) {
  const bucket = (n: number, size: number) => Math.round(n / size) * size;
  return {
    prsOpened: m.prsOpened,
    prsMerged: m.prsMerged,
    mergeRate: m.mergeRate == null ? null : Math.round(m.mergeRate * 20) / 20, // 5% buckets
    reviews: m.reviews,
    issuesOpened: m.issuesOpened,
    commits: bucket(m.commits, 5),
    additions: bucket(m.additions, 100),
    deletions: bucket(m.deletions, 100),
    cycleTimeP50: m.cycleTimeP50 == null ? null : bucket(m.cycleTimeP50, 3600),
    cycleTimeP90: m.cycleTimeP90 == null ? null : bucket(m.cycleTimeP90, 3600),
  };
}
