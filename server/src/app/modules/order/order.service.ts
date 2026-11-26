import { StatusCodes } from "http-status-codes";
import { UserStatsService } from "../user/userStats.service";
import { ClientSession } from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import { CODE_PREFIX, nextCode } from "../../../shared/codeGenerator";
import { ConversationService, type ChatViewer } from "../conversation/conversation.service";
import { NotificationService } from "../notification/notification.service";
import { PaymentService } from "../payment/payment.service";
import { PayoutService } from "../payout/payout.service";
import { SupportService } from "../support/support.service";
import { USER_ROLE } from "../user/user.constant";
import { ORDER_STATUSES, OrderStatus } from "./order.constant";
import { Order } from "./order.model";

/** Orders (campaigns). Created from accepted offers; `in_production` once the escrow is paid. */

const partyField = (role: string) => (role === USER_ROLE.brand ? "brandId" : "creatorId");
const DAY_MS = 24 * 3600 * 1000;

export const toOrderView = (order: any) => ({
  id: String(order._id),
  code: order.code,
  offerId: String(order.offerId),
  offerDirection: order.offerDirection,
  conversationId: String(order.conversationId),
  brandId: String(order.brandId),
  creatorId: String(order.creatorId),
  packageId: order.packageId ? String(order.packageId) : null,
  title: order.title,
  brief: order.brief ?? "",
  requirements: order.requirements ?? [],
  platforms: order.platforms ?? [],
  deliveryDays: order.deliveryDays,
  priceCents: order.priceCents,
  platformFeePercent: order.platformFeePercent,
  feeCents: order.feeCents,
  totalCents: order.totalCents,
  status: order.status as OrderStatus,
  paidAt: order.paidAt ?? null,
  dueAt: order.dueAt ?? null,
  deliverables: (order.deliverables ?? []).map((d: any) => ({
    id: String(d._id),
    title: d.title,
    notes: d.notes ?? null,
    files: (d.files ?? []).map((f: any) => ({ id: String(f.fileId), url: f.url, name: f.name, mime: f.mime, size: f.size })),
    links: (d.links ?? []).map((l: any) => ({ title: l.title, url: l.url })),
    submittedAt: d.submittedAt,
  })),
  revisionCount: order.revisionCount ?? 0,
  deliveredAt: order.deliveredAt ?? null,
  reviewDueAt: order.reviewDueAt ?? null,
  approvedAt: order.approvedAt ?? null,
  autoApproved: Boolean(order.autoApproved),
  completedAt: order.completedAt ?? null,
  cancelledAt: order.cancelledAt ?? null,
  /** Escrow released to the creator (approved or completed). */
  escrowReleased: order.status === "approved" || order.status === "completed",
  review: order.review ? { rating: order.review.rating, comment: order.review.comment, createdAt: order.review.createdAt } : null,
  createdAt: order.createdAt,
});

/**
 * Called when an offer is accepted. Idempotent: the unique `offerId` + `$setOnInsert` mean a retried
 * accept returns the same order instead of creating a second one.
 * With `paid`, the escrow is already funded → the order starts in production and the deadline starts now.
 */
const createFromOffer = async (offer: any, paid?: { paymentId: string; paidAt: Date }, session?: ClientSession) => {
  const feeCents = Math.round((offer.priceCents * offer.platformFeePercent) / 100);
  const code = await nextCode(CODE_PREFIX.order, session);
  const order = await Order.findOneAndUpdate(
    { offerId: offer._id },
    {
      $setOnInsert: {
        code,
        offerId: offer._id,
        offerDirection: offer.direction,
        conversationId: offer.conversationId,
        brandId: offer.brandId,
        creatorId: offer.creatorId,
        packageId: offer.packageId,
        title: offer.title,
        brief: offer.brief ?? "",
        requirements: offer.deliverables ?? [],
        platforms: offer.platforms ?? [],
        deliveryDays: offer.deliveryDays,
        priceCents: offer.priceCents,
        platformFeePercent: offer.platformFeePercent,
        feeCents,
        totalCents: offer.priceCents + feeCents,
        ...(paid
          ? {
              status: "in_production",
              paymentId: paid.paymentId,
              paidAt: paid.paidAt,
              dueAt: new Date(paid.paidAt.getTime() + offer.deliveryDays * DAY_MS),
            }
          : { status: "awaiting_payment" }),
      },
    },
    { upsert: true, new: true, session },
  ).lean();
  // Count the deal only when THIS call created an already-paid order (a retried accept returns the
  // existing order, whose code differs from the one generated above).
  if (paid && order && order.code === code) await UserStatsService.recordPaidOrder(order, session);
  return order!;
};

/** Escrow funded for an order that was waiting for payment → production starts, deadline counts from now. */
const markPaid = async (orderId: string, paymentId: string, session?: ClientSession) => {
  const order = await Order.findOne({ _id: orderId }).session(session ?? null).lean();
  if (!order) return null;
  const paidAt = new Date();
  const updated = await Order.findOneAndUpdate(
    { _id: orderId, status: "awaiting_payment" },
    { $set: { status: "in_production", paymentId, paidAt, dueAt: new Date(paidAt.getTime() + order.deliveryDays * DAY_MS) } },
    { new: true, session },
  ).lean();
  // Only the call that actually moved it out of `awaiting_payment` counts (webhook retries get null).
  if (updated) await UserStatsService.recordPaidOrder(updated, session);
  return updated;
};

