import mongoose, { ClientSession, Model } from "mongoose";
import { StatusCodes } from "http-status-codes";
import ApiError from "../errors/ApiErrors";

/**
 * Runs `fn` inside a MongoDB ACID transaction (requires a replica set).
 *
 * - Any error thrown inside `fn` aborts the transaction: every write made with `session` is rolled back.
 * - Transient errors (write conflicts, primary step-down) are retried automatically by the driver,
 *   so `fn` must be safe to run more than once — don't call external APIs (Stripe, email) inside it.
 *   Record those as outbox jobs instead (shared/outbox.ts).
 * - Snapshot reads + majority writes: the transaction sees one consistent view and survives failover.
 *
 * Policy (D26): use this ONLY for money movements (escrow, wallet, ledger, refunds — DoD #6), for
 * actions that combine roughly 4–5 operations, and for account registration. Small CRUD uses atomic
 * single-document updates / conditional updates instead (cheaper, no write-conflict retries).
 */
export const withTransaction = async <T>(fn: (session: ClientSession) => Promise<T>): Promise<T> => {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" },
    );
    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * Atomically increments a counter only while it is below `max` — a race-free "reserve a slot".
 * Count-then-insert is NOT safe: two parallel requests can both see 2/3 and both insert.
 * Here the check and the increment are a single document update, so only one can win.
 *
 * Throws 409 with `limitMessage` when the limit is reached.
 */
export const incrementWithinLimit = async (
  model: Model<any>,
  filter: Record<string, unknown>,
  field: string,
  max: number,
  limitMessage: string,
  session?: ClientSession,
) => {
  const result = await model.updateOne({ ...filter, [field]: { $lt: max } }, { $inc: { [field]: 1 } }, { session });
  if (result.modifiedCount !== 1) throw new ApiError(StatusCodes.CONFLICT, limitMessage);
};

/** Counterpart of `incrementWithinLimit` — never goes below zero. */
export const decrementCounter = (model: Model<any>, filter: Record<string, unknown>, field: string, session?: ClientSession) =>
  model.updateOne({ ...filter, [field]: { $gt: 0 } }, { $inc: { [field]: -1 } }, { session });

export const isObjectId = (value: unknown): boolean =>
  typeof value === "string" && mongoose.isValidObjectId(value) && /^[a-f0-9]{24}$/i.test(value);
