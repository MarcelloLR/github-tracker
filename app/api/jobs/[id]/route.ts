import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";

// Poll job/sync status for the UI.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const job = await getQueue(QUEUE_NAMES.discover).getJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    id: job.id,
    state: await job.getState(),
    progress: job.progress,
  });
}
