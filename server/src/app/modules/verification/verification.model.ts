import { InferSchemaType, model, Schema } from "mongoose";
import { fileRefSchema } from "../../../shared/schemas";

/** docs/03 §3.4 — creator applies for the verified badge; admin approves / rejects. */
export const VERIFICATION_STATUS = { pending: "pending", approved: "approved", rejected: "rejected" } as const;

const verificationRequestSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    /** Snapshot for the admin list so it doesn't need a join. */
    creatorSnapshot: { name: String, handle: String, avatar: String, country: String, categories: [String] },
    platforms: {
      instagram: String,
      tiktok: String,
      youtube: String,
    },
    primaryPlatform: { type: String, enum: ["instagram", "tiktok", "youtube"] },
    followersTotal: Number,
    avgViews: Number,
    sampleWork: { title: String, url: String, views: Number, file: { type: fileRefSchema, default: undefined } },
    note: { type: String, maxlength: 1000 },
    status: { type: String, enum: Object.values(VERIFICATION_STATUS), default: VERIFICATION_STATUS.pending, required: true },
    rejectionReason: { type: String, maxlength: 1000 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    reviewedAt: Date,
  },
  { timestamps: true, versionKey: false },
);

/**
 * At most ONE pending request per creator, enforced by the database itself:
 * a partial unique index only covers documents with status "pending".
 */
verificationRequestSchema.index(
  { creatorId: 1 },
  { unique: true, partialFilterExpression: { status: VERIFICATION_STATUS.pending }, name: "one_pending_per_creator" },
);
verificationRequestSchema.index({ status: 1, createdAt: -1 });
verificationRequestSchema.index({ creatorId: 1, createdAt: -1 });

export type IVerificationRequest = InferSchemaType<typeof verificationRequestSchema>;
export const VerificationRequest = model("VerificationRequest", verificationRequestSchema, "verification_requests");
