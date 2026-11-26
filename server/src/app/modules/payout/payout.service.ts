import { StatusCodes } from "http-status-codes";
import { ClientSession } from "mongoose";
import Stripe from "stripe";
import config from "../../../config";
import { getStripe } from "../../../config/stripe";
import ApiError from "../../../errors/ApiErrors";
import { CODE_PREFIX, nextCode } from "../../../shared/codeGenerator";
import { errorLogger, logger } from "../../../shared/logger";
import { ConversationService } from "../conversation/conversation.service";
import { CreatorProfile } from "../creator/creator.model";
import { NotificationService } from "../notification/notification.service";
import { ESCROW_HELD_STATUSES } from "../order/order.constant";
import { Order } from "../order/order.model";
import { USER_ROLE } from "../user/user.constant";
import { Payout } from "./payout.model";

/**
 * Creator payouts with Stripe Connect Express (user decision 2026-11-18).
 *
 * - The creator connects once: we create an Express account and send them to Stripe's hosted
 *   onboarding (bank details are entered on Stripe, never stored here).
 * - When the brand approves an order, a `payouts` row is created in the same transaction as the
 *   approval; right after commit `sendPayout()` creates the Stripe transfer to the creator's account.
 * - Transfers are sent in EUR from the platform's EUR balance. Do not attach the escrow charge as
 *   `source_transaction`: Stripe may settle the EUR Checkout charge into a USD balance transaction
 *   (for example, for a UK platform), and Stripe requires source and transfer currencies to match.
 * - Creator not connected yet → the payout waits as `pending` ("Available") and is sent as soon as
 *   their account becomes ready (status check after onboarding, `account.updated` webhook, or the sweep).
 */

const MAX_ATTEMPTS = 6;
/** A `processing` row older than this was abandoned by a crashed process → the sweep may retry it. */
const STUCK_PROCESSING_MS = 15 * 60_000;
const backoffMs = (attempts: number) => Math.min(6 * 3600_000, 5 * 60_000 * 2 ** Math.max(0, attempts - 1));

const websiteUrl = (path: string) => `${(config.urls.website ?? "").replace(/\/$/, "")}${path}`;

const isReady = (account: Stripe.Account) =>
  Boolean(account.payouts_enabled) && account.capabilities?.transfers === "active";

/** Saves Stripe's view of the account on the creator profile. Returns true when it just became ready. */
const syncAccount = async (account: Stripe.Account) => {
  const ready = isReady(account);
  const before = await CreatorProfile.findOneAndUpdate(
    { "stripeConnect.accountId": account.id },
    {
      $set: {
        "stripeConnect.payoutsEnabled": ready,
        "stripeConnect.detailsSubmitted": Boolean(account.details_submitted),
        "stripeConnect.syncedAt": new Date(),
      },
    },
  )
    .select("userId stripeConnect")
    .lean();
  if (!before) return { userId: null, becameReady: false };
  const becameReady = ready && !before.stripeConnect?.payoutsEnabled;
  if (becameReady) logger.info(`Stripe Connect account ${account.id} is ready for payouts`);
  return { userId: String(before.userId), becameReady };
};

/* ------------------------------------------------------------------ account (creator) */

/** Stripe errors that mean "Connect payouts can't go to this country from our platform". */
const isUnsupportedCountry = (error: any) =>
  /not supported for platforms|cross-border|not supported in|is not a supported country/i.test(String(error?.message));

/**
 * Creates the Express account. Creators outside the platform's country need the `recipient` service
 * agreement (cross-border payouts) — Stripe tells us with a "service agreement is required" error, so
 * we retry once with it. Some countries (e.g. BD from a US platform) can't receive Connect payouts at
 * all → 422 with a clear message instead of a generic failure.
 * Idempotency keys: a double click creates one account, not two (separate key per variant, because
 * Stripe replays a failed request's error for the same key).
 */
