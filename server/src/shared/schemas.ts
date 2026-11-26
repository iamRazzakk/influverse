import { Schema } from "mongoose";

/** docs/03 §0 — reference to an uploaded file (files collection) */
export const fileRefSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, ref: "File" },
    url: { type: String, required: true },
    name: String,
    mime: String,
    size: Number,
  },
  { _id: false },
);

/** Display snapshot for orders / tickets (history stays correct even if the user later changes their name) */
export const userSnapshotSchema = new Schema(
  { name: String, avatar: String, handle: String, companyName: String },
  { _id: false },
);

export const moneySchema = new Schema(
  {
    baseCents: { type: Number, required: true, min: 0 },
    feeCents: { type: Number, required: true, min: 0 },
    totalCents: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "EUR", enum: ["EUR"] },
  },
  { _id: false },
);
