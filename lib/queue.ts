import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";

export const QUEUE_NAMES = {
  discover: "discover",
  syncRepo: "sync-repo",
  computeStats: "compute-stats",
  summaryMetadata: "summary-metadata",
  summaryDeepDive: "summary-deepdive",
  summaryProfile: "summary-profile",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

let connection: IORedis | undefined;

/** Shared ioredis connection (BullMQ recommends reusing one per process). */
export function getConnection(): IORedis {
  if (!connection) {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    connection = new IORedis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}

/** The shared connection typed for BullMQ's Queue/Worker `connection` option. */
export function bullConnection(): ConnectionOptions {
  return getConnection() as unknown as ConnectionOptions;
}

const queues = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: bullConnection() });
    queues.set(name, q);
  }
  return q;
}
