import { NextFunction, Request, Response } from "express";
import Stripe from "stripe";
import { StatusCodes } from "http-status-codes";
import config from "../config";
import { getStripe } from "../config/stripe";
import { processStripeEvent } from "../app/modules/payment/payment.webhook";

/**
 * POST /api/v1/webhooks/stripe  (raw body)
 *
 * Audit #4 fix: previously a `throw` in the async handler → unhandledRejection → process exit.
 * Now: signature failure = 400, handler error = next(err) → 500 (Stripe retries on its own). The process never crashes.
 *
 * Events are recorded in `webhook_events` (eventId unique), so a re-delivered event is acknowledged
 * without running twice. Handlers: app/modules/payment/payment.webhook.ts.
 */
const handleStripeWebhook = async (req: Request, res: Response, next: NextFunction) => {
  const signature = req.header("stripe-signature");
  if (!signature || !config.stripe.webhookSecret) {
    res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "Missing Stripe signature" });
    return;
  }

  // Account events (Connect) may come from a second endpoint with its own secret — try both.
  const secrets = [config.stripe.webhookSecret, config.stripe.connectWebhookSecret].filter(Boolean) as string[];
  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = getStripe().webhooks.constructEvent(req.body, signature, secret);
      break;
    } catch {
      /* try the next secret */
    }
  }
  if (!event) {
    res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "Invalid Stripe signature" });
    return;
  }

  try {
    const fresh = await processStripeEvent(event);
    res.status(StatusCodes.OK).json({ received: true, duplicate: !fresh });
  } catch (error) {
    next(error);
  }
};

export default handleStripeWebhook;
