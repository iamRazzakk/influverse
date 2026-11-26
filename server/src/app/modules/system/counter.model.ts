import { model, Schema } from "mongoose";

/** `_id` = counter name (`ORD`, `USR`, `INV-2026` …), `seq` = last issued number */
const counterSchema = new Schema<{ _id: string; seq: number }>(
  { _id: { type: String, required: true }, seq: { type: Number, required: true, default: 0 } },
  { versionKey: false, timestamps: false },
);

export const Counter = model("Counter", counterSchema, "counters");
