import type { Job } from "bullmq";

/**
 * Stage 1. For a `sweep` job, fan out a per-user discover job. For a per-user
 * job, run CONTRIBUTIONS_QUERY, upsert Repository/Organization + UserRepository
 * links, and enqueue `sync-repo` for repos whose pushedAt/counts changed.
 * See docs/SPEC.md.
 */
export async function discover(job: Job): Promise<void> {
  const data = job.data as { userId?: string; sweep?: boolean };
  // TODO: if data.sweep -> enqueue a discover job per active user.
  // TODO: else -> run discovery for data.userId.
  void data;
}
