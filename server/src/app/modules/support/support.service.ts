import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import { CODE_PREFIX, nextCode } from "../../../shared/codeGenerator";
import { withTransaction } from "../../../shared/db";
import { errorLogger } from "../../../shared/logger";
import { socketEmit } from "../../../socket/emitter";
import { CHAT_LIMITS, SUPPORT_EVENTS } from "../conversation/conversation.constant";
import { Conversation } from "../conversation/conversation.model";
import { ConversationService, type ChatViewer, type ConversationDoc } from "../conversation/conversation.service";
import { Message } from "../conversation/message.model";
import { NotificationService } from "../notification/notification.service";
import { REPORTABLE_STATUSES } from "../order/order.constant";
import { OrderLifecycleService } from "../order/order.lifecycle.service";
import { Order } from "../order/order.model";
import { UploadService } from "../upload/upload.service";
import { USER_ROLE } from "../user/user.constant";
import { SupportTicket, TicketResolution, TicketStatus } from "./ticket.model";

/**
 * Support desk (D24 — no separate dispute flow).
 *
 * "Report an issue" on an order → a ticket is opened, the order goes on hold (`disputed`, escrow stays
 * locked) and a notice is posted in the "Influverse Support" chat thread of BOTH the brand and the
 * creator. Admins answer in those threads from the dashboard and resolve the ticket with one of:
 * resume (order continues), release (creator paid) or refund (brand refunded). Either party can also
 * mark the ticket resolved themselves, which resumes the order.
 */

type AdminActor = { id: string; name?: string };

const toTicketView = (ticket: any) => ({
  id: String(ticket._id),
  code: ticket.code,
  type: ticket.type,
  orderId: ticket.orderId ? String(ticket.orderId) : null,
  orderCode: ticket.orderCode ?? null,
  brandId: ticket.brandId ? String(ticket.brandId) : null,
  creatorId: ticket.creatorId ? String(ticket.creatorId) : null,
  reporterId: String(ticket.reporterId),
  reporterRole: ticket.reporterRole,
  category: ticket.category,
  reason: ticket.reason,
  status: ticket.status as TicketStatus,
  resolution: ticket.resolution
    ? { action: ticket.resolution.action, note: ticket.resolution.note ?? null, by: ticket.resolution.by, at: ticket.resolution.at }
    : null,
  createdAt: ticket.createdAt,
  updatedAt: ticket.updatedAt,
});
export type TicketView = ReturnType<typeof toTicketView>;

/** Posts a system notice into a user's support thread (created on first use). Never throws. */
const postSupportNotice = async (
  user: ChatViewer,
  systemType: "ticket_opened" | "ticket_resolved",
  text: string,
  payload: Record<string, unknown>,
) => {
  try {
    const conversation = await ConversationService.ensureSupportConversation(user);
    await ConversationService.appendMessage({ conversation, actor: user, kind: "system", text, systemType, systemPayload: payload });
    return String(conversation._id);
  } catch (error: any) {
    errorLogger.error(`support notice failed for ${user.id}: ${error.message}`);
    return null;
  }
};

const partiesOf = (ticket: any): ChatViewer[] => [
  ...(ticket.brandId ? [{ id: String(ticket.brandId), role: USER_ROLE.brand } as ChatViewer] : []),
  ...(ticket.creatorId ? [{ id: String(ticket.creatorId), role: USER_ROLE.creator } as ChatViewer] : []),
];

/* ------------------------------------------------------------------ users */

/**
 * POST /orders/:id/report-issue — opens a ticket and puts the order on hold.
 * Transaction: ticket + order hold must both happen or neither (the escrow must not stay unlocked
 * with a ticket, nor locked without one).
 */
