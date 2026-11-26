import { HydratedDocument, InferSchemaType, model, Schema } from "mongoose";
import {
  BAN_TYPES,
  ESCROW_DISPOSITIONS,
  LANGUAGES,
  USER_ROLES,
  USER_STATUS,
} from "./user.constant";

/** docs/03-data-models.md §1.1 — brand + creator login account. Profiles live in separate collections. */
const userSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, trim: true },
    avatar: { type: String },
    status: { type: String, enum: Object.values(USER_STATUS), default: USER_STATUS.active, required: true },
    emailVerified: { type: Boolean, default: false },
    onboardingCompleted: { type: Boolean, default: false },
    onboardingStep: { type: Number, default: 1, min: 1 },
    preferredLanguage: { type: String, enum: LANGUAGES, default: "en" },
    notificationPrefs: {
      offers: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
      deliverables: { type: Boolean, default: true },
      payouts: { type: Boolean, default: true },
      marketing: { type: Boolean, default: true },
    },
    ban: {
      type: new Schema(
        {
          type: { type: String, enum: BAN_TYPES },
          reason: String,
          escrowDisposition: { type: String, enum: ESCROW_DISPOSITIONS },
          notes: String,
          until: Date,
          bannedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
          bannedAt: Date,
        },
        { _id: false },
      ),
      default: undefined,
    },
    deactivation: {
      type: new Schema({ requestedAt: Date, scheduledFor: Date, reason: String }, { _id: false }),
      default: undefined,
    },
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: Date,
    lastLoginIp: String,
    failedLoginCount: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
    stats: {
      totalVolumeCents: { type: Number, default: 0 },
      ordersCount: { type: Number, default: 0 },
      disputesCount: { type: Number, default: 0 },
    },
  },
  { timestamps: true, versionKey: false },
);

// Admin user list: role + status filter, newest first
userSchema.index({ role: 1, status: 1, createdAt: -1 });
// Admin sort by volume / deals
userSchema.index({ role: 1, "stats.totalVolumeCents": -1 });
userSchema.index({ role: 1, "stats.ordersCount": -1 });
// Deactivation finalize job
userSchema.index({ status: 1, "deactivation.scheduledFor": 1 });
userSchema.index({ name: "text", email: "text" }, { weights: { name: 3, email: 1 }, name: "user_text" });

userSchema.set("toJSON", {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.passwordHash;
    delete ret.failedLoginCount;
    delete ret.lockedUntil;
    delete ret.tokenVersion;
    delete ret.lastLoginIp;
    return ret;
  },
});

export type IUser = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<IUser>;
export const User = model("User", userSchema, "users");
