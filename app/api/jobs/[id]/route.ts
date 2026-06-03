import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";

// Poll job/sync status for the UI. A job id can belong to any of the worker
// queues (discover, sync-repo, compute-stats, summary-*), so check each and
// return the first match.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  for (const name of Object.values(QUEUE_NAMES)) {
    const job = await getQueue(name).getJob(id);
    if (!job) continue;
    return NextResponse.json({
      id: job.id,
      queue: name,
      state: await job.getState(),
      progress: job.progress,
    });
  }

  return NextResponse.json({ error: "not found" }, { status: 404 });
}