const openOrderIssue = async (viewer: ChatViewer, orderId: string, body: { category: string; reason: string }) => {
  const field = viewer.role === USER_ROLE.brand ? "brandId" : "creatorId";
  const order = await Order.findOne({ _id: orderId, [field]: viewer.id }).lean();
  if (!order) throw new ApiError(StatusCodes.NOT_FOUND, "Order not found");
  if (order.status === "disputed") throw new ApiError(StatusCodes.CONFLICT, "A support ticket is already open for this order");
  if (!REPORTABLE_STATUSES.includes(order.status as any)) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      "This order can't be put on hold any more. Message Influverse Support from your inbox and we'll help.",
    );
  }

  const ticket = await withTransaction(async (session) => {
    const ticketId = new Types.ObjectId();
    const held = await OrderLifecycleService.hold(orderId, ticketId, session);
    if (!held) throw new ApiError(StatusCodes.CONFLICT, "The order changed in the meantime. Refresh and try again.");
    const [created] = await SupportTicket.create(
      [
        {
          _id: ticketId,
          code: await nextCode(CODE_PREFIX.ticket, session),
          type: "order_issue",
          orderId: order._id,
          orderCode: order.code,
          brandId: order.brandId,
          creatorId: order.creatorId,
          reporterId: viewer.id,
          reporterRole: viewer.role,
          category: body.category.trim(),
          reason: body.reason.trim(),
        },
      ],
      { session },
    );
    return created.toObject();
  });

  const view = toTicketView(ticket);
  const reporterLabel = viewer.role === USER_ROLE.brand ? "The brand" : "The creator";
  const payload = { ticketId: view.id, code: view.code, orderId: view.orderId, orderCode: view.orderCode, category: view.category };
  for (const party of partiesOf(ticket)) {
    const own = party.id === viewer.id;
    void postSupportNotice(
      party,
      "ticket_opened",
      own
        ? `Support ticket #${view.code} opened for order #${view.orderCode} — ${view.category}: ${view.reason}`
        : `${reporterLabel} reported an issue with order #${view.orderCode} (ticket #${view.code}) — ${view.category}. The escrow stays on hold while Influverse Support helps both sides.`,
      payload,
    );
    void NotificationService.notifyUser(party.id, {
      type: "order_on_hold",
      title: `Order #${view.orderCode} is on hold`,
      body: own ? "Influverse Support has your report and will reply in Messages." : `${reporterLabel} opened a support ticket: ${view.category}.`,
      link: `/${party.role}/orders/${orderId}`,
      data: { orderId, ticketId: view.id },
    });
  }
  void NotificationService.notifyAdmins(
    { type: "new_ticket", title: `New ticket #${view.code} — order #${view.orderCode}`, body: `${view.category}: ${view.reason}`.slice(0, 1000), link: `/tickets?ticket=${view.id}`, data: { ticketId: view.id } },
    { permission: "tickets.manage" },
  );
  socketEmit.toAdmins(SUPPORT_EVENTS.ticketUpdated, { ticket: view });
  return view;
};

/** Shared resolve: money step (if any) → close the ticket → tell both parties + admins. */
const resolveTicket = async (
  ticketId: string,
  action: TicketResolution,
  by: { kind: "brand" | "creator" | "admin"; id: string },
  note?: string,
) => {
  const ticket = await SupportTicket.findById(ticketId).lean();
  if (!ticket) throw new ApiError(StatusCodes.NOT_FOUND, "Ticket not found");
  if (!ticket.active) throw new ApiError(StatusCodes.CONFLICT, "This ticket is already resolved");

  if (ticket.orderId) {
    const orderId = String(ticket.orderId);
    const order = await Order.findById(orderId).select("status hold").lean();
    // Only touch the order while THIS ticket still holds it.
    if (order?.status === "disputed" && String(order.hold?.ticketId) === ticketId) {
      const done =
        action === "release"
          ? await OrderLifecycleService.releaseHeld(orderId)
          : action === "refund"
            ? await OrderLifecycleService.refundHeld(orderId)
            : await OrderLifecycleService.resume(orderId);
      if (!done) throw new ApiError(StatusCodes.CONFLICT, "The order changed in the meantime. Refresh and try again.");
    } else if (action !== "resume") {
      throw new ApiError(StatusCodes.CONFLICT, "The order is no longer on hold, so money can't be moved from this ticket");
    }
  }

  const resolved = await SupportTicket.findOneAndUpdate(
    { _id: ticketId, active: true },
    {
      $set: { status: "resolved", resolution: { action, note: note?.trim() || undefined, by: by.kind, byId: by.id, at: new Date() } },
      $unset: { active: 1 },
    },
    { new: true },
  ).lean();
  if (!resolved) throw new ApiError(StatusCodes.CONFLICT, "This ticket is already resolved");

  const view = toTicketView(resolved);
  const outcome =
    action === "release"
      ? "The escrow payment was released to the creator."
      : action === "refund"
        ? "The brand was refunded and the order is cancelled."
        : "The order continues where it stopped.";
  const who = by.kind === "admin" ? "Influverse Support" : by.kind === "brand" ? "The brand" : "The creator";
  for (const party of partiesOf(resolved)) {
    void postSupportNotice(party, "ticket_resolved", `Ticket #${view.code} resolved by ${who}. ${outcome}${note?.trim() ? ` Note: ${note.trim()}` : ""}`, {
      ticketId: view.id,
      code: view.code,
      orderId: view.orderId,
      orderCode: view.orderCode,
      action,
    });
    void NotificationService.notifyUser(party.id, {
      type: "ticket_resolved",
      title: `Ticket #${view.code} resolved`,
      body: outcome,
      link: view.orderId ? `/${party.role}/orders/${view.orderId}` : `/${party.role}/messages`,
      data: { ticketId: view.id, orderId: view.orderId },
    });
  }
  socketEmit.toAdmins(SUPPORT_EVENTS.ticketUpdated, { ticket: view });
  return view;
};

