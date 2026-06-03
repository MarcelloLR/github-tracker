import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";

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
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

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
      return NextResponse.json({ jobId: mine.id, debounced: true });
    }
    return NextResponse.json({ debounced: true });
  }

  const job = await queue.add("manual", { userId }, { priority: 1 });
  return NextResponse.json({ jobId: job.id });
}
