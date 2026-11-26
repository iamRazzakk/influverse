import { InferSchemaType, model, Schema } from "mongoose";

/**
 * Every admin write action is recorded here (docs/03 §14.1, Definition of Done #5).
 * Append-only: nothing in the app updates or deletes audit rows.
 */
export const AUDIT_ACTIONS = [
  "admin.login",
  "user.suspend",
  "user.reactivate",
  "creator.approve",
  "creator.action_required",
  "creator.feature",
  "verification.approve",
  "verification.reject",
  "order.nudge",
  "order.extend_deadline",
  "order.force_release",
  "order.refund",
  "order.hold_release",
  "ticket.reply",
  "ticket.update",
  "cms.update",
  "settings.update",
  "team.invite",
  "team.update",
  "team.suspend",
  "team.activate",
  "team.remove",
  "review.hide",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

const auditLogSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    /** Copy of the admin at the time of the action — survives later renames / deletion. */
    adminSnapshot: { name: String, email: String, role: String },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    targetType: { type: String, required: true },
    targetId: { type: Schema.Types.ObjectId },
    targetCode: String,
    /** Only the fields that changed. */
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    reason: { type: String, maxlength: 1000 },
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditLogSchema.index({ adminId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

export type IAuditLog = InferSchemaType<typeof auditLogSchema>;
export const AuditLog = model("AuditLog", auditLogSchema, "audit_logs");
