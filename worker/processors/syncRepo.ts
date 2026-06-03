import type { Job } from "bullmq";

/**
 * Stage 2. Pull PRs/reviews/issues/commits for one repo since the per-user
 * cursor, upsert Contribution facts, refresh languages/metadata via ETag, then
 * enqueue `compute-stats` and (if inputs changed) `summary-metadata`.
 */
export async function syncRepo(job: Job): Promise<void> {
  const data = job.data as { userId: string; repositoryId: string };
  // TODO: incremental fetch + upsert facts (idempotent on GitHub node ids).
  void data;
}
