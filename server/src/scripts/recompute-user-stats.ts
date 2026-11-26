/**
 * Rebuilds `user.stats.totalVolumeCents` + `user.stats.ordersCount` (admin Users list: Volume / Deals)
 * from the orders. Safe to re-run any time: it overwrites the counters with the real totals.
 *
 * Needed once because the counters were never updated before 2026-11-18; after that they are kept
 * live by UserStatsService. Rules (same as the live updates):
 *   - a deal = an order whose escrow was paid (`paidAt` set) and that wasn't refunded/cancelled
 *   - brand volume = order.totalCents, creator volume = order.priceCents
 *
 *   npx ts-node --transpile-only src/scripts/recompute-user-stats.ts
 */
import { connectDB, disconnectDB } from "../config/database";
import { logger } from "../shared/logger";
import { Order } from "../app/modules/order/order.model";
import { User } from "../app/modules/user/user.model";

type Totals = { _id: unknown; volume: number; deals: number };

export const recomputeUserStats = async () => {
  const paid = { paidAt: { $ne: null }, status: { $ne: "cancelled" } };
  const [brands, creators] = await Promise.all([
    Order.aggregate<Totals>([{ $match: paid }, { $group: { _id: "$brandId", volume: { $sum: "$totalCents" }, deals: { $sum: 1 } } }]),
    Order.aggregate<Totals>([{ $match: paid }, { $group: { _id: "$creatorId", volume: { $sum: "$priceCents" }, deals: { $sum: 1 } } }]),
  ]);

  // Everyone back to zero first, so users whose orders were all refunded end up correct too.
  await User.updateMany({}, { $set: { "stats.totalVolumeCents": 0, "stats.ordersCount": 0 } });

  const rows = [...brands, ...creators];
  if (rows.length) {
    await User.bulkWrite(
      rows.map((r) => ({
        updateOne: {
          filter: { _id: r._id },
          update: { $set: { "stats.totalVolumeCents": r.volume, "stats.ordersCount": r.deals } },
        },
      })),
      { ordered: false },
    );
  }
  return rows.length;
};

if (require.main === module) {
  (async () => {
    await connectDB();
    const count = await recomputeUserStats();
    logger.info(`User stats recomputed for ${count} user(s)`);
    await disconnectDB();
    process.exit(0);
  })().catch((error) => {
    logger.error(`Recompute failed: ${error.message}`);
    process.exit(1);
  });
}
