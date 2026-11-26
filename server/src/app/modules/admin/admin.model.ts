import { HydratedDocument, InferSchemaType, model, Schema } from "mongoose";
import { ADMIN_ROLE, ADMIN_ROLES, ADMIN_STATUS } from "./admin.constant";

/** docs/03-data-models.md §1.2 — dashboard user, separate from `users` */
const adminSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false }, // absent until the invite is accepted
    name: { type: String, required: true, trim: true, maxlength: 100 },
    avatar: String,
    role: { type: String, enum: ADMIN_ROLES, default: ADMIN_ROLE.moderator, required: true },
    status: { type: String, enum: Object.values(ADMIN_STATUS), default: ADMIN_STATUS.invited, required: true },
    twoFactorEnabled: { type: Boolean, default: false },
    invitedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: Date,
    failedLoginCount: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
    deletedAt: Date,
  },
  { timestamps: true, versionKey: false },
);

adminSchema.index({ role: 1, status: 1 });

adminSchema.set("toJSON", {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.passwordHash;
    delete ret.failedLoginCount;
    delete ret.lockedUntil;
    delete ret.tokenVersion;
    return ret;
  },
});

export type IAdmin = InferSchemaType<typeof adminSchema>;
export type AdminDoc = HydratedDocument<IAdmin>;
export const Admin = model("Admin", adminSchema, "admins");
