import { StatusCodes } from "http-status-codes";
import { UserStatsService } from "../user/userStats.service";
import { ClientSession, Types } from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import { withTransaction } from "../../../shared/db";
import { errorLogger, logger } from "../../../shared/logger";
import { ConversationService, type ChatViewer, type ConversationDoc } from "../conversation/conversation.service";
import { Conversation } from "../conversation/conversation.model";
import { CreatorProfile } from "../creator/creator.model";
import { CreatorService } from "../creator/creator.service";
import { NotificationService } from "../notification/notification.service";
import { PaymentService } from "../payment/payment.service";
import { PayoutService } from "../payout/payout.service";
import { registerFileAccess, UploadService } from "../upload/upload.service";
import { ORDER_FILE_KIND, ORDER_LIMITS, ORDER_TIMING, OrderStatus, REPORTABLE_STATUSES } from "./order.constant";
import { Order } from "./order.model";

/**
 * What happens to an order after the escrow is funded (docs/order-lifecycle-plan.md):
 *
 *   in_production ──submit──▶ deliverable_submitted ──approve──▶ approved ──review──▶ completed
 *        ▲                          │
 *        └──────── revision ────────┘
 *
 *   in_production / deliverable_submitted ──report issue──▶ disputed (support ticket holds the escrow)
 *   disputed ──resolved──▶ previous status | approved (release to creator) | cancelled (refund brand)
 *
 * Every transition is ONE conditional update on the current status, so a double click, two tabs or a
 * worker racing a user can never apply a step twice. Money steps (approve → payout row, refund) use a
 * transaction / Stripe idempotency keys.
 */

const DAY_MS = 24 * 3600 * 1000;
const money = (cents: number) => `€${(cents / 100).toLocaleString("en-IE", { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;

// Deliverable files: the brand and the creator of the order, and admins (support / disputes).
registerFileAccess(ORDER_FILE_KIND, async (orderId, viewer) =>
  viewer.type === "admin" ||
  Boolean(await Order.exists({ _id: orderId, $or: [{ brandId: viewer.id }, { creatorId: viewer.id }] })),
);

const notFound = () => new ApiError(StatusCodes.NOT_FOUND, "Order not found");

/** Loads the order only for its own brand / creator (404 for everyone else). */
const findOwn = async (viewer: ChatViewer, orderId: string) => {
  const field = viewer.role === "brand" ? "brandId" : "creatorId";
  const order = await Order.findOne({ _id: orderId, [field]: viewer.id }).lean();
  if (!order) throw notFound();
  return order;
};

/** 409 that explains what the order is doing right now. */
const wrongState = (status: string, action: string) => {
  const reasons: Record<string, string> = {
    awaiting_payment: "the escrow is not funded yet",
    in_production: "the creator is still working on it",
    deliverable_submitted: "deliverables are waiting for the brand's review",
    approved: "it is already approved",
    completed: "it is already completed",
    cancelled: "it was cancelled",
    disputed: "a support ticket is open for it",
  };
  return new ApiError(StatusCodes.CONFLICT, `You can't ${action} — ${reasons[status] ?? "its status changed"}.`);
};

const platformName = (url: string) => {
  const low = url.toLowerCase();
  if (low.includes("drive.google")) return "Google Drive";
  if (low.includes("dropbox")) return "Dropbox";
  if (low.includes("frame.io")) return "Frame.io";
  if (low.includes("loom")) return "Loom";
  if (low.includes("wetransfer")) return "WeTransfer";
  return "Cloud Link";
};

/** The brand ↔ creator chat thread of an order (for revision notes). */
const directThread = (order: any) => Conversation.findById(order.conversationId).lean<ConversationDoc>();

/* ------------------------------------------------------------------ creator */

