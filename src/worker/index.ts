import "dotenv/config";
import { Worker } from "bullmq";
import { bullConnection, QUEUE_NAMES } from "@/lib/queue";
import { childLogger } from "@/lib/log";
import { runJob } from "@/worker/runJob";
import { scheduleRecurringSync } from "@/worker/queues";
import { discover } from "@/worker/processors/discover";
import { syncRepo } from "@/worker/processors/syncRepo";
import { computeStats } from "@/worker/processors/computeStats";
import { summaryMetadata } from "@/worker/processors/summaryMetadata";
import { summaryDeepDive } from "@/worker/processors/summaryDeepDive";
import { summaryProfile } from "@/worker/processors/summaryProfile";

const connection = bullConnection();
const log = childLogger({ component: "worker" });

const workers = [
  new Worker(QUEUE_NAMES.discover, runJob(QUEUE_NAMES.discover, (ctx) => discover(ctx)), { connection }),
  new Worker(QUEUE_NAMES.syncRepo, runJob(QUEUE_NAMES.syncRepo, (ctx) => syncRepo(ctx)), { connection }),
  new Worker(QUEUE_NAMES.computeStats, runJob(QUEUE_NAMES.computeStats, (ctx) => computeStats(ctx)), {
    connection,
  }),
  new Worker(QUEUE_NAMES.summaryMetadata, runJob(QUEUE_NAMES.summaryMetadata, (ctx) => summaryMetadata(ctx)), {
    connection,
  }),
  new Worker(QUEUE_NAMES.summaryDeepDive, runJob(QUEUE_NAMES.summaryDeepDive, (ctx) => summaryDeepDive(ctx)), {
    connection,
  }),
  new Worker(QUEUE_NAMES.summaryProfile, runJob(QUEUE_NAMES.summaryProfile, (ctx) => summaryProfile(ctx)), {
    connection,
  }),
];

// Worker-level listeners log at debug only: runJob already emits the single
// authoritative error line. These are a low-noise safety net for events that
// originate outside the processor (e.g. stalled jobs, connection blips).
for (const w of workers) {
  const queue = w.name;
  w.on("failed", (job, err) =>
    childLogger({ component: "worker", queue, jobId: job?.id }).debug({ err }, "worker.failed"),
  );
  w.on("error", (err) => childLogger({ component: "worker", queue }).debug({ err }, "worker.error"));
}

// Avoid a top-level await here: tsx/esbuild compiles this entry as CommonJS
// (package.json is not `"type": "module"`), which forbids top-level await.
scheduleRecurringSync()
  .then(() => log.info({ queues: workers.length }, "worker.started"))
  .catch((err) => {
    log.error({ err }, "worker.schedule_failed");
    process.exit(1);
  });

async function shutdown() {
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
