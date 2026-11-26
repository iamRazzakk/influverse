import { HydratedDocument, InferSchemaType, model, Schema } from "mongoose";
import { AUTH_TOKEN_PURPOSE, SUBJECT_TYPE } from "./auth.constant";

/** docs/03-data-models.md §1.4 — OTP / reset link / invite. Only the hash is stored. */
const authTokenSchema = new Schema(
  {
    subjectType: { type: String, enum: Object.values(SUBJECT_TYPE), required: true },
    subjectId: { type: Schema.Types.ObjectId },
    email: { type: String, required: true, lowercase: true },
    purpose: { type: String, enum: Object.values(AUTH_TOKEN_PURPOSE), required: true },
    codeHash: { type: String, required: true, select: false },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
    lastSentAt: Date,
    ip: String,
  },
  { timestamps: true, versionKey: false },
);

authTokenSchema.index({ email: 1, purpose: 1, usedAt: 1 });
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type IAuthToken = InferSchemaType<typeof authTokenSchema>;
export type AuthTokenDoc = HydratedDocument<IAuthToken>;
export const AuthToken = model("AuthToken", authTokenSchema, "auth_tokens");
