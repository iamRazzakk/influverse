import { InferSchemaType, model, Schema } from "mongoose";

/**
 * Transactional outbox.
 *
 * Problem it solves: "save to Mongo, then enqueue a job" is not atomic — if the process dies in
 * between, the job is lost; if the transaction rolls back after enqueueing, the job runs for data
 * that doesn't exist. Instead, services write an outbox row in the SAME transaction as their data.
 * The worker later moves committed rows into BullMQ (see jobs/outbox.processor.ts).
 */
export const OUTBOX_STATUS = ["pending", "processing", "dispatched", "failed"] as const;

const outboxEventSchema = new Schema(
  {
    /** Target BullMQ queue + job name + payload. */
    queue: { type: String, required: true },
    jobName: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    /** Optional BullMQ delay (e.g. auto-release in 5 days). */
    delayMs: { type: Number, min: 0 },
    /** Optional stable job id for business-level de-duplication (e.g. `auto-release:<orderId>`). */
    jobId: String,
    status: { type: String, enum: OUTBOX_STATUS, default: "pending", required: true },
    attempts: { type: Number, default: 0 },
    /** A row stuck in `processing` past this time (dispatcher crashed) is picked up again. */
    lockedUntil: Date,
    dispatchedAt: Date,
    lastError: String,
  },
  { timestamps: true, versionKey: false },
);

// Dispatcher scan: oldest pending first.
outboxEventSchema.index({ status: 1, createdAt: 1 });
// Keep dispatched rows for 7 days for debugging, then let Mongo delete them.
outboxEventSchema.index(
  { dispatchedAt: 1 },
  { expireAfterSeconds: 7 * 24 * 3600, partialFilterExpression: { status: "dispatched" } },
);

export type IOutboxEvent = InferSchemaType<typeof outboxEventSchema>;
export const OutboxEvent = model("OutboxEvent", outboxEventSchema, "outbox_events");
