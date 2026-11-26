import { InferSchemaType, model, Schema } from "mongoose";

/** docs/03 §2.3 — a brand's bookmarked creators. */
const savedCreatorSchema = new Schema(
  {
    brandId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

// Unique pair → saving twice is impossible even under concurrent requests.
savedCreatorSchema.index({ brandId: 1, creatorId: 1 }, { unique: true });
// "My saved creators" list, newest first.
savedCreatorSchema.index({ brandId: 1, createdAt: -1 });

export type ISavedCreator = InferSchemaType<typeof savedCreatorSchema>;
export const SavedCreator = model("SavedCreator", savedCreatorSchema, "saved_creators");
