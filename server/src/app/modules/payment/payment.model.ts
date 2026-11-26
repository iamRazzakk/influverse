import { InferSchemaType, model, Schema } from "mongoose";

/**
 * One brand payment (Stripe Checkout → PaymentIntent). Money is integer cents, EUR.
 *
 * Purposes:
 * - `offer_hold`          brand → creator offer: card is AUTHORIZED when the offer is sent (manual capture),
 *                         CAPTURED when the creator accepts, released (canceled) on decline / withdraw / expiry.
 * - `custom_offer_accept` creator → brand custom offer: charged immediately when the brand accepts the card.
 * - `order`               paying an order that is still `awaiting_payment` (accepted before payments existed).
 */
export const PAYMENT_PURPOSES = ["offer_hold", "custom_offer_accept", "order"] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

/** open → authorized (hold only) → captured; side exits: canceled, expired, failed, refunded. */
export const PAYMENT_STATUSES = ["open", "authorized", "captured", "canceled", "expired", "failed", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const paymentSchema = new Schema(
  {
    purpose: { type: String, enum: PAYMENT_PURPOSES, required: true },
    brandId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    offerId: { type: Schema.Types.ObjectId, ref: "Offer" },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },

    currency: { type: String, default: "eur" },
    /** Charged to the brand = creator payout + platform fee. */
    amountCents: { type: Number, required: true, min: 1 },
    payoutCents: { type: Number, required: true },
    feeCents: { type: Number, required: true },
    captureMethod: { type: String, enum: ["manual", "automatic"], required: true },

    checkoutSessionId: { type: String },
    paymentIntentId: { type: String },
    stripeInvoiceId: { type: String },
    status: { type: String, enum: PAYMENT_STATUSES, default: "open" },
    authorizedAt: Date,
    capturedAt: Date,
    canceledAt: Date,
    refundedAt: Date,
    failureMessage: String,
  },
  { timestamps: true, versionKey: false },
);

paymentSchema.index({ checkoutSessionId: 1 }, { unique: true, partialFilterExpression: { checkoutSessionId: { $type: "string" } } });
paymentSchema.index({ paymentIntentId: 1 }, { unique: true, partialFilterExpression: { paymentIntentId: { $type: "string" } } });
paymentSchema.index({ offerId: 1, createdAt: -1 });
paymentSchema.index({ orderId: 1 });
paymentSchema.index({ brandId: 1, createdAt: -1 });

export type IPayment = InferSchemaType<typeof paymentSchema>;
export const Payment = model("Payment", paymentSchema, "payments");

/**
 * Processed Stripe events. The unique `eventId` makes webhook handling idempotent:
 * Stripe re-sends events, and a duplicate is acknowledged without running twice.
 */
const webhookEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
// Stripe retries for up to 3 days — keep 30 days, then drop.
webhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

export const WebhookEvent = model("WebhookEvent", webhookEventSchema, "webhook_events");
