import { InferSchemaType, model, Schema } from "mongoose";

/**
 * Money owed to a creator for one approved order (exactly one payout per order — unique `orderId`).
 *
 * pending     → waiting to be sent (creator has no payout account yet, or not tried yet)
 * processing  → a Stripe transfer request is in flight (claimed by one worker / request)
 * paid        → Stripe transfer created; money is in the creator's Stripe balance
 * failed      → last attempt failed; retried by the payout sweep until `maxAttempts`
 *
 * The website shows pending / processing / failed as "Available" and paid as "Transferred".
 */
export const PAYOUT_STATUSES = ["pending", "processing", "paid", "failed"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

const payoutSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
    orderCode: { type: String, required: true },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    brandId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    /** Escrow payment that led to this payout; transfers use the platform's available balance. */
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    title: { type: String, required: true },
    currency: { type: String, default: "eur" },
    amountCents: { type: Number, required: true, min: 1 },

    status: { type: String, enum: PAYOUT_STATUSES, default: "pending" },
    attempts: { type: Number, default: 0 },
    /** Incremented for an explicit admin retry so Stripe gets a fresh idempotency key. */
    retryGeneration: { type: Number, default: 0 },
    /** The sweep retries a failed payout only after this time (backoff). */
    nextAttemptAt: { type: Date, default: () => new Date() },
    stripeTransferId: String,
    paidAt: Date,
    failureMessage: String,
  },
  { timestamps: true, versionKey: false },
);

// Creator payouts page, newest first.
payoutSchema.index({ creatorId: 1, createdAt: -1 });
// Sweep: what is due for (another) attempt.
payoutSchema.index({ status: 1, nextAttemptAt: 1 });
// Admin transactions list.
payoutSchema.index({ createdAt: -1 });

export type IPayout = InferSchemaType<typeof payoutSchema>;
export const Payout = model("Payout", payoutSchema, "payouts");