const createExpressAccount = async (creatorId: string, params: Stripe.AccountCreateParams) => {
  const unsupported = () =>
    new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      "Stripe payouts are not available for your country yet. Please contact Influverse Support so we can arrange your payout.",
    );
  try {
    return await getStripe().accounts.create(params, { idempotencyKey: `connect-account-v2-${creatorId}` });
  } catch (error: any) {
    if (isUnsupportedCountry(error) && !/service agreement/i.test(String(error?.message))) throw unsupported();
    if (!/service agreement/i.test(String(error?.message))) throw error;
  }
  try {
    return await getStripe().accounts.create(
      { ...params, tos_acceptance: { service_agreement: "recipient" } },
      { idempotencyKey: `connect-account-v2-${creatorId}-recipient` },
    );
  } catch (error: any) {
    if (isUnsupportedCountry(error)) throw unsupported();
    throw error;
  }
};

/**
 * POST /payouts/connect — creates the Express account on first use and returns a one-time
 * Stripe onboarding URL. Calling it again (unfinished onboarding) just returns a fresh link.
 */
const connectOnboarding = async (creator: { id: string; email?: string }) => {
  const profile = await CreatorProfile.findOne({ userId: creator.id }).select("stripeConnect").lean();
  if (!profile) throw new ApiError(StatusCodes.NOT_FOUND, "Creator profile not found");

  let accountId = profile.stripeConnect?.accountId;
  if (!accountId) {
    const params: Stripe.AccountCreateParams = {
      type: "express",
      email: creator.email,
      capabilities: { transfers: { requested: true } },
      metadata: { userId: creator.id },
      // No `country`: the account is created in the platform's country (live: UK, paid out in EUR).
      // The creator's profile country (e.g. BD) is NOT used — Stripe can't pay out to many of those.
    };
    let account: Stripe.Account;
    try {
      account = await createExpressAccount(creator.id, params);
    } catch (error: any) {
      errorLogger.error(`Stripe Connect account create failed for ${creator.id}: ${error.message}`);
      if (error instanceof ApiError) throw error;
      throw new ApiError(StatusCodes.BAD_GATEWAY, "Could not start payout setup. Please try again.");
    }
    // Only the first writer stores its id (a parallel request got the same account from the idempotency key).
    await CreatorProfile.updateOne(
      { userId: creator.id, "stripeConnect.accountId": { $exists: false } },
      { $set: { stripeConnect: { accountId: account.id, payoutsEnabled: false, detailsSubmitted: false, syncedAt: new Date() } } },
    );
    accountId = (await CreatorProfile.findOne({ userId: creator.id }).select("stripeConnect").lean())!.stripeConnect!.accountId!;
  }

  try {
    const link = await getStripe().accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: config.stripe.connectRefreshUrl || websiteUrl("/creator/payments?connect=refresh"),
      return_url: config.stripe.connectReturnUrl || websiteUrl("/creator/payments?connect=return"),
    });
    return { url: link.url };
  } catch (error: any) {
    errorLogger.error(`Stripe account link failed for ${creator.id}: ${error.message}`);
    throw new ApiError(StatusCodes.BAD_GATEWAY, "Could not open payout setup. Please try again.");
  }
};

/**
 * GET /payouts/account — the creator's payout account state. Refreshes from Stripe (the creator
 * comes back here right after onboarding), and sends waiting payouts once the account is ready.
 */
const accountStatus = async (creatorId: string) => {
  const profile = await CreatorProfile.findOne({ userId: creatorId }).select("stripeConnect").lean();
  const accountId = profile?.stripeConnect?.accountId;
  if (!accountId) return { connected: false, payoutsEnabled: false, detailsSubmitted: false };

  let payoutsEnabled = Boolean(profile.stripeConnect?.payoutsEnabled);
  let detailsSubmitted = Boolean(profile.stripeConnect?.detailsSubmitted);
  try {
    const account = await getStripe().accounts.retrieve(accountId);
    payoutsEnabled = isReady(account);
    detailsSubmitted = Boolean(account.details_submitted);
    const { becameReady } = await syncAccount(account);
    if (becameReady || payoutsEnabled) void processPendingForCreator(creatorId);
  } catch (error: any) {
    // Stripe unreachable → answer from the last synced state.
    errorLogger.error(`Stripe account retrieve failed (${accountId}): ${error.message}`);
  }
  return { connected: true, payoutsEnabled, detailsSubmitted };
};