/** POST /orders/:id/deliverables — creator submits files and / or cloud links for review. */
const submitDeliverable = async (
  creator: ChatViewer,
  orderId: string,
  body: { title: string; notes?: string; fileIds?: string[]; links?: string[] },
) => {
  const order = await findOwn(creator, orderId);
  if (order.status !== "in_production") throw wrongState(order.status, "submit deliverables");
  if ((order.deliverables?.length ?? 0) >= ORDER_LIMITS.maxSubmissions) {
    throw new ApiError(StatusCodes.CONFLICT, "This order has reached the maximum number of submissions");
  }

  const links = [...new Set((body.links ?? []).map((l) => l.trim()).filter(Boolean))];
  const fileIds = body.fileIds ?? [];
  if (!fileIds.length && !links.length) throw new ApiError(StatusCodes.BAD_REQUEST, "Upload at least one file or add a cloud link");

  // Only the creator's own, fully uploaded `deliverable` files; attaching them lets the brand download them.
  const files = await UploadService.resolveOwnFiles({ type: "user", id: creator.id }, fileIds, ["deliverable"], {
    kind: ORDER_FILE_KIND,
    id: orderId,
  });

  const now = new Date();
  const updated = await Order.findOneAndUpdate(
    { _id: orderId, creatorId: creator.id, status: "in_production" },
    {
      $push: {
        deliverables: {
          title: body.title.trim(),
          notes: body.notes?.trim() || undefined,
          files,
          links: links.map((url) => ({ title: platformName(url), url })),
          submittedAt: now,
        },
      },
      $set: { status: "deliverable_submitted", deliveredAt: now, reviewDueAt: new Date(now.getTime() + ORDER_TIMING.reviewWindowDays * DAY_MS) },
    },
    { new: true },
  ).lean();
  if (!updated) throw wrongState((await Order.findById(orderId).select("status").lean())?.status ?? "unknown", "submit deliverables");

  void NotificationService.notifyUser(
    String(updated.brandId),
    {
      type: "order_delivered",
      title: "Deliverables ready for review",
      body: `${updated.title}: review and approve within ${ORDER_TIMING.reviewWindowDays} days, or ask for revisions.`,
      link: `/brand/orders/${orderId}`,
      data: { orderId },
    },
    { email: "deliverables" },
  );
  return updated;
};

/* ------------------------------------------------------------------ brand */

/** POST /orders/:id/revision — brand sends the work back with notes (also posted in the chat thread). */
const requestRevision = async (brand: ChatViewer, orderId: string, notes: string) => {
  const updated = await Order.findOneAndUpdate(
    { _id: orderId, brandId: brand.id, status: "deliverable_submitted" },
    { $set: { status: "in_production" }, $inc: { revisionCount: 1 }, $unset: { reviewDueAt: 1 } },
    { new: true },
  ).lean();
  if (!updated) {
    const current = await findOwn(brand, orderId);
    throw wrongState(current.status, "request revisions");
  }

  // Same as the original design: the note lands in the shared Messages thread as the brand's message.
  try {
    const conversation = await directThread(updated);
    if (conversation) {
      await ConversationService.appendMessage({
        conversation,
        actor: brand,
        kind: "text",
        text: `[Revision Requested for Order #${updated.code}]: ${notes.trim()}`,
      });
    }
  } catch (error: any) {
    errorLogger.error(`revision chat message failed for order ${orderId}: ${error.message}`);
  }

  void NotificationService.notifyUser(
    String(updated.creatorId),
    {
      type: "revision_requested",
      title: "Revision requested",
      body: `${updated.title}: ${notes.trim().slice(0, 300)}`,
      link: `/creator/orders/${orderId}`,
      data: { orderId },
    },
    { email: "deliverables" },
  );
  return updated;
};

/**
 * Approves an order and creates the creator's payout — one transaction (order status + payout row),
 * then the Stripe transfer right after commit. `from` lists the statuses approval is allowed from.
 */
const approveInternal = async (
  orderId: string,
  options: { filter?: Record<string, unknown>; from: OrderStatus[]; auto?: boolean; session?: ClientSession },
) => {
  const run = async (session: ClientSession) => {
    const approved = await Order.findOneAndUpdate(
      { _id: orderId, status: { $in: options.from }, ...(options.filter ?? {}) },
      { $set: { status: "approved", approvedAt: new Date(), autoApproved: Boolean(options.auto) }, $unset: { reviewDueAt: 1, hold: 1 } },
      { new: true, session },
    ).lean();
    if (!approved) return null;
    const payout = await PayoutService.createForOrder(approved, session);
    return { order: approved, payoutId: String(payout._id) };
  };
  const result = options.session ? await run(options.session) : await withTransaction(run);
  if (!result) return null;

  void PayoutService.sendPayout(result.payoutId);
  const { order } = result;
  void NotificationService.notifyUser(
    String(order.creatorId),
    {
      type: "payment_released",
      title: options.auto ? "Order auto-approved — payment released" : "Deliverables approved — payment released",
      body: `${money(order.priceCents)} for ${order.title} is released from escrow.`,
      link: `/creator/orders/${orderId}`,
      data: { orderId },
    },
    { email: "payouts" },
  );
  if (options.auto) {
    void NotificationService.notifyUser(String(order.brandId), {
      type: "order_approved",
      title: "Order auto-approved",
      body: `${order.title} was approved automatically ${ORDER_TIMING.reviewWindowDays} days after delivery. Leave a review to finish the campaign.`,
      link: `/brand/orders/${orderId}`,
      data: { orderId },
    });
  }
  return order;
};

