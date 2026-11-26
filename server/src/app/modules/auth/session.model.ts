import { HydratedDocument, InferSchemaType, model, Schema } from "mongoose";
import { SESSION_REVOKE_REASONS, SUBJECT_TYPE } from "./auth.constant";

/** docs/03-data-models.md §1.3 — one login = one session (refresh token record) */
const sessionSchema = new Schema(
  {
    subjectType: { type: String, enum: Object.values(SUBJECT_TYPE), required: true },
    subjectId: { type: Schema.Types.ObjectId, required: true },
    refreshTokenHash: { type: String, required: true, select: false },
    /** Rotation chain — if reuse is detected, the whole family is revoked */
    familyId: { type: String, required: true },
    rememberMe: { type: Boolean, default: true },
    expiresAt: { type: Date, required: true },
    lastUsedAt: Date,
    revokedAt: Date,
    revokedReason: { type: String, enum: SESSION_REVOKE_REASONS },
    userAgent: String,
    ip: String,
    deviceLabel: String,
  },
  { timestamps: true, versionKey: false },
);

sessionSchema.index({ subjectType: 1, subjectId: 1, revokedAt: 1 });
sessionSchema.index({ familyId: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ISession = InferSchemaType<typeof sessionSchema>;
export type SessionDoc = HydratedDocument<ISession>;
export const Session = model("Session", sessionSchema, "sessions");
