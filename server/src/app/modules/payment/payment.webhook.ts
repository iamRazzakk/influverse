import Stripe from "stripe";
import { logger } from "../../../shared/logger";
import { OfferService } from "../offer/offer.service";
import { OrderService } from "../order/order.service";
import { withTransaction } from "../../../shared/db";
import { Payment, WebhookEvent } from "./payment.model";
import { PaymentService } from "./payment.service";
import { PayoutService } from "../payout/payout.service";

/**
 * Stripe events → payments / offers / orders. Called by integrations/stripeWebhook.ts after the
 * signature check. Every handler is safe to run twice (conditional updates), and the event id is
 * recorded so Stripe's retries of the same event are acknowledged without re-processing.
 *
 * Events this needs (Stripe Dashboard → Webhooks):
 *   checkout.session.completed, checkout.session.expired,
 *   payment_intent.amount_capturable_updated, payment_intent.succeeded,
 *   payment_intent.payment_failed, payment_intent.canceled
 * Connect (creator payout accounts — "Listen to events on Connected accounts"):
 *   account.updated
 */

const paymentIdOf = (metadata?: Stripe.Metadata | null) => metadata?.paymentId;

/** Links the PaymentIntent to our payment row (the first event that knows both). */
const linkIntent = (paymentId: string, paymentIntentId: string) =>
  Payment.updateOne({ _id: paymentId, paymentIntentId: { $exists: false } }, { $set: { paymentIntentId } });

const handlers: Partial<Record<string, (event: Stripe.Event) => Promise<void>>> = {
  "checkout.session.completed": async (event) => {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentId = paymentIdOf(session.metadata);
    if (paymentId) {
      const invoiceId = typeof session.invoice === "string" ? session.invoice : session.invoice?.id;
      await Payment.updateOne(
        { _id: paymentId },
        {
          $set: {
            ...(typeof session.payment_intent === "string" ? { paymentIntentId: session.payment_intent } : {}),
            ...(invoiceId ? { stripeInvoiceId: invoiceId } : {}),
          },
        },
      );
    }
  },

  /** Checkout page timed out unpaid. */
  "checkout.session.expired": async (event) => {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentId = paymentIdOf(session.metadata);
    if (paymentId) await Payment.updateOne({ _id: paymentId, status: "open" }, { $set: { status: "expired", canceledAt: new Date() } });
  },

  /** Manual capture: the card is authorized (money held) → the brand offer goes to the creator. */
  "payment_intent.amount_capturable_updated": async (event) => {
    const intent = event.data.object as Stripe.PaymentIntent;
    const paymentId = paymentIdOf(intent.metadata);
    if (!paymentId) return;
    await linkIntent(paymentId, intent.id);
    const updated = await Payment.findOneAndUpdate(
      { _id: paymentId, status: "open" },
      { $set: { status: "authorized", authorizedAt: new Date(), paymentIntentId: intent.id } },
      { new: true },
    ).lean();
    if (updated?.purpose === "offer_hold") await OfferService.onHoldAuthorized(paymentId);
  },

  /** Money captured: custom offer accepted / order paid. (Offer holds are captured by the accept request itself.) */
  "payment_intent.succeeded": async (event) => {
    const intent = event.data.object as Stripe.PaymentIntent;
    const paymentId = paymentIdOf(intent.metadata);
    if (!paymentId) return;
    await linkIntent(paymentId, intent.id);
    const updated = await Payment.findOneAndUpdate(
      { _id: paymentId, status: { $in: ["open", "authorized"] } },
      { $set: { status: "captured", capturedAt: new Date(), paymentIntentId: intent.id } },
      { new: true },
    ).lean();
    if (!updated) {
      // Already captured (e.g. by the accept request) → nothing left to do. But money that arrived for a
      // payment we had already canceled (brand paid at the same moment the offer was withdrawn) goes back.
      const current = await Payment.findById(paymentId).lean();
      if (current && (current.status === "canceled" || current.status === "expired")) {
        await Payment.updateOne({ _id: paymentId }, { $set: { paymentIntentId: intent.id } });
        await PaymentService.refund(paymentId);
      }
      return;
    }

    if (updated.purpose === "custom_offer_accept") {
      await OfferService.onCustomOfferPaid(paymentId);
    } else if (updated.purpose === "order" && updated.orderId) {
      const order = await withTransaction(async (session) => {
        const paid = await OrderService.markPaid(String(updated.orderId), paymentId, session);
        if (paid) await Payment.updateOne({ _id: paymentId }, { $set: { orderId: paid._id } }, { session });
        return paid;
      });
      if (order) void OrderService.notifyFunded(order);
      else logger.warn(`Order ${updated.orderId} was not awaiting payment when payment ${paymentId} succeeded`);
    }
  },

  "payment_intent.payment_failed": async (event) => {
    const intent = event.data.object as Stripe.PaymentIntent;
    const paymentId = paymentIdOf(intent.metadata);
    if (!paymentId) return;
    // The checkout page lets the brand retry with another card, so the payment stays open.
    await Payment.updateOne({ _id: paymentId }, { $set: { failureMessage: intent.last_payment_error?.message ?? "Payment failed" } });
  },

  /** Creator finished / changed Stripe onboarding → sync `payoutsEnabled`, send waiting payouts. */
  "account.updated": async (event) => {
    await PayoutService.onAccountUpdated(event.data.object as Stripe.Account);
  },

  "payment_intent.canceled": async (event) => {
    const intent = event.data.object as Stripe.PaymentIntent;
    const paymentId = paymentIdOf(intent.metadata);
    if (paymentId) {
      await Payment.updateOne({ _id: paymentId, status: { $in: ["open", "authorized"] } }, { $set: { status: "canceled", canceledAt: new Date() } });
    }
  },
};

/** Returns false when the event was already processed (duplicate delivery). */
export const processStripeEvent = async (event: Stripe.Event): Promise<boolean> => {
  const handler = handlers[event.type];
  if (!handler) {
    logger.debug(`Stripe webhook ignored: ${event.type} ${event.id}`);
    return true;
  }

  try {
    await WebhookEvent.create({ eventId: event.id, type: event.type });
  } catch (error: any) {
    if (error?.code === 11000) return false; // seen before
    throw error;
  }

  try {
    await handler(event);
    logger.info(`Stripe webhook processed: ${event.type} ${event.id}`);
    return true;
  } catch (error) {
    // Forget the event so Stripe's retry runs the handler again.
    await WebhookEvent.deleteOne({ eventId: event.id });
    throw error;
  }
};

/** Exported for tests / admin tooling. */
export const STRIPE_EVENTS = Object.keys(handlers);