/** POST /support/tickets/:id/resolve — the brand or creator of the order marks it resolved (order resumes). */
const resolveByParty = async (viewer: ChatViewer, ticketId: string) => {
  const field = viewer.role === USER_ROLE.brand ? "brandId" : "creatorId";
  if (!(await SupportTicket.exists({ _id: ticketId, [field]: viewer.id }))) throw new ApiError(StatusCodes.NOT_FOUND, "Ticket not found");
  return resolveTicket(ticketId, "resume", { kind: viewer.role as "brand" | "creator", id: viewer.id });
};

/** GET /support/tickets — tickets on the viewer's orders (newest first), for the "Order issues" page. */
const listForUser = async (viewer: ChatViewer, query: { status?: "open" | "resolved"; page: number; limit: number }) => {
  const field = viewer.role === USER_ROLE.brand ? "brandId" : "creatorId";
  const filter: Record<string, unknown> = { [field]: viewer.id };
  if (query.status === "open") filter.status = { $in: ["open", "in_progress"] };
  if (query.status === "resolved") filter.status = "resolved";
  const [rows, total] = await Promise.all([
    SupportTicket.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    SupportTicket.countDocuments(filter),
  ]);
  const [orders, brands, creators] = await Promise.all([
    Order.find({ _id: { $in: rows.map((t) => t.orderId).filter(Boolean) } }).select("title brief totalCents priceCents status").lean(),
    ConversationService.loadCounterparts(USER_ROLE.brand, [...new Set(rows.filter((t) => t.brandId).map((t) => String(t.brandId)))]),
    ConversationService.loadCounterparts(USER_ROLE.creator, [...new Set(rows.filter((t) => t.creatorId).map((t) => String(t.creatorId)))]),
  ]);
  const orderById = new Map(orders.map((o) => [String(o._id), o]));
  return {
    items: rows.map((t) => {
      const order = t.orderId ? orderById.get(String(t.orderId)) : undefined;
      return {
        ...toTicketView(t),
        brand: t.brandId ? brands.get(String(t.brandId)) ?? null : null,
        creator: t.creatorId ? creators.get(String(t.creatorId)) ?? null : null,
        order: order
          ? { title: order.title, brief: order.brief ?? "", status: order.status, totalCents: order.totalCents, priceCents: order.priceCents }
          : null,
      };
    }),
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
};

/** The active ticket holding an order (order page banner), or null. */
const activeForOrder = async (orderId: unknown) => {
  const ticket = await SupportTicket.findOne({ orderId, active: true }).lean();
  return ticket ? toTicketView(ticket) : null;
};

/* ------------------------------------------------------------------ admins (dashboard) */

const adminList = async (query: { status?: TicketStatus; q?: string; page: number; limit: number }) => {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.q) {
    const code = query.q.trim().toUpperCase();
    filter.$or = [{ code }, { orderCode: code }];
  }
  const [rows, total, counts] = await Promise.all([
    SupportTicket.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    SupportTicket.countDocuments(filter),
    Promise.all((["open", "in_progress", "resolved"] as const).map((s) => SupportTicket.countDocuments({ status: s }))),
  ]);

  const [brands, creators] = await Promise.all([
    ConversationService.loadCounterparts(USER_ROLE.brand, [...new Set(rows.map((t) => String(t.brandId)).filter((id) => id !== "undefined"))]),
    ConversationService.loadCounterparts(USER_ROLE.creator, [...new Set(rows.map((t) => String(t.creatorId)).filter((id) => id !== "undefined"))]),
  ]);
  return {
    items: rows.map((t) => ({
      ...toTicketView(t),
      brand: t.brandId ? brands.get(String(t.brandId)) ?? null : null,
      creator: t.creatorId ? creators.get(String(t.creatorId)) ?? null : null,
    })),
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    stats: { open: counts[0], inProgress: counts[1], resolved: counts[2] },
  };
};

