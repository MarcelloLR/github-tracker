import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";

// "Refresh now" — enqueue a high-priority discover job for the current user.
// TODO: debounce to ~once per few minutes per user.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const job = await getQueue(QUEUE_NAMES.discover).add(
    "manual",
    { userId: session.user.id },
    { priority: 1 },
  );
  return NextResponse.json({ jobId: job.id });
}
