import { InferSchemaType, model, Schema } from "mongoose";
import { PACKAGE_LIMITS, PACKAGE_PLATFORMS } from "../package/package.constant";
import { OFFER_DIRECTIONS, OFFER_LIMITS, OFFER_STATUSES } from "./offer.constant";

/**
 * A collaboration offer between one brand and one creator (docs/messaging-and-offer-plan.md).
 * Money is integer cents. `priceCents` = creator payout; the brand pays it + the platform fee,
 * whose percent is snapshotted here so a later settings change doesn't alter an open offer.
 */
const offerSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    direction: { type: String, enum: OFFER_DIRECTIONS, required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    brandId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    /** Brand offers built from a creator package: price / turnaround / platforms are locked to it. */
    packageId: { type: Schema.Types.ObjectId, ref: "Package" },
    packageTitle: String,

    title: { type: String, required: true, trim: true, maxlength: OFFER_LIMITS.maxTitle },
    brief: { type: String, maxlength: OFFER_LIMITS.maxBrief, default: "" },
    /** One line each: deliverables / requirements. */
    deliverables: { type: [String], default: [] },
    platforms: {
      type: [{ type: String, enum: PACKAGE_PLATFORMS }],
      validate: [(v: string[]) => v.length >= 1, "At least one platform"],
    },

    priceCents: { type: Number, required: true, min: PACKAGE_LIMITS.minPriceCents, max: PACKAGE_LIMITS.maxPriceCents },
    platformFeePercent: { type: Number, required: true, min: 0, max: 50 },
    deliveryDays: { type: Number, required: true, min: OFFER_LIMITS.minDeliveryDays, max: OFFER_LIMITS.maxDeliveryDays },

    status: { type: String, enum: OFFER_STATUSES, default: "pending" },
    expiresAt: { type: Date, required: true },
    respondedAt: Date,
    declineReason: { type: String, maxlength: 500 },

    /** Chat message that shows this offer (card for creator offers, "Offer sent" notice for brand offers). */
    messageId: { type: Schema.Types.ObjectId, ref: "Message" },
    /** Brand's payment: the card hold (brand offers) or the charge (custom offers). */
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    /** The order (campaign) this offer became when it was accepted. */
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
  },
  { timestamps: true, versionKey: false },
);

// Expiry job: open offers past their deadline.
offerSchema.index({ status: 1, expiresAt: 1 });
// "Offers I received / sent", newest first, filterable by status.
offerSchema.index({ creatorId: 1, direction: 1, status: 1, createdAt: -1 });
offerSchema.index({ brandId: 1, direction: 1, status: 1, createdAt: -1 });

export type IOffer = InferSchemaType<typeof offerSchema>;
export const Offer = model("Offer", offerSchema, "offers");