/** POST /payouts/dashboard — one-time login link to the creator's Stripe Express dashboard (bank, payouts). */
const dashboardLink = async (creatorId: string) => {
  const profile = await CreatorProfile.findOne({ userId: creatorId }).select("stripeConnect").lean();
  if (!profile?.stripeConnect?.accountId || !profile.stripeConnect.detailsSubmitted) {
    throw new ApiError(StatusCodes.CONFLICT, "Finish payout setup first");
  }
  try {
    const link = await getStripe().accounts.createLoginLink(profile.stripeConnect.accountId);
    return { url: link.url };
  } catch (error: any) {
    errorLogger.error(`Stripe login link failed for ${creatorId}: ${error.message}`);
    throw new ApiError(StatusCodes.BAD_GATEWAY, "Could not open the payout dashboard. Please try again.");
  }
};

/** Webhook `account.updated` (Connect). */
const onAccountUpdated = async (account: Stripe.Account) => {
  const { userId, becameReady } = await syncAccount(account);
  if (userId && becameReady) await processPendingForCreator(userId);
};

/* ------------------------------------------------------------------ payouts */

/** Inside the approval transaction: the payout row for this order (idempotent — one per order). */
const createForOrder = async (order: any, session: ClientSession) => {
  const existing = await Payout.findOne({ orderId: order._id }).session(session).lean();
  if (existing) return existing;
  const [payout] = await Payout.create(
    [
      {
        code: await nextCode(CODE_PREFIX.payout, session),
        orderId: order._id,
        orderCode: order.code,
        creatorId: order.creatorId,
        brandId: order.brandId,
        paymentId: order.paymentId,
        title: order.title,
        amountCents: order.priceCents,
      },
    ],
    { session },
  );
  return payout.toObject();
};

/**
 * Sends one payout. Safe to call any number of times from anywhere: the row is claimed with a
 * conditional update, and the Stripe idempotency key turns a repeated transfer into the same transfer.
 */
