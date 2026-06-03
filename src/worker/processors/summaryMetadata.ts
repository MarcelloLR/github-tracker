import type { JobContext } from "@/worker/runJob";
import { prisma } from "@/lib/db";
import { MODELS } from "@/lib/anthropic/client";
import {
  metadataSystemPrompt,
  metadataUserPrompt,
  type RepoMetadataContext,
  TOKEN_CAPS,
} from "@/lib/anthropic/prompts";
import { generateSummary } from "@/lib/anthropic/generate";
import { cacheKey, getCachedSummary, upsertSummary } from "@/lib/anthropic/cache";

/**
 * Cheap codebase summary (Haiku) from DB-only context. Skip entirely on a cache
 * hit (AISummary.cacheKey). Repo-tier summaries are shared across users
 * (userId null). See lib/anthropic/* and docs/SPEC.md.
 *
 * NOTE: the full README text is not persisted in the DB (only `readmeHash`),
 * so the summary is built from description/topics/languages/recent commit
 * messages. The cache key still uses readmeHash so the summary is regenerated
 * whenever the README content changes.
 */
export async function summaryMetadata(jobCtx: JobContext): Promise<void> {
  const { job, log } = jobCtx;
  const { repositoryId } = job.data as { repositoryId: string };

  const repo = await prisma.repository.findUnique({
    where: { id: repositoryId },
    include: { languages: true },
  });
  if (!repo) return;

  // `sha` for the metadata cache key is the README content hash. If there is no
  // README hash yet, fall back to a stable marker so we still cache by repo.
  const sha = repo.readmeHash ?? "no-readme";
  const key = cacheKey("METADATA", repo.nameWithOwner, sha);

  // Cache hit → skip the Claude call entirely.
  if (await getCachedSummary(key)) {
    log.debug({ repositoryId, tier: "METADATA", cacheHit: true }, "summary.cache_hit");
    return;
  }
  log.debug({ repositoryId, tier: "METADATA", cacheHit: false }, "summary.generating");

  // Recent commit messages from this repo's contribution facts (any user — the
  // shared repo summary is user-agnostic).
  const commits = await prisma.contribution.findMany({
    where: { repositoryId, type: "COMMIT", title: { not: null } },
    orderBy: { occurredOn: "desc" },
    take: 30,
    select: { title: true },
  });

  const ctx: RepoMetadataContext = {
    nameWithOwner: repo.nameWithOwner,
    description: repo.description,
    topics: repo.topics,
    languages: repo.languages.map((l) => ({
      language: l.language,
      bytes: l.bytes,
    })),
    // README text is unavailable in the DB; metadata summary works from the rest.
    readme: null,
    recentCommitMessages: commits
      .map((c) => c.title)
      .filter((t): t is string => Boolean(t)),
    stars: repo.stargazers,
    license: repo.license,
  };

  const result = await generateSummary({
    model: MODELS.metadata,
    system: metadataSystemPrompt(),
    stableBlocks: [metadataUserPrompt(ctx)],
    inputTokenCap: TOKEN_CAPS.metadata,
    maxTokens: 1024,
  });

  await upsertSummary({
    tier: "METADATA",
    cacheKey: key,
    model: MODELS.metadata,
    inputHash: sha,
    summaryMd: result.summaryMd,
    highlights: result.highlights,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    // Shared repo-tier summary.
    userId: null,
    repositoryId: repo.id,
    organizationId: repo.organizationId,
  });
}
