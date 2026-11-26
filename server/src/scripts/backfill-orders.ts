/**
 * One-off, safe to re-run: creates the missing order for every accepted offer that has none.
 * Needed for offers accepted before the order module existed (2026-11-17).
 *
 *   npx ts-node --transpile-only src/scripts/backfill-orders.ts
 */
import { connectDB, disconnectDB } from "../config/database";
import { logger } from "../shared/logger";
import { Offer } from "../app/modules/offer/offer.model";
import { OrderService } from "../app/modules/order/order.service";

export const backfillOrders = async () => {
  const offers = await Offer.find({ status: "accepted", orderId: { $exists: false } }).lean();
  for (const offer of offers) {
    const order = await OrderService.createFromOffer(offer);
    await Offer.updateOne({ _id: offer._id }, { $set: { orderId: order._id } });
    logger.info(`Order ${order.code} created for offer ${offer.code}`);
  }
  return offers.length;
};

if (require.main === module) {
  (async () => {
    await connectDB();
    const count = await backfillOrders();
    logger.info(`Backfill done: ${count} order(s) created`);
    await disconnectDB();
    process.exit(0);
  })().catch((error) => {
    logger.error(`Backfill failed: ${error.message}`);
    process.exit(1);
  });
}
