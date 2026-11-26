import { Types } from "mongoose";
import { ConversationService } from "../conversation/conversation.service";
import { Order } from "../order/order.model";
import { Payout } from "../payout/payout.model";
import { USER_ROLE } from "../user/user.constant";
import { Payment } from "./payment.model";

/**
 * Read side of payments: the brand's "Payments" page and the admin "Transactions" page.
 * (No wallet — user decision 2026-11-18: brands pay per offer through Stripe Checkout.)
 */

/** Payments that actually moved (or hold) money. Open / expired / canceled checkouts are noise here. */
const MONEY_STATUSES = ["authorized", "captured", "refunded"] as const;

const shortRef = (id: unknown) => String(id).slice(-6).toUpperCase();

/** Row status for the ledger: still locked, released to the creator, or refunded. */
const rowStatus = (payment: any, orderStatus?: string) => {
  if (payment.status === "refunded") return "refunded" as const;
  if (payment.status === "captured" && (orderStatus === "approved" || orderStatus === "completed")) return "released" as const;
  return "in_escrow" as const;
};

/** Orders linked to these payments (by orderId, or by offerId for offer holds / custom offers). */
const loadOrdersFor = async (payments: any[]) => {
  const orderIds = payments.map((p) => p.orderId).filter(Boolean);
  const offerIds = payments.map((p) => p.offerId).filter(Boolean);
  const orders = await Order.find({ $or: [{ _id: { $in: orderIds } }, { offerId: { $in: offerIds } }] })
    .select("code title status offerId")
    .lean();
  const byId = new Map(orders.map((o) => [String(o._id), o]));
  const byOffer = new Map(orders.map((o) => [String(o.offerId), o]));
  return (payment: any) => (payment.orderId ? byId.get(String(payment.orderId)) : undefined) ?? (payment.offerId ? byOffer.get(String(payment.offerId)) : undefined);
};

const toLedgerRow = (payment: any, order: any, creatorName: string) => {
  const status = rowStatus(payment, order?.status);
  return {
    id: `TXN-${shortRef(payment._id)}`,
    paymentId: String(payment._id),
    orderId: order ? String(order._id) : null,
    orderCode: order?.code ?? null,
    date: payment.capturedAt ?? payment.authorizedAt ?? payment.createdAt,
    creatorName,
    campaignTitle: order?.title ?? "Campaign offer",
    amountCents: payment.amountCents,
    payoutCents: payment.payoutCents,
    feeCents: payment.feeCents,
    status,
    stripeDocumentReady: payment.status === "captured" || payment.status === "refunded",
    method: payment.status === "authorized" ? "Card hold (Stripe)" : "Card (Stripe)",
    invoiceNumber: order?.code ? `INV-${order.code.split("-")[1]}` : `INV-${shortRef(payment._id)}`,
    refundedAt: payment.refundedAt ?? null,
  };
};

/**
 * GET /payments/me — brand ledger (latest 200) + totals.
 * Totals are summed in Node from a lean projection of this brand's payments (one indexed query).
 */
const listForBrand = async (brandId: string) => {
  const payments = await Payment.find({ brandId, status: { $in: MONEY_STATUSES } }).sort({ createdAt: -1 }).limit(200).lean();
  const orderOf = await loadOrdersFor(payments);
  const creators = await ConversationService.loadCounterparts(USER_ROLE.creator, [...new Set(payments.map((p) => String(p.creatorId)))]);
  const items = payments.map((p) => toLedgerRow(p, orderOf(p), creators.get(String(p.creatorId))?.name ?? "Creator"));

  return {
    summary: {
      totalSpentCents: items.filter((r) => r.status !== "refunded").reduce((sum, r) => sum + r.amountCents, 0),
      inEscrowCents: items.filter((r) => r.status === "in_escrow").reduce((sum, r) => sum + r.amountCents, 0),
      refundedCents: items.filter((r) => r.status === "refunded").reduce((sum, r) => sum + r.amountCents, 0),
    },
    items,
  };
};

