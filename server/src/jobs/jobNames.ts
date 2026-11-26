/**
 * BullMQ job names in one place, so producers (services) and the worker registry
 * never drift apart and the worker doesn't have to import whole service modules.
 */
export const JOB = {
  sendEmail: "send",
  revalidateWebsite: "website",
  finalizeDeactivation: "finalize-deactivation",
  liftSuspension: "lift-suspension",
  deleteFile: "delete-file",
  outboxDispatch: "dispatch",
  /** Expires unanswered / unpaid offers and releases their payment holds. */
  offerExpire: "offer-expire",
  /** Auto-approves submitted orders past their review window and auto-completes old approved orders. */
  orderSweep: "order-sweep",
  /** Retries failed creator payouts and sends pending ones whose payout account is ready. */
  payoutSweep: "payout-sweep",
} as const;
