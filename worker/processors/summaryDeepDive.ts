import type { Job } from "bullmq";

/**
 * On-demand deep-dive summary (Sonnet/Opus). Run the deterministic file selector,
 * fetch the selected blobs by SHA, summarize architecture/patterns. Budget-gated
 * by UserSettings.deepDiveBudget; cached on HEAD commit SHA. See docs/SPEC.md.
 */
export async function summaryDeepDive(job: Job): Promise<void> {
  const data = job.data as { userId: string; repositoryId: string };
  // TODO: enforce budget, select files, fetch blobs, call Claude, upsert AISummary(DEEP_DIVE).
  void data;
}