/** POST /orders/:id/approve — brand approves the submitted deliverables → escrow released to the creator. */
const approve = async (brand: ChatViewer, orderId: string) => {
  const order = await approveInternal(orderId, { filter: { brandId: brand.id }, from: ["deliverable_submitted"] });
  if (!order) {
    const current = await findOwn(brand, orderId);
    throw wrongState(current.status, "approve this order");
  }
  return order;
};

/** Counts one more completed collaboration on the creator's public profile. */
const countCollaboration = (creatorId: unknown) =>
  CreatorProfile.updateOne({ userId: creatorId }, { $inc: { totalCollaborations: 1 } });

/**
 * POST /orders/:id/review — brand rates the creator (1–5 + comment) → campaign completed.
 * The creator's average is updated in ONE atomic pipeline update (no read-modify-write race).
 */
const review = async (brand: ChatViewer, orderId: string, body: { rating: number; comment: string }) => {
  const now = new Date();
  const updated = await Order.findOneAndUpdate(
    { _id: orderId, brandId: brand.id, status: "approved", review: { $exists: false } },
    { $set: { status: "completed", completedAt: now, review: { rating: body.rating, comment: body.comment.trim(), createdAt: now } } },
    { new: true },
  ).lean();
  if (!updated) {
    const current = await findOwn(brand, orderId);
    throw wrongState(current.status, "review this order");
  }

  // ratingSum is missing on profiles created before reviews existed → start from rating × count.
  const previousSum = { $ifNull: ["$ratingSum", { $multiply: [{ $ifNull: ["$rating", 0] }, { $ifNull: ["$reviewsCount", 0] }] }] };
  await CreatorProfile.updateOne({ userId: updated.creatorId }, [
    {
      $set: {
        ratingSum: { $add: [previousSum, body.rating] },
        reviewsCount: { $add: [{ $ifNull: ["$reviewsCount", 0] }, 1] },
        totalCollaborations: { $add: [{ $ifNull: ["$totalCollaborations", 0] }, 1] },
      },
    },
    { $set: { rating: { $round: [{ $divide: ["$ratingSum", "$reviewsCount"] }, 1] } } },
  ]);

  // The public profile (rating + Client Reviews) is cached — drop it so the review shows right away.
  const handle = (await CreatorProfile.findOne({ userId: updated.creatorId }).select("handle").lean())?.handle;
  void CreatorService.invalidate(String(updated.creatorId), handle);

  void NotificationService.notifyUser(String(updated.creatorId), {
    type: "review_received",
    title: `New ${body.rating}-star review`,
    body: `${updated.title}: “${body.comment.trim().slice(0, 200)}”`,
    link: `/creator/orders/${orderId}`,
    data: { orderId },
  });
  return updated;
};

/* ------------------------------------------------------------------ support holds (used by the support module) */

/** Puts an order on hold for a support ticket. Returns null when the order can't be held right now. */
const hold = async (orderId: string, ticketId: Types.ObjectId, session: ClientSession) => {
  const order = await Order.findById(orderId).select("status").session(session).lean();
  if (!order || !REPORTABLE_STATUSES.includes(order.status as OrderStatus)) return null;
  return Order.findOneAndUpdate(
    { _id: orderId, status: order.status },
    { $set: { status: "disputed", hold: { ticketId, previousStatus: order.status, since: new Date() } }, $unset: { reviewDueAt: 1 } },
    { new: true, session },
  ).lean();
};

