import { ClientSession } from "mongoose";
import { OutboxEvent } from "../app/modules/system/outbox.model";
import { getQueue, QueueName, QUEUES } from "../queues";
import { errorLogger } from "./logger";
import { JOB } from "../jobs/jobNames";

export type OutboxJob = {
  queue: QueueName;
  jobName: string;
  payload?: Record<string, unknown>;
  delayMs?: number;
  /** Business-level dedupe key; the same jobId is never enqueued twice by BullMQ. */
  jobId?: string;
};


/**
 * Records jobs that must run only if the current transaction commits.
 *
 *   await withTransaction(async (session) => {
 *     await Order.updateOne(..., { session });
 *     await outbox.add(session, [{ queue: QUEUES.email, jobName: "send", payload }]);
 *   });
 *   outbox.kick(); // optional: dispatch right away instead of waiting for the next poll
 */
const add = async (session: ClientSession, jobs: OutboxJob[]) => {
  if (!jobs.length) return;
  await OutboxEvent.insertMany(jobs, { session });
};

/**
 * Asks the worker to dispatch now. Safe to call often: a fixed jobId means at most one
 * pending "dispatch" job exists at a time. Failure is harmless — the 2 s poll picks rows up anyway.
 */
const kick = () => {
  getQueue(QUEUES.outbox)
    .add(JOB.outboxDispatch, {}, { jobId: "outbox-kick", removeOnComplete: true, removeOnFail: true })
    .catch((error) => errorLogger.error(`outbox.kick failed: ${error.message}`));
};

export const outbox = { add, kick };
