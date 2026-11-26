import { InferSchemaType, model, Schema } from "mongoose";

export const FILE_CONTEXTS = [
  "avatar",
  "brand_logo",
  "cover",
  "gallery",
  "portfolio",
  "verification_sample",
  "deliverable",
  "chat_attachment",
  "order_attachment",
  "ticket_attachment",
  "cms_asset",
  "invoice_pdf",
  "export",
] as const;
export type FileContext = (typeof FILE_CONTEXTS)[number];

export const FILE_STATUS = ["pending", "ready", "failed", "deleted"] as const;

/** docs/03 §12.1 */
const fileSchema = new Schema(
  {
    ownerType: { type: String, enum: ["user", "admin", "system"], required: true },
    ownerId: { type: Schema.Types.ObjectId },
    context: { type: String, enum: FILE_CONTEXTS, required: true },
    key: { type: String, required: true, unique: true },
    bucket: { type: String, required: true },
    originalName: { type: String, required: true, maxlength: 255 },
    mime: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 1 },
    visibility: { type: String, enum: ["public", "private"], required: true },
    status: { type: String, enum: FILE_STATUS, default: "pending" },
    media: { width: Number, height: Number, durationSec: Number, thumbnailKey: String },
    /** Which entity it's attached to (order / conversation / ticket) — used for private access checks */
    attachedTo: { type: { kind: String, id: Schema.Types.ObjectId }, _id: false, default: undefined },
  },
  { timestamps: true, versionKey: false },
);

fileSchema.index({ ownerId: 1, context: 1 });
fileSchema.index({ status: 1, createdAt: 1 }); // orphan cleanup
fileSchema.index({ "attachedTo.kind": 1, "attachedTo.id": 1 });

export type IFile = InferSchemaType<typeof fileSchema>;
export const File = model("File", fileSchema, "files");
