import { OutboxEvent } from "../app/modules/system/outbox.model";
import { getQueue, QueueName } from "../queues";
import { errorLogger } from "../shared/logger";

const BATCH_SIZE = 200;
const LOCK_MS = 60_000;
const MAX_ATTEMPTS = 10;

/**
 * Moves committed outbox rows into BullMQ.
 *
 * - Each row is claimed with an atomic `findOneAndUpdate` (pending → processing), so several
 *   worker instances can run this at once without double-dispatching.
 * - BullMQ jobId = `outbox:<rowId>` (or the row's business jobId), so if we crash after enqueueing
 *   but before marking the row dispatched, the retry is a no-op instead of a duplicate job.
 * - Rows stuck in `processing` (dispatcher died) are reclaimed after LOCK_MS.
 */
export const dispatchOutbox = async () => {
  let dispatched = 0;

  for (let i = 0; i < BATCH_SIZE; i++) {
    const now = new Date();
    const row = await OutboxEvent.findOneAndUpdate(
      {
        $or: [{ status: "pending" }, { status: "processing", lockedUntil: { $lt: now } }],
      },
      { $set: { status: "processing", lockedUntil: new Date(now.getTime() + LOCK_MS) }, $inc: { attempts: 1 } },
      { sort: { createdAt: 1 }, new: true },
    ).lean();
    if (!row) break;

    try {
      await getQueue(row.queue as QueueName).add(row.jobName, row.payload ?? {}, {
        jobId: row.jobId ?? `outbox:${row._id}`,
        ...(row.delayMs ? { delay: row.delayMs } : {}),
      });
      await OutboxEvent.updateOne(
        { _id: row._id },
        { $set: { status: "dispatched", dispatchedAt: new Date() }, $unset: { lockedUntil: 1, lastError: 1 } },
      );
      dispatched++;
    } catch (error: any) {
      const giveUp = (row.attempts ?? 0) >= MAX_ATTEMPTS;
      await OutboxEvent.updateOne(
        { _id: row._id },
        { $set: { status: giveUp ? "failed" : "pending", lastError: error.message }, $unset: { lockedUntil: 1 } },
      );
      errorLogger.error(`Outbox dispatch failed for ${row._id} (${row.queue}:${row.jobName}): ${error.message}`);
    }
  }
  return { dispatched };
};
