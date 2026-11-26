import { InferSchemaType, model, Schema } from "mongoose";
import { PACKAGE_LIMITS, PACKAGE_PLATFORMS, PACKAGE_TYPES, USAGE_RIGHTS } from "./package.constant";

/**
 * docs/03 §3.1 + D25: a creator has at most 3 packages (non-archived).
 * `isActive` = creator's on/off toggle (inactive → hidden publicly, cannot be offered).
 * `isArchived` = deleted (old orders keep referencing it).
 */
const packageSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, maxlength: 2000 },
    platforms: {
      type: [{ type: String, enum: PACKAGE_PLATFORMS }],
      validate: [(v: string[]) => v.length >= 1, "At least one platform"],
    },
    type: { type: String, enum: PACKAGE_TYPES, required: true },
    priceCents: {
      type: Number,
      required: true,
      min: PACKAGE_LIMITS.minPriceCents,
      max: PACKAGE_LIMITS.maxPriceCents,
    },
    deliveryDays: {
      type: Number,
      required: true,
      min: PACKAGE_LIMITS.minDeliveryDays,
      max: PACKAGE_LIMITS.maxDeliveryDays,
    },
    revisions: { type: Number, default: 2, min: 0, max: PACKAGE_LIMITS.maxRevisions },
    inclusions: { type: [String], default: [] },
    usageRights: { type: String, enum: USAGE_RIGHTS, default: "organic_30d" },
    popular: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

packageSchema.index({ creatorId: 1, isArchived: 1, sortOrder: 1 });
// startingPrice recompute: min price of active packages
packageSchema.index({ creatorId: 1, isArchived: 1, isActive: 1, priceCents: 1 });

export type IPackage = InferSchemaType<typeof packageSchema>;
export const Package = model("Package", packageSchema, "packages");