/** Ticket + its order + both parties' support thread ids (the dashboard opens either chat). */
const adminGet = async (ticketId: string) => {
  const ticket = await SupportTicket.findById(ticketId).lean();
  if (!ticket) throw new ApiError(StatusCodes.NOT_FOUND, "Ticket not found");
  const [order, brands, creators, threads] = await Promise.all([
    ticket.orderId ? Order.findById(ticket.orderId).lean() : null,
    ConversationService.loadCounterparts(USER_ROLE.brand, ticket.brandId ? [String(ticket.brandId)] : []),
    ConversationService.loadCounterparts(USER_ROLE.creator, ticket.creatorId ? [String(ticket.creatorId)] : []),
    Promise.all(partiesOf(ticket).map((p) => ConversationService.ensureSupportConversation(p))),
  ]);
  const threadOf = (userId: unknown) =>
    threads.find((c) => String(c.brandId ?? c.creatorId) === String(userId))?._id?.toString() ?? null;
  return {
    ...toTicketView(ticket),
    brand: ticket.brandId ? brands.get(String(ticket.brandId)) ?? null : null,
    creator: ticket.creatorId ? creators.get(String(ticket.creatorId)) ?? null : null,
    brandConversationId: ticket.brandId ? threadOf(ticket.brandId) : null,
    creatorConversationId: ticket.creatorId ? threadOf(ticket.creatorId) : null,
    order: order
      ? {
          id: String(order._id),
          code: order.code,
          title: order.title,
          status: order.status,
          priceCents: order.priceCents,
          feeCents: order.feeCents,
          totalCents: order.totalCents,
          deliverablesCount: order.deliverables?.length ?? 0,
          paidAt: order.paidAt ?? null,
          dueAt: order.dueAt ?? null,
        }
      : null,
  };
};

const adminResolve = (admin: AdminActor, ticketId: string, body: { action: TicketResolution; note?: string }) =>
  resolveTicket(ticketId, body.action, { kind: "admin", id: admin.id }, body.note);

/** Support inbox: every support thread with at least one message, newest activity first. */
const adminConversations = async (query: { cursor?: string; unread?: boolean; limit: number }) => {
  const filter: Record<string, unknown> = { kind: "support", lastMessageAt: { $ne: null } };
  if (query.unread) filter.supportUnread = { $gt: 0 };
  if (query.cursor) {
    const [ms, id] = query.cursor.split("_");
    const at = new Date(Number(ms));
    if (!Number.isFinite(at.getTime()) || !Types.ObjectId.isValid(id)) throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid cursor");
    filter.$or = [{ lastMessageAt: { $lt: at } }, { lastMessageAt: at, _id: { $lt: new Types.ObjectId(id) } }];
  }
  const rows = await Conversation.find(filter).sort({ lastMessageAt: -1, _id: -1 }).limit(query.limit + 1).lean<ConversationDoc[]>();
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;

  const brandIds = page.filter((c) => c.brandId).map((c) => String(c.brandId));
  const creatorIds = page.filter((c) => !c.brandId).map((c) => String(c.creatorId));
  const [brands, creators] = await Promise.all([
    ConversationService.loadCounterparts(USER_ROLE.brand, brandIds),
    ConversationService.loadCounterparts(USER_ROLE.creator, creatorIds),
  ]);
  const last = page[page.length - 1];
  return {
    items: page.map((c) =>
      ConversationService.toSupportInboxView(c, c.brandId ? brands.get(String(c.brandId)) : creators.get(String(c.creatorId))),
    ),
    meta: { limit: query.limit, nextCursor: hasMore && last ? `${new Date(last.lastMessageAt!).getTime()}_${last._id}` : null },
  };
};

