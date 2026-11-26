import { InferSchemaType, model, Schema } from "mongoose";
import { PACKAGE_PLATFORMS } from "../package/package.constant";
import { OFFER_DIRECTIONS } from "../offer/offer.constant";
import { ORDER_STATUSES } from "./order.constant";

/** A file uploaded by the creator (upload context `deliverable`, private — `/files/:id/url`). */
const deliverableFileSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, ref: "File", required: true },
    url: { type: String, required: true },
    name: { type: String, required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false },
);

/** One "Submit Deliverables" round: files and / or cloud links (Drive, Dropbox, Frame.io …). */
const deliverableSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 200 },
    notes: { type: String, maxlength: 2000 },
    files: { type: [deliverableFileSchema], default: [] },
    links: { type: [{ title: String, url: String, _id: false }], default: [] },
    submittedAt: { type: Date, required: true },
  },
  { _id: true },
);

/**
 * A campaign between one brand and one creator, created from an accepted offer.
 * Terms are copied from the offer so the order never changes if the offer / package is edited later.
 * Money is integer cents: `priceCents` = creator payout, `totalCents` = what the brand pays into escrow.
 */
const orderSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    /** One order per offer — the unique index makes "accept" safe to retry. */
    offerId: { type: Schema.Types.ObjectId, ref: "Offer", required: true, unique: true },
    offerDirection: { type: String, enum: OFFER_DIRECTIONS, required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    brandId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    packageId: { type: Schema.Types.ObjectId, ref: "Package" },
    title: { type: String, required: true },
    brief: { type: String, default: "" },
    requirements: { type: [String], default: [] },
    platforms: { type: [{ type: String, enum: PACKAGE_PLATFORMS }], default: [] },
    deliveryDays: { type: Number, required: true },

    priceCents: { type: Number, required: true },
    platformFeePercent: { type: Number, required: true },
    feeCents: { type: Number, required: true },
    totalCents: { type: Number, required: true },

    status: { type: String, enum: ORDER_STATUSES, default: "awaiting_payment" },
    /** The escrow payment; set together with `paidAt`. The delivery deadline counts from `paidAt`. */
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    paidAt: Date,
    dueAt: Date,

    /** Every submission round is kept, newest last (the brand reviews the latest one). */
    deliverables: { type: [deliverableSchema], default: [] },
    revisionCount: { type: Number, default: 0 },
    deliveredAt: Date,
    /** The brand must approve / ask for revisions / report before this, otherwise the order auto-approves. */
    reviewDueAt: Date,
    approvedAt: Date,
    /** true when approved by the auto-approve job, not by the brand. */
    autoApproved: { type: Boolean, default: false },
    completedAt: Date,
    cancelledAt: Date,

    /** Brand's review, written once when the campaign is completed. */
    review: {
      type: new Schema({ rating: { type: Number, min: 1, max: 5 }, comment: String, createdAt: Date }, { _id: false }),
      default: undefined,
    },

    /**
     * Set while a support ticket holds the order (`status: disputed`). `previousStatus` is where the
     * order goes back to when the issue is resolved without a refund / release.
     */
    hold: {
      type: new Schema({ ticketId: { type: Schema.Types.ObjectId, ref: "SupportTicket" }, previousStatus: String, since: Date }, { _id: false }),
      default: undefined,
    },
  },
  { timestamps: true, versionKey: false },
);

// "My campaigns", newest first, filterable by status.
orderSchema.index({ brandId: 1, status: 1, createdAt: -1 });
orderSchema.index({ creatorId: 1, status: 1, createdAt: -1 });
// Worker sweeps: auto-approve (submitted + review deadline passed) and auto-complete (approved, no review).
orderSchema.index({ status: 1, reviewDueAt: 1 });
orderSchema.index({ status: 1, approvedAt: 1 });
// Admin orders list.
orderSchema.index({ status: 1, createdAt: -1 });
// Public "Client Reviews" on a creator profile: only reviewed orders, newest first.
orderSchema.index({ creatorId: 1, "review.createdAt": -1 }, { partialFilterExpression: { "review.rating": { $exists: true } }, name: "creator_reviews" });

export type IOrder = InferSchemaType<typeof orderSchema>;
export const Order = model("Order", orderSchema, "orders");
