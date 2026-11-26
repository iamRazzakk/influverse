import { InferSchemaType, model, Schema } from "mongoose";

/**
 * docs/03-data-models.md §13.5 — single document (`key: 'platform'`).
 * D23: not editable from the admin UI — seeded defaults; change via DB / seed script.
 */
const platformSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "platform" },
    platformFeePercent: { type: Number, default: 15, min: 0, max: 50 },
    creatorFeePercent: { type: Number, default: 0, min: 0, max: 50 },
    autoReleaseDays: { type: Number, default: 5, min: 1 },
    autoCompleteDays: { type: Number, default: 3, min: 1 },
    offerExpiryDays: { type: Number, default: 7, min: 1 },
    revisionExtendDays: { type: Number, default: 2, min: 0 },
    minTopUpCents: { type: Number, default: 10_000, min: 0 },
    maxPackagesPerCreator: { type: Number, default: 3, min: 1 },
    deactivationGraceDays: { type: Number, default: 15, min: 1 },
  },
  { timestamps: true, versionKey: false },
);

export type IPlatformSettings = InferSchemaType<typeof platformSettingsSchema>;
export const PlatformSettings = model("PlatformSettings", platformSettingsSchema, "platform_settings");