const findSupportThread = async (conversationId: string) => {
  const conversation = await Conversation.findOne({ _id: conversationId, kind: "support" }).lean<ConversationDoc>();
  if (!conversation) throw new ApiError(StatusCodes.NOT_FOUND, "Conversation not found");
  return conversation;
};

/** One support thread for the dashboard chat panel: header + newest messages (cursor `before`). */
const adminMessages = async (conversationId: string, query: { before?: string; limit: number }) => {
  const conversation = await findSupportThread(conversationId);
  const user = ConversationService.supportUserOf(conversation);
  const counterparts = await ConversationService.loadCounterparts(user.role, [user.id]);
  const filter: Record<string, unknown> = { conversationId };
  if (query.before) filter._id = { $lt: new Types.ObjectId(query.before) };
  const rows = await Message.find(filter).sort({ _id: -1 }).limit(query.limit + 1).lean();
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const openTickets = await SupportTicket.find({ [user.role === USER_ROLE.brand ? "brandId" : "creatorId"]: user.id, active: true })
    .sort({ createdAt: -1 })
    .lean();
  return {
    conversation: ConversationService.toSupportInboxView(conversation, counterparts.get(user.id)),
    openTickets: openTickets.map(toTicketView),
    items: page.map((m) => ConversationService.toMessageView(m)),
    meta: { limit: query.limit, nextCursor: hasMore ? String(page[page.length - 1]._id) : null },
  };
};

/** Admin replies in a support thread (text and / or files the admin uploaded as `chat_attachment`). */
const adminSend = async (admin: AdminActor, conversationId: string, body: { text?: string; attachmentIds?: string[]; clientMsgId?: string }) => {
  const conversation = await findSupportThread(conversationId);
  const attachments = body.attachmentIds?.length
    ? ((await UploadService.resolveOwnFiles({ type: "admin", id: admin.id }, body.attachmentIds, ["chat_attachment"], {
        kind: "conversation",
        id: conversationId,
      })) as any[])
    : [];
  const text = (body.text ?? "").trim();
  if (!text && !attachments.length) throw new ApiError(StatusCodes.BAD_REQUEST, "Write a message or attach a file");

  const result = await ConversationService.appendMessage({
    conversation,
    actor: { id: admin.id, role: "admin" },
    kind: "text",
    text,
    attachments,
    clientMsgId: body.clientMsgId,
  });

  if (result.created) {
    const user = ConversationService.supportUserOf(conversation);
    // The user's open tickets are now being handled.
    await SupportTicket.updateMany(
      { [user.role === USER_ROLE.brand ? "brandId" : "creatorId"]: user.id, active: true, status: "open" },
      { $set: { status: "in_progress", assigneeId: admin.id } },
    );
    void ConversationService.notifyNewMessage(
      user.id,
      user.role,
      conversationId,
      "Influverse Support",
      text || (attachments.length === 1 ? `📎 ${attachments[0].name}` : `📎 ${attachments.length} files`),
    );
  }
  return result.message;
};

/** Clears the admin-side unread counter of a support thread (shared by all admins). */
const adminMarkRead = async (conversationId: string) => {
  const readAt = new Date();
  const updated = await Conversation.updateOne({ _id: conversationId, kind: "support" }, { $set: { supportUnread: 0, supportLastReadAt: readAt } });
  if (!updated.matchedCount) throw new ApiError(StatusCodes.NOT_FOUND, "Conversation not found");
  socketEmit.toAdmins(SUPPORT_EVENTS.conversationRead, { conversationId, readAt });
  const conversation = await Conversation.findById(conversationId).select("brandId creatorId").lean<ConversationDoc>();
  if (conversation) {
    const user = ConversationService.supportUserOf(conversation);
    // The user sees "Read" under their messages.
    socketEmit.toUser(user.id, "conversation:read", { conversationId, readerId: "support", readAt });
  }
  return { conversationId, readAt };
};

/** Sidebar badge: support threads with unread user messages. */
const adminUnreadCount = async () => Conversation.countDocuments({ kind: "support", supportUnread: { $gt: 0 } });

export const SupportService = {
  openOrderIssue,
  resolveByParty,
  listForUser,
  activeForOrder,
  adminList,
  adminGet,
  adminResolve,
  adminConversations,
  adminMessages,
  adminSend,
  adminMarkRead,
  adminUnreadCount,
  limits: { messagesPageSize: CHAT_LIMITS.messagesPageSize },
};
