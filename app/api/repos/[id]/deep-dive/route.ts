import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";

// Enqueue an on-demand deep-dive summary for a repository.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id: repositoryId } = await params;
  // TODO: enforce UserSettings.deepDiveBudget before enqueueing.
  const job = await getQueue(QUEUE_NAMES.summaryDeepDive).add("deep-dive", {
    userId: session.user.id,
    repositoryId,
  });
  return NextResponse.json({ jobId: job.id });
}
