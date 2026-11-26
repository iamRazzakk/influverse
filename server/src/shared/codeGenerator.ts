import { ClientSession } from "mongoose";
import { Counter } from "../app/modules/system/counter.model";

/**
 * Human readable code: `ORD-10001`, `USR-10042`, `INV-2026-00017`.
 * Atomic `$inc` — no duplicates even under concurrent requests (including multiple api instances).
 * Per-prefix start offset — so the total count can't be inferred from a code.
 */
export const CODE_PREFIX = {
  user: "USR",
  admin: "ADM",
  package: "PKG",
  verification: "VER",
  offer: "OFR",
  order: "ORD",
  escrow: "ESC",
  ledger: "TXN",
  payout: "PAY",
  dispute: "DSP",
  ticket: "TKT",
  faq: "FAQ",
  partnerBrand: "BRD",
} as const;

export type CodePrefix = (typeof CODE_PREFIX)[keyof typeof CODE_PREFIX];

const START_AT = 10_000;

export const nextSeq = async (counter: string, session?: ClientSession): Promise<number> => {
  const doc = await Counter.findOneAndUpdate(
    { _id: counter },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, session },
  ).lean();
  return doc!.seq;
};

export const nextCode = async (prefix: CodePrefix, session?: ClientSession): Promise<string> => {
  const seq = await nextSeq(prefix, session);
  return `${prefix}-${START_AT + seq}`;
};

/** Invoice: gapless per-year sequence (EU invoice rule) — `INV-2026-00017` */
export const nextInvoiceNumber = async (kind: "INV" | "FEE", session?: ClientSession) => {
  const year = new Date().getUTCFullYear();
  const seq = await nextSeq(`${kind}-${year}`, session);
  return `${kind}-${year}-${String(seq).padStart(5, "0")}`;
};
