import { NextResponse } from "next/server";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";
import { withRoute, requireApiUser } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/errors";

// Poll job/sync status for the UI. A job id can belong to any of the worker
// queues (discover, sync-repo, compute-stats, summary-*), so check each and
// return the first match.
export const GET = withRoute<{ id: string }>(async ({ params }) => {
  await requireApiUser();
  const { id } = params;

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

  throw new NotFoundError("job not found");
});
