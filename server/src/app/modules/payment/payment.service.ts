import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import config from "../../../config";
import { getStripe } from "../../../config/stripe";
import ApiError from "../../../errors/ApiErrors";
import { errorLogger, logger } from "../../../shared/logger";
import { Payment, PaymentPurpose } from "./payment.model";

/**
 * Stripe side of payments. This file only talks to Stripe and the `payments` collection;
 * what a payment MEANS for offers / orders lives in payment.webhook.ts and offer / order services.
 */

type CheckoutInput = {
  purpose: PaymentPurpose;
  brandId: string;
  creatorId: string;
  offerId?: string;
  orderId?: string;
  title: string;
  description?: string;
  payoutCents: number;
  feeCents: number;
  /** manual = authorize now, capture later (offer hold). */
  captureMethod: "manual" | "automatic";
  customerEmail?: string;
  /** Website paths (no origin) Stripe sends the brand back to. */
  successPath: string;
  cancelPath: string;
};

const websiteUrl = (path: string) => `${(config.urls.website ?? "").replace(/\/$/, "")}${path}`;

/** Creates a Payment row + a Stripe Checkout Session; returns the hosted payment page URL. */
const createCheckout = async (input: CheckoutInput) => {
  const amountCents = input.payoutCents + input.feeCents;
  const payment = await Payment.create({
    purpose: input.purpose,
    brandId: input.brandId,
    creatorId: input.creatorId,
    offerId: input.offerId,
    orderId: input.orderId,
    amountCents,
    payoutCents: input.payoutCents,
    feeCents: input.feeCents,
    captureMethod: input.captureMethod,
  });

  const metadata = {
    paymentId: String(payment._id),
    purpose: input.purpose,
    ...(input.offerId ? { offerId: input.offerId } : {}),
    ...(input.orderId ? { orderId: input.orderId } : {}),
  };

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: String(payment._id),
        customer_email: input.customerEmail,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              unit_amount: amountCents,
              product_data: { name: input.title.slice(0, 250), ...(input.description ? { description: input.description.slice(0, 500) } : {}) },
            },
          },
        ],
        payment_intent_data: {
          capture_method: input.captureMethod,
          metadata,
          description: `Influverse escrow — ${input.title}`.slice(0, 500),
        },
        // Automatic one-off payments get a real Stripe invoice PDF. Manual card holds
        // are invoiced only after capture, so those use Stripe's charge receipt instead.
        ...(input.captureMethod === "automatic" ? { invoice_creation: { enabled: true } } : {}),
        metadata,
        success_url: websiteUrl(input.successPath),
        cancel_url: websiteUrl(input.cancelPath),
      },
      // Same payment row → same session, even if this request is retried.
      { idempotencyKey: `checkout-${payment._id}` },
    );
  } catch (error: any) {
    await Payment.updateOne({ _id: payment._id }, { $set: { status: "failed", failureMessage: error.message } });
    errorLogger.error(`Stripe checkout create failed (payment ${payment._id}): ${error.message}`);
    throw new ApiError(StatusCodes.BAD_GATEWAY, "Could not start the payment. Please try again.");
  }

  await Payment.updateOne({ _id: payment._id }, { $set: { checkoutSessionId: session.id } });
  return { paymentId: String(payment._id), checkoutUrl: session.url! };
};

