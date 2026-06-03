import type { Job } from "bullmq";

/**
 * Developer profile summary (Sonnet) assembled from the user's computed metrics
 * plus highlights from already-generated repo metadata summaries (no re-fetch).
 * Throttled to material metric changes. See docs/SPEC.md.
 */
export async function summaryProfile(job: Job): Promise<void> {
  const data = job.data as { userId: string };
  // TODO: assemble metrics + reuse repo highlights, call Claude, upsert AISummary(PROFILE).
  void data;
}
