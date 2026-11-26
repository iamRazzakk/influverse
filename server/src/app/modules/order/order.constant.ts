/**
 * Order (campaign) lifecycle. An order is created the moment an offer is accepted.
 *
 * awaiting_payment → (brand pays escrow, Phase C) → in_production → deliverable_submitted
 *   → approved → completed.   Side exits: cancelled, disputed.
 *
 * Until payments go live every order stays in `awaiting_payment`.
 */
export const ORDER_STATUSES = [
  "awaiting_payment",
  "in_production",
  "deliverable_submitted",
  "approved",
  "completed",
  "cancelled",
  "disputed",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Escrow is still held for these (money not yet released to the creator). */
export const ESCROW_HELD_STATUSES: OrderStatus[] = ["in_production", "deliverable_submitted", "disputed"];

/** A support ticket can put these on hold (escrow not released yet). */
export const REPORTABLE_STATUSES: OrderStatus[] = ["in_production", "deliverable_submitted"];

export const ORDER_TIMING = {
  /** Brand has this long to review a submission before it auto-approves (user decision 2026-11-18). */
  reviewWindowDays: 7,
  /** An approved order without a review is completed automatically after this. */
  autoCompleteDays: 14,
} as const;

export const ORDER_LIMITS = {
  maxFilesPerSubmission: 20,
  maxLinksPerSubmission: 10,
  maxSubmissions: 30,
} as const;

/** `attachedTo.kind` for deliverable files — the upload module asks the order module who may download them. */
export const ORDER_FILE_KIND = "order";
