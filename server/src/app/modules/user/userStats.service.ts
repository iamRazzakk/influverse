import type { ClientSession, Types } from "mongoose";
import { User } from "./user.model";

/**
 * Lifetime money + deal counters on each user (`user.stats`), shown and sorted in the admin Users list.
 *
 *   brand   → totalVolumeCents = what the brand paid into escrow (order.totalCents: payout + platform fee)
 *   creator → totalVolumeCents = what the creator earns from it  (order.priceCents)
 *   both    → ordersCount     = paid orders ("deals")
 *
 * Kept up to date with atomic `$inc` at the two money moments (no aggregation on every list request):
 *   - escrow funded  → +volume, +1 deal   (OrderService.createFromOffer / markPaid)
 *   - order refunded → −volume, −1 deal   (order lifecycle refundHeld)
 * Callers must only call these on the FIRST transition (they guard with conditional updates), so a
 * retried webhook can't count an order twice. `src/scripts/recompute-user-stats.ts` rebuilds everything.
 */

type PaidOrder = {
  brandId: Types.ObjectId | string;
  creatorId: Types.ObjectId | string;
  totalCents: number;
  priceCents: number;
};

const apply = async (order: PaidOrder, sign: 1 | -1, session?: ClientSession) => {
  await User.bulkWrite(
    [
      {
        updateOne: {
          filter: { _id: order.brandId },
          update: { $inc: { "stats.totalVolumeCents": sign * order.totalCents, "stats.ordersCount": sign } },
        },
      },
      {
        updateOne: {
          filter: { _id: order.creatorId },
          update: { $inc: { "stats.totalVolumeCents": sign * order.priceCents, "stats.ordersCount": sign } },
        },
      },
    ],
    { session, ordered: false },
  );
};

/** Escrow funded for this order (call once per order). */
const recordPaidOrder = (order: PaidOrder, session?: ClientSession) => apply(order, 1, session);

/** A paid order was fully refunded and cancelled (call once per order). */
const reverseRefundedOrder = (order: PaidOrder, session?: ClientSession) => apply(order, -1, session);

export const UserStatsService = { recordPaidOrder, reverseRefundedOrder };
