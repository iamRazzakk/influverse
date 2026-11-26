import { logger } from "../shared/logger";
import { OfferService } from "../app/modules/offer/offer.service";
import { OrderLifecycleService } from "../app/modules/order/order.lifecycle.service";
import { PayoutService } from "../app/modules/payout/payout.service";

/**
 * Every 10 min (startWorkers scheduler): offers past their deadline become `expired`, their card
 * holds are released and the chat gets an "Offer expired" notice. Safe to run on many workers at
 * once — each offer is claimed with a conditional update.
 */
export const offerExpireProcessor = async () => {
  const count = await OfferService.expireStale();
  if (count) logger.info(`Offer expiry: ${count} offer(s) closed`);
  return { count };
};

/**
 * Every 10 min: brand didn't review a submission within 7 days → auto-approve (creator gets paid);
 * approved orders without a review for 14 days → completed. Conditional updates keep it race-safe.
 */
export const orderSweepProcessor = async () => {
  const approved = await OrderLifecycleService.autoApproveDue();
  const completed = await OrderLifecycleService.autoCompleteDue();
  if (approved || completed) logger.info(`Order sweep: ${approved} auto-approved, ${completed} auto-completed`);
  return { approved, completed };
};

/** Every 10 min: retry failed payouts, recover stuck ones, send pending ones whose account is ready. */
export const payoutSweepProcessor = async () => {
  const sent = await PayoutService.sweep();
  if (sent) logger.info(`Payout sweep: ${sent} payout(s) attempted`);
  return { sent };
};
