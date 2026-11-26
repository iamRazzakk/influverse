/**
 * Re-runs Stripe events that failed to reach the webhook (e.g. wrong STRIPE_WEBHOOK_SECRET in dev).
 * Fetches each event from Stripe by id and feeds it to the normal webhook processor — idempotent,
 * so an event that was already processed is skipped.
 *
 *   npx ts-node --transpile-only src/scripts/replay-stripe-events.ts evt_123 evt_456
 */
import { connectDB, disconnectDB } from "../config/database";
import { getStripe } from "../config/stripe";
import { logger } from "../shared/logger";
import { processStripeEvent } from "../app/modules/payment/payment.webhook";

(async () => {
  const ids = process.argv.slice(2);
  if (!ids.length) throw new Error("Pass one or more Stripe event ids");
  await connectDB();
  for (const id of ids) {
    const event = await getStripe().events.retrieve(id);
    const fresh = await processStripeEvent(event);
    logger.info(`${id} (${event.type}): ${fresh ? "processed" : "already processed"}`);
  }
  await disconnectDB();
  process.exit(0);
})().catch((error) => {
  logger.error(`Replay failed: ${error.message}`);
  process.exit(1);
});
