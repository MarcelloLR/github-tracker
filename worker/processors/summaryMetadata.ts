import type { Job } from "bullmq";

/**
 * Cheap codebase summary (Haiku) from DB-only context. Skip entirely on a cache
 * hit (AISummary.cacheKey). Repo-tier summaries are shared across users.
 * See lib/anthropic/* and docs/SPEC.md.
 */
export async function summaryMetadata(job: Job): Promise<void> {
  const data = job.data as { repositoryId: string };
  // TODO: build context, check cache, call Claude, upsert AISummary(METADATA).
  void data;
}
