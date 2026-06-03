import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getQueue, QUEUE_NAMES, withCorrelation } from "@/lib/queue";
import { withRoute, requireApiUser } from "@/lib/api/handler";

// Skip re-enqueueing if a sync already ran or was enqueued within this window.
const DEBOUNCE_MS = 2 * 60 * 1000; // 2 minutes

/**
 * "Refresh now" — enqueue a high-priority discover job for the current user.
 *
 * Debounced: if the user's SyncState shows a sync already QUEUED/RUNNING, or a
 * very recent incremental sync, we don't enqueue a duplicate. When possible we
 * return the in-flight discover job id so the UI can keep polling it; otherwise
 * we return { debounced: true }.
 */
export const POST = withRoute(async ({ requestId, log }) => {
  const userId = await requireApiUser();

  const syncState = await prisma.syncState.findUnique({ where: { userId } });
  const recentlySynced =
    syncState?.lastIncrSyncAt != null &&
    Date.now() - syncState.lastIncrSyncAt.getTime() < DEBOUNCE_MS;
  const inFlight = syncState?.status === "QUEUED" || syncState?.status === "RUNNING";

  const queue = getQueue(QUEUE_NAMES.discover);

  if (inFlight || recentlySynced) {
    // Try to hand back the existing pending/active discover job for this user.
    const existing = await queue.getJobs(["active", "waiting", "delayed", "prioritized"]);
    const mine = existing.find(
      (j) => (j.data as { userId?: string } | undefined)?.userId === userId,
    );
    if (mine) {
      log.debug({ userId, jobId: mine.id, inFlight, recentlySynced }, "sync.debounced");
      return NextResponse.json({ jobId: mine.id, debounced: true });
    }
    log.debug({ userId, inFlight, recentlySynced }, "sync.debounced");
    return NextResponse.json({ debounced: true });
  }

  const job = await queue.add("manual", withCorrelation({ userId }, requestId), { priority: 1 });
  log.info({ userId, jobId: job.id }, "sync.enqueued");
  return NextResponse.json({ jobId: job.id });
});
