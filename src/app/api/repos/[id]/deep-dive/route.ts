import { NextResponse } from "next/server";
import { getQueue, QUEUE_NAMES, withCorrelation } from "@/lib/queue";
import { isDeepDiveBudgetExceeded } from "@/lib/anthropic/cache";
import { withRoute, requireApiUser } from "@/lib/api/handler";
import { BudgetExceededError } from "@/lib/errors";

// Enqueue an on-demand deep-dive summary for a repository.
export const POST = withRoute<{ id: string }>(async ({ params, requestId, log }) => {
  const userId = await requireApiUser();
  const { id: repositoryId } = params;

  // Enforce the monthly deep-dive budget before spending any work.
  if (await isDeepDiveBudgetExceeded(userId)) {
    throw new BudgetExceededError("deep-dive budget exceeded", { context: { userId, repositoryId } });
  }

  const job = await getQueue(QUEUE_NAMES.summaryDeepDive).add(
    "deep-dive",
    withCorrelation({ userId, repositoryId }, requestId),
  );
  log.info({ userId, repositoryId, jobId: job.id }, "deepDive.enqueued");
  return NextResponse.json({ jobId: job.id });
});
