import { JobsOptions, Queue } from "bullmq";
import type Redis from "ioredis";
import { createRedisConnection } from "../config/redis.config";

/**
 * Queue registry (docs/00-final-plan.md §7).
 * The API process only calls `getQueue(..).add(..)`; processors live in `src/jobs/*` and run in the `worker.ts` process.
 */
export const QUEUES = {
  email: "email",
  order: "order",
  payment: "payment",
  search: "search",
  user: "user",
  export: "export",
  media: "media",
  stats: "stats",
  cleanup: "cleanup",
  // Website (Next.js) cache revalidate call
  revalidate: "revalidate",
  /** Moves committed transactional-outbox rows into the other queues (shared/outbox.ts). */
  outbox: "outbox",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Per-queue default retry (the table's "Retry" column). Can be overridden when adding a job. */
const ATTEMPTS: Record<QueueName, number> = {
  email: 5,
  order: 5,
  payment: 8,
  search: 5,
  user: 3,
  export: 3,
  media: 3,
  stats: 3,
  cleanup: 5,
  revalidate: 5,
  outbox: 1, // the dispatcher runs every 2 s anyway
};

const defaultJobOptions = (name: QueueName): JobsOptions => ({
  attempts: ATTEMPTS[name],
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  // Keep failed jobs (debug + admin alert); removed after 14 days
  removeOnFail: { age: 14 * 24 * 3600 },
});

let producerConnection: Redis | null = null;
const queues = new Map<QueueName, Queue>();

/** Lazy — queue is created on first use. All queues share one producer connection. */
export const getQueue = (name: QueueName): Queue => {
  let queue = queues.get(name);
  if (!queue) {
    if (!producerConnection) producerConnection = createRedisConnection("queue-producer");
    queue = new Queue(name, {
      connection: producerConnection,
      defaultJobOptions: defaultJobOptions(name),
    });
    queues.set(name, queue);
  }
  return queue;
};

export const closeQueues = async (): Promise<void> => {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
  if (producerConnection) {
    await producerConnection.quit().catch(() => producerConnection?.disconnect());
    producerConnection = null;
  }
};