/** Ticket resolved without money moving → the order continues where it stopped. */
const resume = async (orderId: string, session?: ClientSession) => {
  const order = await Order.findOne({ _id: orderId, status: "disputed" }).select("hold").session(session ?? null).lean();
  if (!order) return null;
  const previous = (order.hold?.previousStatus as OrderStatus) || "in_production";
  const set: Record<string, unknown> = { status: previous };
  // A submission waiting for review gets a fresh review window (the hold paused the clock).
  if (previous === "deliverable_submitted") set.reviewDueAt = new Date(Date.now() + ORDER_TIMING.reviewWindowDays * DAY_MS);
  return Order.findOneAndUpdate({ _id: orderId, status: "disputed" }, { $set: set, $unset: { hold: 1 } }, { new: true, session }).lean();
};

/** Support decided for the creator → approve + payout. */
const releaseHeld = (orderId: string) => approveInternal(orderId, { from: ["disputed"] });

/**
 * Support decided for the brand → full refund and the order is cancelled.
 * Stripe first (idempotency key `refund-<paymentId>` makes a retry return the same refund), then the DB.
 */
const refundHeld = async (orderId: string) => {
  const order = await Order.findOne({ _id: orderId, status: "disputed" }).lean();
  if (!order) return null;
  if (order.paymentId) {
    try {
      await PaymentService.refund(String(order.paymentId));
    } catch (error: any) {
      errorLogger.error(`Refund failed for order ${order.code}: ${error.message}`);
      throw new ApiError(StatusCodes.BAD_GATEWAY, "Stripe refund failed. Please try again.");
    }
  }
  const cancelled = await Order.findOneAndUpdate(
    { _id: orderId, status: "disputed" },
    { $set: { status: "cancelled", cancelledAt: new Date() }, $unset: { hold: 1, reviewDueAt: 1 } },
    { new: true },
  ).lean();
  if (cancelled) {
    // The money went back to the brand → the deal no longer counts for either side.
    if (cancelled.paidAt) await UserStatsService.reverseRefundedOrder(cancelled);
    void NotificationService.notifyUser(String(cancelled.brandId), {
      type: "refund_issued",
      title: "Refund issued",
      body: `${money(cancelled.totalCents)} for ${cancelled.title} is refunded to your card.`,
      link: `/brand/orders/${orderId}`,
      data: { orderId },
    });
    void NotificationService.notifyUser(String(cancelled.creatorId), {
      type: "order_cancelled",
      title: "Order cancelled by support",
      body: `${cancelled.title} was cancelled and the brand was refunded.`,
      link: `/creator/orders/${orderId}`,
      data: { orderId },
    });
  }
  return cancelled;
};

/* ------------------------------------------------------------------ worker sweeps */

/** Submitted deliverables whose review window passed → approved automatically (creator protection). */
const autoApproveDue = async () => {
  const due = await Order.find({ status: "deliverable_submitted", reviewDueAt: { $lte: new Date() } }).select("_id").limit(100).lean();
  let count = 0;
  for (const { _id } of due) {
    try {
      // The same conditional filter as the brand's approve — if the brand acts first, this is a no-op.
      if (await approveInternal(String(_id), { from: ["deliverable_submitted"], filter: { reviewDueAt: { $lte: new Date() } }, auto: true })) count += 1;
    } catch (error: any) {
      errorLogger.error(`auto-approve failed for order ${_id}: ${error.message}`);
    }
  }
  return count;
};

/** Approved orders the brand never reviewed → completed after ORDER_TIMING.autoCompleteDays. */
const autoCompleteDue = async () => {
  const cutoff = new Date(Date.now() - ORDER_TIMING.autoCompleteDays * DAY_MS);
  const due = await Order.find({ status: "approved", approvedAt: { $lte: cutoff } }).select("_id creatorId").limit(200).lean();
  let count = 0;
  for (const order of due) {
    const done = await Order.updateOne({ _id: order._id, status: "approved" }, { $set: { status: "completed", completedAt: new Date() } });
    if (done.modifiedCount) {
      await countCollaboration(order.creatorId);
      count += 1;
    }
  }
  if (count) logger.info(`Auto-completed ${count} order(s)`);
  return count;
};

export const OrderLifecycleService = {
  submitDeliverable,
  requestRevision,
  approve,
  review,
  hold,
  resume,
  releaseHeld,
  refundHeld,
  autoApproveDue,
  autoCompleteDue,
};