const sendPayout = async (payoutId: string) => {
  const now = new Date();
  const claimed = await Payout.findOneAndUpdate(
    {
      _id: payoutId,
      $or: [
        { status: { $in: ["pending", "failed"] }, attempts: { $lt: MAX_ATTEMPTS } },
        { status: "processing", updatedAt: { $lt: new Date(now.getTime() - STUCK_PROCESSING_MS) } },
      ],
    },
    { $set: { status: "processing" } },
    { new: true },
  ).lean();
  if (!claimed) return;

  const profile = await CreatorProfile.findOne({ userId: claimed.creatorId }).select("stripeConnect").lean();
  const accountId = profile?.stripeConnect?.accountId;
  if (!accountId || !profile?.stripeConnect?.payoutsEnabled) {
    // Not an error: the money waits as "Available" until the creator finishes payout setup.
    await Payout.updateOne({ _id: payoutId, status: "processing" }, { $set: { status: "pending" } });
    return;
  }

  try {
    const transfer = await getStripe().transfers.create(
      {
        amount: claimed.amountCents,
        currency: claimed.currency,
        destination: accountId,
        transfer_group: claimed.orderCode,
        description: `Influverse payout — ${claimed.title}`.slice(0, 500),
        metadata: { payoutId: String(claimed._id), orderId: String(claimed.orderId) },
      },
      { idempotencyKey: `payout-${claimed._id}-g${claimed.retryGeneration ?? 0}-a${claimed.attempts + 1}` },
    );
    const paid = await Payout.findOneAndUpdate(
      { _id: payoutId, status: "processing" },
      { $set: { status: "paid", stripeTransferId: transfer.id, paidAt: new Date() }, $inc: { attempts: 1 }, $unset: { failureMessage: 1 } },
      { new: true },
    ).lean();
    if (paid) {
      logger.info(`Payout ${paid.code} sent (${transfer.id})`);
      void NotificationService.notifyUser(
        String(paid.creatorId),
        {
          type: "payout_paid",
          title: "Payout sent",
          body: `€${(paid.amountCents / 100).toFixed(2)} for ${paid.title} is on its way to your bank account.`,
          link: "/creator/payments",
          data: { payoutId: String(paid._id), orderId: String(paid.orderId) },
        },
        { email: "payouts" },
      );
    }
  } catch (error: any) {
    const attempts = claimed.attempts + 1;
    let failureMessage = String(error.message).slice(0, 500);
    const stripeRequestId = error?.requestId ?? error?.raw?.requestId ?? "unknown";
    if (error?.code === "balance_insufficient" || /insufficient available funds/i.test(String(error?.message))) {
      try {
        // Only make this diagnostic call after a balance failure; avoid an extra Stripe request
        // on every payout, which matters when processing large payout batches.
        const balance = await getStripe().balance.retrieve();
        const availableEurCents = balance.available.find((entry) => entry.currency === claimed.currency)?.amount ?? 0;
        const mode = balance.livemode ? "live" : "test";
        failureMessage = `${failureMessage} (Stripe ${mode} balance: €${(availableEurCents / 100).toFixed(2)} available; €${(claimed.amountCents / 100).toFixed(2)} required.)`.slice(0, 500);
        errorLogger.error(
          `Payout ${claimed.code} insufficient funds: amount=${claimed.amountCents} ${claimed.currency}, available=${availableEurCents} ${claimed.currency}, mode=${mode}, request=${stripeRequestId}`,
        );
      } catch (balanceError: any) {
        errorLogger.error(`Payout ${claimed.code} balance diagnostic failed: ${balanceError.message}; transfer request=${stripeRequestId}`);
      }
    }
    await Payout.updateOne(
      { _id: payoutId, status: "processing" },
      {
        $set: { status: "failed", failureMessage, nextAttemptAt: new Date(Date.now() + backoffMs(attempts)) },
        $inc: { attempts: 1 },
      },
    );
    errorLogger.error(`Payout ${claimed.code} failed (attempt ${attempts}): ${error.message}`);
    if (attempts >= MAX_ATTEMPTS) {
      void NotificationService.notifyAdmins({
        type: "payout_failed",
        title: `Payout ${claimed.code} failed ${attempts} times`,
        body: String(error.message).slice(0, 500),
        link: "/transactions",
        data: { payoutId: String(claimed._id) },
      });
    }
  }
};

/** Explicit admin retry for a failed payout. A new generation permits a fresh Stripe request. */
const retryFailedPayout = async (payoutId: string) => {
  const payout = await Payout.findOneAndUpdate(
    { _id: payoutId, status: "failed" },
    {
      $set: { status: "pending", attempts: 0, nextAttemptAt: new Date() },
      $inc: { retryGeneration: 1 },
      $unset: { failureMessage: 1 },
    },
    { new: true },
  ).select("_id").lean();
  if (!payout) throw new ApiError(StatusCodes.CONFLICT, "Only failed payouts can be retried");
  await sendPayout(String(payout._id));
  const result = await Payout.findById(payout._id).select("status attempts failureMessage stripeTransferId").lean();
  if (result?.status === "failed") {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, result.failureMessage ?? "Stripe could not complete this payout");
  }
  return result;
};

/** Sends every waiting payout of a creator (called when their account becomes ready). */
const processPendingForCreator = async (creatorId: string) => {
  const waiting = await Payout.find({ creatorId, status: { $in: ["pending", "failed"] }, attempts: { $lt: MAX_ATTEMPTS } })
    .select("_id")
    .lean();
  for (const payout of waiting) await sendPayout(String(payout._id));
};

/**
 * Worker (every 10 min): retries due failed payouts, recovers abandoned `processing` rows, and
 * sends pending payouts of creators whose accounts are ready (e.g. the webhook was missed).
 */
