import type { Job } from "bullmq";

/**
 * Stage 3. Recompute StatSnapshot rollups (global/repo/org) for the affected
 * scope from Contribution facts. DB-only and fast. See lib/metrics/*.
 */
export async function computeStats(job: Job): Promise<void> {
  const data = job.data as { userId: string; repositoryId?: string };
  // TODO: upsert StatSnapshot rows for the affected day buckets + scopes.
  void data;
}
