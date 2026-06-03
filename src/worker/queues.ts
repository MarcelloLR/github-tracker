import { getQueue, QUEUE_NAMES } from "@/lib/queue";

/**
 * Register the recurring discovery sweep. The repeatable "sweep" job fans out a
 * per-user `discover` job each interval (staggered) — for the scaffold we just
 * register the repeatable; the processor will enqueue per-user work.
 */
export async function scheduleRecurringSync(): Promise<void> {
  const hours = Number(process.env.SYNC_INTERVAL_HOURS ?? "3");
  await getQueue(QUEUE_NAMES.discover).add(
    "sweep",
    { sweep: true },
    { repeat: { every: hours * 60 * 60 * 1000 }, jobId: "discover-sweep" },
  );
}