const sweep = async () => {
  const now = new Date();
  const due = await Payout.find({
    $or: [
      { status: { $in: ["pending", "failed"] }, attempts: { $lt: MAX_ATTEMPTS }, nextAttemptAt: { $lte: now } },
      { status: "processing", updatedAt: { $lt: new Date(now.getTime() - STUCK_PROCESSING_MS) } },
    ],
  })
    .select("_id creatorId status")
    .limit(200)
    .lean();
  if (!due.length) return 0;

  // Pending rows only make sense for creators who can receive money — skip the rest cheaply.
  const readyCreators = new Set(
    (
      await CreatorProfile.find({ userId: { $in: due.map((p) => p.creatorId) }, "stripeConnect.payoutsEnabled": true })
        .select("userId")
        .lean()
    ).map((p) => String(p.userId)),
  );
  let sent = 0;
  for (const payout of due) {
    if (!readyCreators.has(String(payout.creatorId))) continue;
    await sendPayout(String(payout._id));
    sent += 1;
  }
  return sent;
};

/* ------------------------------------------------------------------ creator payouts page */

const DATE_ONLY = (d?: Date | null) => (d ? new Date(d) : null);

/**
 * GET /payouts/me — "Payouts" page: totals, the payout account state, and rows for
 * released payouts (Available / Transferred) plus orders whose money is still in escrow.
 */
const listForCreator = async (creatorId: string) => {
  const [payouts, escrowOrders, account] = await Promise.all([
    Payout.find({ creatorId }).sort({ createdAt: -1 }).limit(200).lean(),
    Order.find({ creatorId, status: { $in: ESCROW_HELD_STATUSES } })
      .select("code title priceCents platforms brandId paidAt createdAt status")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
    accountStatus(creatorId),
  ]);

  const brandIds = [...new Set([...payouts.map((p) => String(p.brandId)), ...escrowOrders.map((o) => String(o.brandId))])];
  const brands = await ConversationService.loadCounterparts(USER_ROLE.brand, brandIds);
  const brandName = (id: unknown) => brands.get(String(id))?.name ?? "Brand";

  const releasedRows = payouts.map((p) => ({
    id: p.code,
    orderId: String(p.orderId),
    orderCode: p.orderCode,
    date: DATE_ONLY(p.paidAt ?? p.createdAt),
    brandName: brandName(p.brandId),
    campaignTitle: p.title,
    amountCents: p.amountCents,
    status: p.status === "paid" ? ("paid_out" as const) : ("available" as const),
    payoutMethod: p.status === "paid" ? "Stripe transfer" : account.payoutsEnabled ? "Sending to your bank" : "Set up payouts to receive",
    referenceCode: p.stripeTransferId ? `TRF-${p.code.split("-")[1]}` : `ESC-${p.orderCode.split("-")[1]}`,
  }));
  const escrowRows = escrowOrders.map((o) => ({
    id: `ESC-${o.code.split("-")[1]}`,
    orderId: String(o._id),
    orderCode: o.code,
    date: DATE_ONLY(o.paidAt ?? o.createdAt),
    brandName: brandName(o.brandId),
    campaignTitle: o.title,
    amountCents: o.priceCents,
    status: "in_escrow" as const,
    payoutMethod: "Escrow Pending (Brand Review)",
    referenceCode: `ESC-${o.code.split("-")[1]}`,
  }));

  return {
    summary: {
      totalEarnedCents: payouts.reduce((sum, p) => sum + p.amountCents, 0),
      pendingEscrowCents: escrowOrders.reduce((sum, o) => sum + o.priceCents, 0),
      availableCents: payouts.filter((p) => p.status !== "paid").reduce((sum, p) => sum + p.amountCents, 0),
    },
    account,
    items: [...escrowRows, ...releasedRows].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0)),
  };
};

/** Small view for the order page ("Payment released" / "Available"). */
const statusForOrder = async (orderId: unknown) => {
  const payout = await Payout.findOne({ orderId }).select("code status amountCents paidAt").lean();
  return payout ? { code: payout.code, status: payout.status, amountCents: payout.amountCents, paidAt: payout.paidAt ?? null } : null;
};

export const PayoutService = {
  connectOnboarding,
  accountStatus,
  dashboardLink,
  onAccountUpdated,
  createForOrder,
  sendPayout,
  retryFailedPayout,
  processPendingForCreator,
  sweep,
  listForCreator,
  statusForOrder,
};
