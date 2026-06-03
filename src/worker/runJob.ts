import { DelayedError, type Job, type Processor } from "bullmq";
import type { Logger } from "pino";
import { prisma } from "@/lib/db";
import { childLogger } from "@/lib/log";
import { toAppError } from "@/lib/errors";

// Unified worker job wrapper. Register every processor via `runJob(queue, fn)`
// in worker/index.ts. It binds a child logger {component, queue, jobId,
// correlationId, userId}, logs start/finish with duration, and is the single
// error-logging + failure-recording site for the worker tier:
//
//   - DelayedError (the rate-limit gate's deliberate re-queue) passes straight
//     through: not logged as an error, SyncState untouched.
//   - Any other throw is logged once at error level and, when the job carries a
//     userId, best-effort recorded onto that user's SyncState (status=ERROR,
//     lastError), then re-thrown so BullMQ marks the job failed.
//
// This standardizes (and replaces) the ad-hoc try/catch that previously lived
// only in the discover processor — every processor now records its failures.

export interface JobContext {
  job: Job;
  log: Logger;
  correlationId?: string;
}

interface BaseJobData {
  userId?: string;
  correlationId?: string;
}

export function runJob(queue: string, fn: (ctx: JobContext) => Promise<void>): Processor {
  return async (job: Job) => {
    const data = (job.data ?? {}) as BaseJobData;
    const correlationId = data.correlationId;
    const log = childLogger({
      component: "worker",
      queue,
      jobId: job.id,
      correlationId,
      userId: data.userId,
    });
    const start = Date.now();
    log.info({ attempt: job.attemptsMade + 1 }, "job.start");
    try {
      await fn({ job, log, correlationId });
      log.info({ durationMs: Date.now() - start }, "job.finish");
    } catch (err) {
      // Rate-limit deferral: a deliberate re-queue, not a failure.
      if (err instanceof DelayedError) throw err;
      const app = toAppError(err);
      log.error({ err: app, code: app.code, durationMs: Date.now() - start }, "job.error");
      if (data.userId) {
        await prisma.syncState
          .update({ where: { userId: data.userId }, data: { status: "ERROR", lastError: app.message } })
          .catch(() => {
            // SyncState row may not exist yet for this user; never mask the
            // original job error with a bookkeeping failure.
          });
      }
      throw err;
    }
  };
}