/**
 * GET /admin/transactions?tab=payments|payouts — every brand payment, or every creator payout.
 * Platform totals use one `$group` aggregation: summing across ALL payments is exactly the case where
 * an aggregation beats pulling every row into Node.
 */
const adminList = async (query: { tab: "payments" | "payouts"; q?: string; page: number; limit: number }) => {
  const skip = (query.page - 1) * query.limit;
  const [totals] = await Payment.aggregate<{ captured: number; fees: number; refunded: number; held: number }>([
    { $match: { status: { $in: MONEY_STATUSES } } },
    {
      $group: {
        _id: null,
        captured: { $sum: { $cond: [{ $eq: ["$status", "captured"] }, "$amountCents", 0] } },
        fees: { $sum: { $cond: [{ $eq: ["$status", "captured"] }, "$feeCents", 0] } },
        refunded: { $sum: { $cond: [{ $eq: ["$status", "refunded"] }, "$amountCents", 0] } },
        held: { $sum: { $cond: [{ $eq: ["$status", "authorized"] }, "$amountCents", 0] } },
      },
    },
  ]);
  const [payoutTotals] = await Payout.aggregate<{ paid: number; pending: number }>([
    {
      $group: {
        _id: null,
        paid: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$amountCents", 0] } },
        pending: { $sum: { $cond: [{ $ne: ["$status", "paid"] }, "$amountCents", 0] } },
      },
    },
  ]);
  const stats = {
    collectedCents: totals?.captured ?? 0,
    platformFeesCents: totals?.fees ?? 0,
    refundedCents: totals?.refunded ?? 0,
    heldCents: totals?.held ?? 0,
    paidOutCents: payoutTotals?.paid ?? 0,
    payoutsPendingCents: payoutTotals?.pending ?? 0,
  };

  if (query.tab === "payouts") {
    const filter: Record<string, unknown> = {};
    if (query.q) filter.$or = [{ code: query.q.toUpperCase() }, { orderCode: query.q.toUpperCase() }];
    const [rows, total] = await Promise.all([
      Payout.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
      Payout.countDocuments(filter),
    ]);
    const creators = await ConversationService.loadCounterparts(USER_ROLE.creator, [...new Set(rows.map((p) => String(p.creatorId)))]);
    return {
      items: rows.map((p) => ({
        id: String(p._id),
        code: p.code,
        orderId: String(p.orderId),
        orderCode: p.orderCode,
        title: p.title,
        creator: creators.get(String(p.creatorId)) ?? null,
        amountCents: p.amountCents,
        status: p.status,
        attempts: p.attempts,
        stripeTransferId: p.stripeTransferId ?? null,
        failureMessage: p.failureMessage ?? null,
        paidAt: p.paidAt ?? null,
        createdAt: p.createdAt,
      })),
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
      stats,
    };
  }

  const filter: Record<string, unknown> = { status: { $in: MONEY_STATUSES } };
  if (query.q && Types.ObjectId.isValid(query.q)) filter._id = query.q;
  const [rows, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    Payment.countDocuments(filter),
  ]);
  const orderOf = await loadOrdersFor(rows);
  const [brands, creators] = await Promise.all([
    ConversationService.loadCounterparts(USER_ROLE.brand, [...new Set(rows.map((p) => String(p.brandId)))]),
    ConversationService.loadCounterparts(USER_ROLE.creator, [...new Set(rows.map((p) => String(p.creatorId)))]),
  ]);
  return {
    items: rows.map((p) => ({
      ...toLedgerRow(p, orderOf(p), creators.get(String(p.creatorId))?.name ?? "Creator"),
      brand: brands.get(String(p.brandId)) ?? null,
      creator: creators.get(String(p.creatorId)) ?? null,
      purpose: p.purpose,
      paymentStatus: p.status,
      paymentIntentId: p.paymentIntentId ?? null,
    })),
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    stats,
  };
};

export const PaymentHistoryService = { listForBrand, adminList };
