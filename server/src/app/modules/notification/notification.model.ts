import { InferSchemaType, model, Schema } from "mongoose";

/**
 * docs/03 §11.1. D24: dispute types removed, support / report types added.
 * Add new types here when needed (string enum).
 */
export const NOTIFICATION_TYPES = [
  // user
  "offer_received",
  "offer_accepted",
  "offer_declined",
  "offer_expired",
  "escrow_funded",
  "order_delivered",
  "revision_requested",
  "order_approved",
  "order_cancelled",
  "payment_released",
  "refund_issued",
  "deadline_reminder",
  "order_overdue",
  "order_on_hold",
  "admin_nudge",
  "new_message",
  "review_received",
  "creator_approved",
  "creator_action_required",
  "verification_approved",
  "verification_rejected",
  "account_suspended",
  "payout_paid",
  "payout_failed",
  "ticket_reply",
  "ticket_resolved",
  // admin
  "new_creator_application",
  "new_verification",
  "new_ticket",
  "new_report",
  "ticket_user_reply",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const notificationSchema = new Schema(
  {
    recipientType: { type: String, enum: ["user", "admin"], required: true },
    recipientId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, maxlength: 1000 },
    /** Frontend route, e.g. `/brand/orders/ORD-10021` */
    link: String,
    data: Schema.Types.Mixed,
    readAt: Date,
    channels: { inApp: { type: Boolean, default: true }, email: { type: Boolean, default: false } },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

// List + unread count
notificationSchema.index({ recipientType: 1, recipientId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ recipientType: 1, recipientId: 1, createdAt: -1 });
// Auto-delete after 180 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

export type INotification = InferSchemaType<typeof notificationSchema>;
export const Notification = model("Notification", notificationSchema, "notifications");