/** POST /orders/:id/pay — brand funds the escrow of an `awaiting_payment` order (Stripe Checkout). */
const startPayment = async (brand: ChatViewer & { email?: string }, orderId: string) => {
  const order = await Order.findOne({ _id: orderId, brandId: brand.id }).lean();
  if (!order) throw new ApiError(StatusCodes.NOT_FOUND, "Order not found");
  if (order.status !== "awaiting_payment") throw new ApiError(StatusCodes.CONFLICT, "This order is already paid");

  return PaymentService.createCheckout({
    purpose: "order",
    brandId: brand.id,
    creatorId: String(order.creatorId),
    orderId: String(order._id),
    offerId: String(order.offerId),
    title: order.title,
    description: `Order ${order.code}`,
    payoutCents: order.priceCents,
    feeCents: order.feeCents,
    captureMethod: "automatic",
    customerEmail: brand.email,
    successPath: `/brand/campaigns?payment=success`,
    cancelPath: `/brand/campaigns?payment=cancelled`,
  });
};

/** Tells the creator the escrow is funded and work can start. Never throws. */
const notifyFunded = (order: any) =>
  NotificationService.notifyUser(
    String(order.creatorId),
    {
      type: "escrow_funded",
      title: "Escrow funded — production can start",
      body: `${order.title} is paid into escrow. Deliver within ${order.deliveryDays} days.`,
      link: `/creator/campaigns`,
      data: { orderId: String(order._id) },
    },
    { email: "offers" },
  );

/** GET /orders?status= — the viewer's campaigns with the other party's card, newest first. */
const list = async (viewer: ChatViewer, query: { status?: OrderStatus; page: number; limit: number }) => {
  const filter: Record<string, unknown> = { [partyField(viewer.role)]: viewer.id };
  if (query.status) filter.status = query.status;

  const [rows, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    Order.countDocuments(filter),
  ]);

  const otherRole = viewer.role === USER_ROLE.brand ? USER_ROLE.creator : USER_ROLE.brand;
  const otherId = (o: any) => String(otherRole === USER_ROLE.brand ? o.brandId : o.creatorId);
  const counterparts = await ConversationService.loadCounterparts(otherRole, rows.map(otherId));

  return {
    items: rows.map((o) => ({ ...toOrderView(o), counterpart: counterparts.get(otherId(o)) ?? null })),
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
};

/**
 * GET /orders/:id — only the brand or the creator of the order. Includes the open support ticket
 * (banner + "Chat with Support" link to the viewer's own support thread) and the payout state.
 */
const getOne = async (viewer: ChatViewer, orderId: string) => {
  const order = await Order.findOne({ _id: orderId, [partyField(viewer.role)]: viewer.id }).lean();
  if (!order) throw new ApiError(StatusCodes.NOT_FOUND, "Order not found");
  const otherRole = viewer.role === USER_ROLE.brand ? USER_ROLE.creator : USER_ROLE.brand;
  const otherId = String(otherRole === USER_ROLE.brand ? order.brandId : order.creatorId);
  const [counterparts, issue, payout] = await Promise.all([
    ConversationService.loadCounterparts(otherRole, [otherId]),
    order.status === "disputed" ? SupportService.activeForOrder(order._id) : null,
    order.status === "approved" || order.status === "completed" ? PayoutService.statusForOrder(order._id) : null,
  ]);
  const supportConversationId = issue ? String((await ConversationService.ensureSupportConversation(viewer))._id) : null;
  return {
    ...toOrderView(order),
    counterpart: counterparts.get(otherId) ?? null,
    issue: issue ? { ...issue, supportConversationId } : null,
    payout,
  };
};

/** GET /admin/orders — every order, filterable by status / code, with both parties' cards. */
const adminList = async (query: { status?: OrderStatus; q?: string; page: number; limit: number }) => {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.q) filter.code = query.q.trim().toUpperCase();

  const [rows, total, counts] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    Order.countDocuments(filter),
    // One count per status (indexed on `status`) — cheap, and no aggregation needed.
    Promise.all(ORDER_STATUSES.map((status) => Order.countDocuments({ status }))),
  ]);
  const [brands, creators] = await Promise.all([
    ConversationService.loadCounterparts(USER_ROLE.brand, [...new Set(rows.map((o) => String(o.brandId)))]),
    ConversationService.loadCounterparts(USER_ROLE.creator, [...new Set(rows.map((o) => String(o.creatorId)))]),
  ]);
  return {
    items: rows.map((o) => {
      const { deliverables, ...view } = toOrderView(o);
      return {
        ...view,
        deliverablesCount: deliverables.length,
        brand: brands.get(String(o.brandId)) ?? null,
        creator: creators.get(String(o.creatorId)) ?? null,
      };
    }),
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    stats: Object.fromEntries(ORDER_STATUSES.map((status, i) => [status, counts[i]])),
  };
};

export const OrderService = { createFromOffer, markPaid, startPayment, notifyFunded, list, getOne, adminList };
