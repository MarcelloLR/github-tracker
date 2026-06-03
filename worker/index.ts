import "dotenv/config";
import { Worker } from "bullmq";
import { bullConnection, QUEUE_NAMES } from "@/lib/queue";
import { scheduleRecurringSync } from "@/worker/queues";
import { discover } from "@/worker/processors/discover";
import { syncRepo } from "@/worker/processors/syncRepo";
import { computeStats } from "@/worker/processors/computeStats";
import { summaryMetadata } from "@/worker/processors/summaryMetadata";
import { summaryDeepDive } from "@/worker/processors/summaryDeepDive";
import { summaryProfile } from "@/worker/processors/summaryProfile";

const connection = bullConnection();

const workers = [
  new Worker(QUEUE_NAMES.discover, discover, { connection }),
  new Worker(QUEUE_NAMES.syncRepo, syncRepo, { connection }),
  new Worker(QUEUE_NAMES.computeStats, computeStats, { connection }),
  new Worker(QUEUE_NAMES.summaryMetadata, summaryMetadata, { connection }),
  new Worker(QUEUE_NAMES.summaryDeepDive, summaryDeepDive, { connection }),
  new Worker(QUEUE_NAMES.summaryProfile, summaryProfile, { connection }),
];

await scheduleRecurringSync();

console.log(`[worker] started — ${workers.length} queues listening`);

async function shutdown() {
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