/** Stripe invoice PDF when available, otherwise the Stripe-hosted card receipt. */
const stripeDocument = async (brandId: string, paymentId: string) => {
  const payment = await Payment.findOne({ _id: paymentId, brandId })
    .select("stripeInvoiceId paymentIntentId status")
    .lean();
  if (!payment) throw new ApiError(StatusCodes.NOT_FOUND, "Payment not found");
  if (!["captured", "refunded"].includes(payment.status)) {
    throw new ApiError(StatusCodes.CONFLICT, "Stripe document is available after the payment is captured");
  }

  try {
    if (payment.stripeInvoiceId) {
      const invoice = await getStripe().invoices.retrieve(payment.stripeInvoiceId);
      if (invoice.invoice_pdf) return { url: invoice.invoice_pdf, type: "invoice" as const };
    }
    if (payment.paymentIntentId) {
      const intent = await getStripe().paymentIntents.retrieve(payment.paymentIntentId, { expand: ["latest_charge"] });
      const charge = typeof intent.latest_charge === "string" ? null : intent.latest_charge;
      if (charge && typeof charge !== "string" && charge.receipt_url) {
        return { url: charge.receipt_url, type: "receipt" as const };
      }
    }
  } catch (error: any) {
    errorLogger.error(`Stripe document lookup failed for payment ${paymentId}: ${error.message}`);
    throw new ApiError(StatusCodes.BAD_GATEWAY, "Could not retrieve the Stripe document. Please try again.");
  }
  throw new ApiError(StatusCodes.NOT_FOUND, "Stripe invoice or receipt is not available yet");
};

/**
 * Captures an authorized hold (creator accepted the offer).
 * Returns `{ ok: false, expired: true }` when the hold is gone (expired / canceled on Stripe's side).
 */
const captureHold = async (paymentId: string): Promise<{ ok: true } | { ok: false; expired: boolean; message: string }> => {
  const payment = await Payment.findById(paymentId).lean();
  if (!payment?.paymentIntentId || payment.status !== "authorized") {
    return { ok: false, expired: true, message: "The payment hold is not active" };
  }
  try {
    await getStripe().paymentIntents.capture(payment.paymentIntentId, {}, { idempotencyKey: `capture-${paymentId}` });
  } catch (error: any) {
    // Authorization expired / canceled → can't be charged any more.
    const expired = ["payment_intent_unexpected_state", "charge_expired_for_capture"].includes(error?.code);
    if (expired) await Payment.updateOne({ _id: paymentId }, { $set: { status: "expired", canceledAt: new Date() } });
    errorLogger.error(`Stripe capture failed (payment ${paymentId}): ${error.message}`);
    return { ok: false, expired, message: error.message };
  }
  await Payment.updateOne({ _id: paymentId, status: "authorized" }, { $set: { status: "captured", capturedAt: new Date() } });
  return { ok: true };
};

/** Releases a hold (decline / withdraw / expiry). Best-effort: never throws. */
const releaseHold = async (paymentId: string) => {
  try {
    const payment = await Payment.findById(paymentId).lean();
    if (!payment) return;
    if (payment.status === "authorized" && payment.paymentIntentId) {
      await getStripe().paymentIntents.cancel(payment.paymentIntentId, {}, { idempotencyKey: `cancel-${paymentId}` });
      await Payment.updateOne({ _id: paymentId }, { $set: { status: "canceled", canceledAt: new Date() } });
    } else if (payment.status === "open" && payment.checkoutSessionId) {
      // Not paid yet — close the checkout page so it can't be paid later.
      await getStripe().checkout.sessions.expire(payment.checkoutSessionId).catch(() => undefined);
      await Payment.updateOne({ _id: paymentId, status: "open" }, { $set: { status: "canceled", canceledAt: new Date() } });
    }
  } catch (error: any) {
    errorLogger.error(`Stripe release failed (payment ${paymentId}): ${error.message}`);
  }
};

/** Full refund of a captured payment (e.g. paid for a custom offer that was withdrawn meanwhile). */
const refund = async (paymentId: string) => {
  const payment = await Payment.findById(paymentId).lean();
  if (!payment?.paymentIntentId) return;
  await getStripe().refunds.create({ payment_intent: payment.paymentIntentId }, { idempotencyKey: `refund-${paymentId}` });
  await Payment.updateOne({ _id: paymentId }, { $set: { status: "refunded", refundedAt: new Date() } });
  logger.info(`Payment ${paymentId} refunded`);
};

export const PaymentService = { createCheckout, captureHold, releaseHold, refund, stripeDocument };
