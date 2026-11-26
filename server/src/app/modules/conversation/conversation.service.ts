import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import ApiError from "../../../errors/ApiErrors";
import { getRedis } from "../../../config/redis.config";
import { errorLogger } from "../../../shared/logger";
import { socketEmit } from "../../../socket/emitter";
import { SessionService } from "../auth/session.service";
import { BrandProfile } from "../brand/brand.model";
import { CreatorProfile } from "../creator/creator.model";
import { NotificationService } from "../notification/notification.service";
import { registerFileAccess, UploadService } from "../upload/upload.service";
import { User } from "../user/user.model";
import { LOGIN_ALLOWED_STATUSES, UserRole, USER_ROLE } from "../user/user.constant";
import {
  CHAT_EVENTS,
  CHAT_FILE_KIND,
  CHAT_LIMITS,
  DELETED_MESSAGE_TEXT,
  MessageKind,
  SUPPORT_COUNTERPART,
  SUPPORT_EVENTS,
  SystemMessageType,
} from "./conversation.constant";
import { Conversation, IConversation } from "./conversation.model";
import { Message } from "./message.model";
import { loadOfferViews, OfferView } from "../offer/offer.mapper";

/**
 * Brand ↔ creator chat (docs/messaging-and-offer-plan.md §4).
 *
 * Flow of a message: REST `POST /conversations/:id/messages` → saved here → both participants get
 * a socket push in their own `user:<id>` room. Users never join conversation rooms themselves,
 * so a missing membership check can't leak a thread to someone else.
 */

type Viewer = { id: string; role: UserRole };
/** Who writes into a thread: a user (brand / creator) or, in support threads only, an admin. */
type Actor = { id: string; role: UserRole | "admin" };
type ConversationDoc = IConversation & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
type AttachmentRef = { fileId: unknown; url: string; name: string; mime: string; size: number };

const DUPLICATE_KEY = 11000;

/* ------------------------------------------------------------------ helpers */

// Every viewer only ever touches their own side's fields.
const ownField = (role: UserRole) => (role === USER_ROLE.brand ? "brandId" : "creatorId");
const otherField = (role: UserRole) => (role === USER_ROLE.brand ? "creatorId" : "brandId");
const unreadField = (role: UserRole) => (role === USER_ROLE.brand ? "brandUnread" : "creatorUnread");
const lastReadField = (role: UserRole) => (role === USER_ROLE.brand ? "brandLastReadAt" : "creatorLastReadAt");
const clearedField = (role: UserRole) => (role === USER_ROLE.brand ? "brandClearedAt" : "creatorClearedAt");
const hiddenField = (role: UserRole) => (role === USER_ROLE.brand ? "brandHidden" : "creatorHidden");
const otherRole = (role: UserRole): UserRole => (role === USER_ROLE.brand ? USER_ROLE.creator : USER_ROLE.brand);

/* Support threads: one user <-> Influverse Support. The user is whichever of brandId / creatorId is set. */
const isSupport = (conversation: { kind?: string | null }) => conversation.kind === "support";
const supportUserOf = (conversation: ConversationDoc): Viewer =>
  conversation.brandId
    ? { id: String(conversation.brandId), role: USER_ROLE.brand }
    : { id: String(conversation.creatorId), role: USER_ROLE.creator };

/** Users who see this thread in their own inbox (support threads: just the one user; admins get room events). */
const userParticipants = (conversation: ConversationDoc): string[] =>
  isSupport(conversation) ? [supportUserOf(conversation).id] : [String(conversation.brandId), String(conversation.creatorId)];

const notFound = () => new ApiError(StatusCodes.NOT_FOUND, "Conversation not found");

/** Loads a conversation only if the viewer is one of its two participants (otherwise 404, not 403 — don't confirm it exists). */
const findOwnConversation = async (viewer: Viewer, conversationId: string) => {
  const conversation = await Conversation.findOne({ _id: conversationId, [ownField(viewer.role)]: viewer.id }).lean<ConversationDoc>();
  if (!conversation) throw notFound();
  return conversation;
};

// Private chat files can be downloaded by both participants (upload module asks this resolver).
// Support threads: any admin (the support desk) may open the files, too.
registerFileAccess(CHAT_FILE_KIND, async (conversationId, viewer) =>
  viewer.type === "user"
    ? Boolean(await Conversation.exists({ _id: conversationId, $or: [{ brandId: viewer.id }, { creatorId: viewer.id }] }))
    : viewer.type === "admin" && Boolean(await Conversation.exists({ _id: conversationId, kind: "support" })),
);

/** The person on the other side of the thread, shaped for the chat header / inbox row. */
type Counterpart = {
  id: string;
  role: UserRole;
  name: string;
  avatar: string | null;
  /** Creator handle (→ /creators/:handle) or brand slug (→ /brands/:slug). */
  handle: string | null;
  verified: boolean;
  available: boolean;
};

/**
 * Batch-loads counterparts for many conversations: 2 indexed `$in` queries, no `$lookup`.
 * Display data comes from the public profile, falling back to the account name / avatar.
 */
const loadCounterparts = async (role: UserRole, userIds: string[]): Promise<Map<string, Counterpart>> => {
  const result = new Map<string, Counterpart>();
  if (!userIds.length) return result;

  const users = await User.find({ _id: { $in: userIds } }).select("name avatar status").lean();
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const isAvailable = (id: string) => {
    const user = userById.get(id);
    return !!user && LOGIN_ALLOWED_STATUSES.includes(user.status as any);
  };

  if (role === USER_ROLE.creator) {
    const profiles = await CreatorProfile.find({ userId: { $in: userIds } }).select("userId name handle avatar verified").lean();
    const profileById = new Map(profiles.map((p) => [String(p.userId), p]));
    for (const id of userIds) {
      const user = userById.get(id);
      const profile = profileById.get(id);
      result.set(id, {
        id,
        role,
        name: profile?.name || user?.name || "Creator",
        avatar: profile?.avatar ?? user?.avatar ?? null,
        handle: profile?.handle ?? null,
        verified: Boolean(profile?.verified),
        available: isAvailable(id),
      });
    }
  } else {
    const profiles = await BrandProfile.find({ userId: { $in: userIds } }).select("userId companyName logo slug verified").lean();
    const profileById = new Map(profiles.map((p) => [String(p.userId), p]));
    for (const id of userIds) {
      const user = userById.get(id);
      const profile = profileById.get(id);
      result.set(id, {
        id,
        role,
        name: profile?.companyName || user?.name || "Brand",
        avatar: profile?.logo ?? user?.avatar ?? null,
        handle: profile?.slug ?? null,
        verified: Boolean(profile?.verified),
        available: isAvailable(id),
      });
    }
  }
  return result;
};

/** API shape of a conversation, as seen by `viewer`. */
const toConversationView = (viewer: Viewer, conversation: ConversationDoc, counterpart: Counterpart | undefined) => ({
  id: String(conversation._id),
  kind: (conversation.kind ?? "direct") as "direct" | "support",
  counterpart: isSupport(conversation) ? SUPPORT_COUNTERPART : counterpart ?? null,
  lastMessage: conversation.lastMessage
    ? { ...conversation.lastMessage, senderId: conversation.lastMessage.senderId ? String(conversation.lastMessage.senderId) : null }
    : null,
  lastMessageAt: conversation.lastMessageAt,
  unread: conversation[unreadField(viewer.role)] ?? 0,
  /** When the other side last read the thread — for "Read" under your own messages. */
  counterpartLastReadAt: isSupport(conversation)
    ? conversation.supportLastReadAt ?? null
    : conversation[lastReadField(otherRole(viewer.role))] ?? null,
  createdAt: conversation.createdAt,
});

/** Support desk (dashboard) shape: the user is the counterpart, unread = admin-side unread. */
const toSupportInboxView = (conversation: ConversationDoc, user: Counterpart | undefined) => {
  const supportUser = supportUserOf(conversation);
  return {
    id: String(conversation._id),
    kind: "support" as const,
    user: user ?? {
      id: supportUser.id,
      role: supportUser.role,
      name: supportUser.role === USER_ROLE.brand ? "Brand" : "Creator",
      avatar: null,
      handle: null,
      verified: false,
      available: false,
    },
    lastMessage: conversation.lastMessage
      ? { ...conversation.lastMessage, senderId: conversation.lastMessage.senderId ? String(conversation.lastMessage.senderId) : null }
      : null,
    lastMessageAt: conversation.lastMessageAt,
    unread: conversation.supportUnread ?? 0,
    /** When the user last read the thread - "Seen" under admin replies. */
    userLastReadAt: conversation[lastReadField(supportUser.role)] ?? null,
    createdAt: conversation.createdAt,
  };
};

/** `offers` = preloaded offer views for `kind: "offer"` cards and offer notices (see loadOffersFor). */
const toMessageView = (message: any, offers?: Map<string, OfferView>) => ({
  offer: message.offerId ? offers?.get(String(message.offerId)) ?? null : null,
  id: String(message._id),
  conversationId: String(message.conversationId),
  senderId: message.senderId ? String(message.senderId) : null,
  kind: message.kind as MessageKind,
  text: message.isDeleted ? "" : message.text ?? "",
  attachments: message.isDeleted
    ? []
    : (message.attachments ?? []).map((a: AttachmentRef) => ({ id: String(a.fileId), url: a.url, name: a.name, mime: a.mime, size: a.size })),
  offerId: message.offerId ? String(message.offerId) : null,
  systemType: message.systemType ?? null,
  systemPayload: message.systemPayload ?? null,
  isDeleted: Boolean(message.isDeleted),
  clientMsgId: message.clientMsgId ?? null,
  createdAt: message.createdAt,
});

/** One `$in` query for every offer referenced by these messages. */
const loadOffersFor = (messages: { offerId?: unknown }[]) =>
  loadOfferViews(messages.filter((m) => m.offerId).map((m) => String(m.offerId)));

const preview = (text: string) =>
  text.length > CHAT_LIMITS.previewLength ? `${text.slice(0, CHAT_LIMITS.previewLength - 1)}…` : text;

/** Inbox preview for a message with files and no text. */
const attachmentsPreview = (attachments: AttachmentRef[]) =>
  attachments.length === 1 ? `📎 ${attachments[0].name}` : `📎 ${attachments.length} files`;

/** Inbox cursor = `<lastMessageAt ms>_<conversationId>` — stable even when two rows share a timestamp. */
const encodeInboxCursor = (conversation: ConversationDoc) =>
  `${new Date(conversation.lastMessageAt!).getTime()}_${conversation._id}`;

const decodeInboxCursor = (cursor?: string) => {
  if (!cursor) return null;
  const [ms, id] = cursor.split("_");
  const at = Number(ms);
  if (!Number.isFinite(at) || !Types.ObjectId.isValid(id)) throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid cursor");
  return { at: new Date(at), id: new Types.ObjectId(id) };
};

/** Pushes the viewer's new total unread count (sidebar badge). Never throws. */
const pushUnreadTotal = async (userId: string, role: UserRole) => {
  try {
    socketEmit.toUser(userId, CHAT_EVENTS.unreadTotal, { total: await unreadTotal({ id: userId, role }) });
  } catch (error: any) {
    errorLogger.error(`chat unread push failed for ${userId}: ${error.message}`);
  }
};

/**
 * At most one "new message" notification (in-app + optional email) per conversation per recipient
 * every 15 minutes — a burst of 20 messages shouldn't send 20 emails. `SET NX EX` is atomic across api instances.
 */
const notifyNewMessage = async (recipientId: string, recipientRole: UserRole, conversationId: string, senderName: string, text: string) => {
  try {
    const throttleKey = `chat:notify:${conversationId}:${recipientId}`;
    const firstInWindow = await getRedis().set(throttleKey, "1", "EX", CHAT_LIMITS.notifyThrottleSeconds, "NX");
    if (!firstInWindow) return;
    await NotificationService.notifyUser(
      recipientId,
      {
        type: "new_message",
        title: `New message from ${senderName}`,
        body: preview(text),
        link: `/${recipientRole}/messages?conv=${conversationId}`,
        data: { conversationId },
      },
      { email: "messages" },
    );
  } catch (error: any) {
    errorLogger.error(`chat notify failed for ${recipientId}: ${error.message}`);
  }
};

/* ------------------------------------------------------------------ core write (also used by offers) */

type AppendInput = {
  conversation: ConversationDoc;
  /** Who caused this message. For `system` messages this is the actor; the stored senderId is null. */
  actor: Actor;
  kind: MessageKind;
  text: string;
  attachments?: AttachmentRef[];
  offerId?: string;
  systemType?: SystemMessageType;
  systemPayload?: Record<string, unknown>;
  clientMsgId?: string;
  /** Inbox preview override, e.g. "Sent an offer: Summer reel". */
  previewText?: string;
};

/**
 * Saves one message, bumps the conversation preview + the other side's unread counter,
 * un-hides the thread for both sides, and pushes it to both participants.
 * Returns `{ message, created: false }` for a retried send.
 */
const appendMessage = async (input: AppendInput) => {
  const { conversation, actor, kind } = input;
  const conversationId = String(conversation._id);
  const senderId = kind === "system" ? null : actor.id;

  let message;
  try {
    message = (
      await Message.create({
        conversationId,
        senderId,
        kind,
        text: input.text,
        attachments: input.attachments?.length ? input.attachments : undefined,
        offerId: input.offerId,
        systemType: input.systemType,
        systemPayload: input.systemPayload,
        clientMsgId: input.clientMsgId,
      })
    ).toObject();
  } catch (error: any) {
    // Same clientMsgId sent twice (client retry) → return the stored copy, don't count it again.
    if (error?.code === DUPLICATE_KEY && input.clientMsgId) {
      const existing = await Message.findOne({ conversationId, senderId, clientMsgId: input.clientMsgId }).lean();
      if (existing) return { message: toMessageView(existing, await loadOffersFor([existing])), created: false };
    }
    throw error;
  }

  const previewText = input.previewText ?? (input.text || (input.attachments?.length ? attachmentsPreview(input.attachments) : ""));
  if (isSupport(conversation)) return appendSupportSide(conversation, actor, message, previewText);

  const userActor = actor as Viewer;
  const recipientRole = otherRole(userActor.role);
  const updated = await Conversation.findOneAndUpdate(
    { _id: conversationId },
    {
      $set: {
        lastMessage: { text: preview(previewText), kind, senderId, at: message.createdAt },
        lastMessageAt: message.createdAt,
        // Sending implies you have read everything before it.
        [unreadField(userActor.role)]: 0,
        [lastReadField(userActor.role)]: message.createdAt,
        // A new message brings a "deleted" thread back to both inboxes (older history stays cleared).
        brandHidden: false,
        creatorHidden: false,
      },
      $inc: { [unreadField(recipientRole)]: 1 },
    },
    { new: true },
  ).lean<ConversationDoc>();

  const messageView = toMessageView(message, await loadOffersFor([message]));
  const recipientId = String(conversation[otherField(userActor.role)]);

  if (updated) {
    // Each side gets its own unread number; the counterpart card is already on the client.
    for (const [userId, role] of [[userActor.id, userActor.role], [recipientId, recipientRole]] as const) {
      socketEmit.toUser(userId, CHAT_EVENTS.messageNew, {
        conversationId,
        message: messageView,
        conversation: toConversationView({ id: userId, role }, updated, undefined),
      });
    }
    void pushUnreadTotal(recipientId, recipientRole);
  }

  return { message: messageView, created: true, recipientId, recipientRole };
};

/**
 * Support thread bookkeeping after a message is stored. A user message bumps the admin-side unread
 * counter; an admin message bumps the user's. The user gets the normal chat events, admins get
 * `support:*` events in the `admins` room (the dashboard support desk).
 */
const appendSupportSide = async (conversation: ConversationDoc, actor: Actor, message: any, previewText: string) => {
  const conversationId = String(conversation._id);
  const supportUser = supportUserOf(conversation);
  const fromAdmin = actor.role === "admin";
  const isSystem = message.kind === "system";

  const set: Record<string, unknown> = {
    lastMessage: { text: preview(previewText), kind: message.kind, senderId: message.senderId, at: message.createdAt },
    lastMessageAt: message.createdAt,
    [hiddenField(supportUser.role)]: false,
  };
  const inc: Record<string, number> = {};
  if (fromAdmin) {
    set.supportUnread = 0;
    set.supportLastReadAt = message.createdAt;
    inc[unreadField(supportUser.role)] = 1;
  } else {
    if (isSystem) {
      // A system notice (ticket opened / resolved) is news for the user too.
      inc[unreadField(supportUser.role)] = 1;
    } else {
      // Writing implies the user has read everything before it.
      set[unreadField(supportUser.role)] = 0;
      set[lastReadField(supportUser.role)] = message.createdAt;
    }
    inc.supportUnread = 1;
  }

  const updated = await Conversation.findOneAndUpdate(
    { _id: conversationId },
    { $set: set, ...(Object.keys(inc).length ? { $inc: inc } : {}) },
    { new: true },
  ).lean<ConversationDoc>();

  const messageView = toMessageView(message);
  if (updated) {
    socketEmit.toUser(supportUser.id, CHAT_EVENTS.messageNew, {
      conversationId,
      message: messageView,
      conversation: toConversationView(supportUser, updated, undefined),
    });
    socketEmit.toAdmins(SUPPORT_EVENTS.messageNew, { conversationId, message: messageView, conversation: toSupportInboxView(updated, undefined) });
    if (fromAdmin || isSystem) void pushUnreadTotal(supportUser.id, supportUser.role);
  }
  return { message: messageView, created: true, recipientId: fromAdmin ? supportUser.id : null, recipientRole: supportUser.role };
};

/**
 * Re-sends a changed message to both participants (e.g. an offer card whose status changed).
 * Used by the offer module.
 */
const broadcastMessageUpdate = async (conversation: ConversationDoc, messageId: string) => {
  const message = await Message.findById(messageId).lean();
  if (!message) return;
  const payload = { conversationId: String(conversation._id), message: toMessageView(message, await loadOffersFor([message])) };
  for (const userId of userParticipants(conversation)) socketEmit.toUser(userId, CHAT_EVENTS.messageUpdated, payload);
  if (isSupport(conversation)) socketEmit.toAdmins(CHAT_EVENTS.messageUpdated, payload);
};

/* ------------------------------------------------------------------ public API */

/** Shared by `openWithCreator` and the offer module: the brand ↔ creator thread, created on first use. */
const ensureConversation = async (brandId: string, creatorId: string) => {
  // Threads created before support threads existed have no `kind` → match "not support", not "direct".
  const filter = { brandId, creatorId, kind: { $ne: "support" } };
  try {
    return (await Conversation.findOneAndUpdate(
      filter,
      { $setOnInsert: { brandId, creatorId, kind: "direct" } },
      { upsert: true, new: true },
    ).lean<ConversationDoc>())!;
  } catch (error: any) {
    // Two parallel upserts: the loser hits the unique index — the row now exists, just read it.
    if (error?.code !== DUPLICATE_KEY) throw error;
    return (await Conversation.findOne(filter).lean<ConversationDoc>())!;
  }
};

/** The user's "Influverse Support" thread, created on first use (one per user). */
const ensureSupportConversation = async (user: Viewer) => {
  const filter =
    user.role === USER_ROLE.brand
      ? { kind: "support", brandId: new Types.ObjectId(user.id), creatorId: null }
      : { kind: "support", brandId: null, creatorId: new Types.ObjectId(user.id) };
  try {
    return (await Conversation.findOneAndUpdate(filter, { $setOnInsert: { ...filter, supportUnread: 0 } }, { upsert: true, new: true }).lean<ConversationDoc>())!;
  } catch (error: any) {
    if (error?.code !== DUPLICATE_KEY) throw error;
    return (await Conversation.findOne(filter).lean<ConversationDoc>())!;
  }
};

/** GET /conversations/support - the viewer's support thread (created if missing), as an inbox row. */
const openSupport = async (viewer: Viewer) => toConversationView(viewer, await ensureSupportConversation(viewer), undefined);

/**
 * POST /conversations { creatorId } — brand opens (or reopens) the thread with a creator.
 * Idempotent: upsert on the unique (brandId, creatorId) pair.
 */
const openWithCreator = async (brand: Viewer, creatorId: string) => {
  if (!(await CreatorProfile.exists({ userId: creatorId, isSearchable: true }))) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Creator not found");
  }
  const conversation = await ensureConversation(brand.id, creatorId);
  const counterparts = await loadCounterparts(USER_ROLE.creator, [creatorId]);
  return toConversationView(brand, conversation, counterparts.get(creatorId));
};

/** GET /conversations — the viewer's inbox, newest activity first. Empty / deleted threads are hidden. */
const listForUser = async (viewer: Viewer, query: { cursor?: string; limit: number }) => {
  const cursor = decodeInboxCursor(query.cursor);
  const filter: Record<string, unknown> = {
    [ownField(viewer.role)]: viewer.id,
    lastMessageAt: { $ne: null },
    [hiddenField(viewer.role)]: { $ne: true },
  };
  if (cursor) {
    filter.$or = [{ lastMessageAt: { $lt: cursor.at } }, { lastMessageAt: cursor.at, _id: { $lt: cursor.id } }];
  }

  const rows = await Conversation.find(filter)
    .sort({ lastMessageAt: -1, _id: -1 })
    .limit(query.limit + 1) // one extra row tells us whether there is a next page
    .lean<ConversationDoc[]>();
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;

  const counterparts = await loadCounterparts(
    otherRole(viewer.role),
    page.filter((c) => !isSupport(c)).map((c) => String(c[otherField(viewer.role)])),
  );
  return {
    items: page.map((c) => toConversationView(viewer, c, counterparts.get(String(c[otherField(viewer.role)])))),
    meta: { limit: query.limit, nextCursor: hasMore ? encodeInboxCursor(page[page.length - 1]) : null },
  };
};

/** GET /conversations/:id — header data for one thread. */
const getForUser = async (viewer: Viewer, conversationId: string) => {
  const conversation = await findOwnConversation(viewer, conversationId);
  if (isSupport(conversation)) return toConversationView(viewer, conversation, undefined);
  const counterpartId = String(conversation[otherField(viewer.role)]);
  const counterparts = await loadCounterparts(otherRole(viewer.role), [counterpartId]);
  return toConversationView(viewer, conversation, counterparts.get(counterpartId));
};

/**
 * GET /conversations/:id/messages?before=<messageId> — newest first, older pages via `before`.
 * Skips messages this viewer hid, and everything before their "delete thread" time.
 */
const listMessages = async (viewer: Viewer, conversationId: string, query: { before?: string; limit: number }) => {
  const conversation = await findOwnConversation(viewer, conversationId);
  const clearedAt = conversation[clearedField(viewer.role)] as Date | null;

  const idRange: Record<string, unknown> = {};
  if (query.before) idRange.$lt = new Types.ObjectId(query.before);
  // ObjectIds start with the creation second → an index range instead of scanning the cleared history.
  if (clearedAt) idRange.$gte = Types.ObjectId.createFromTime(Math.floor(clearedAt.getTime() / 1000));

  const filter: Record<string, unknown> = { conversationId, hiddenFor: { $ne: new Types.ObjectId(viewer.id) } };
  if (Object.keys(idRange).length) filter._id = idRange;
  if (clearedAt) filter.createdAt = { $gt: clearedAt };

  const rows = await Message.find(filter).sort({ _id: -1 }).limit(query.limit + 1).lean();
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const offers = await loadOffersFor(page);
  return {
    items: page.map((m) => toMessageView(m, offers)),
    meta: { limit: query.limit, nextCursor: hasMore ? String(page[page.length - 1]._id) : null },
  };
};

/** POST /conversations/:id/messages { text?, attachmentIds?, clientMsgId } — text, files, or both. */
const sendMessage = async (
  viewer: Viewer & { name?: string },
  conversationId: string,
  body: { text?: string; attachmentIds?: string[]; clientMsgId?: string },
) => {
  const conversation = await findOwnConversation(viewer, conversationId);
  const support = isSupport(conversation);

  // Don't let messages pile up for a suspended / deleted account (cached in Redis, no extra Mongo hit).
  const recipientId = String(conversation[otherField(viewer.role)]);
  if (!support) {
    const recipientState = await SessionService.getAuthState("user", recipientId);
    if (!recipientState || !LOGIN_ALLOWED_STATUSES.includes(recipientState.status as any)) {
      throw new ApiError(StatusCodes.CONFLICT, "This account is no longer available");
    }
  }

  // Only the sender's own, fully uploaded chat files; attaching them lets the other participant download them.
  const attachments = body.attachmentIds?.length
    ? ((await UploadService.resolveOwnFiles({ type: "user", id: viewer.id }, body.attachmentIds, ["chat_attachment"], {
        kind: CHAT_FILE_KIND,
        id: conversationId,
      })) as AttachmentRef[])
    : [];

  const text = body.text ?? "";
  const result = await appendMessage({ conversation, actor: viewer, kind: "text", text, attachments, clientMsgId: body.clientMsgId });
  if (result.created) {
    const notifyText = text || attachmentsPreview(attachments);
    if (support) void notifySupportDesk(conversationId, await senderDisplayName(viewer), notifyText);
    else void notifyNewMessage(recipientId, otherRole(viewer.role), conversationId, await senderDisplayName(viewer), notifyText);
  }
  return result.message;
};

/** A user wrote to support -> admins with the tickets permission get one notification per thread per 15 min. */
const notifySupportDesk = async (conversationId: string, senderName: string, text: string) => {
  try {
    const firstInWindow = await getRedis().set(`support:notify:${conversationId}`, "1", "EX", CHAT_LIMITS.notifyThrottleSeconds, "NX");
    if (!firstInWindow) return;
    await NotificationService.notifyAdmins(
      {
        type: "ticket_user_reply",
        title: `Support message from ${senderName}`,
        body: preview(text),
        link: `/tickets?conv=${conversationId}`,
        data: { conversationId },
      },
      { permission: "tickets.manage" },
    );
  } catch (error: any) {
    errorLogger.error(`support notify failed for ${conversationId}: ${error.message}`);
  }
};

/** Name shown in the notification: brand company / creator profile name, else the account name. */
const senderDisplayName = async (viewer: Viewer & { name?: string }) => {
  const counterparts = await loadCounterparts(viewer.role, [viewer.id]);
  return counterparts.get(viewer.id)?.name || viewer.name || "Someone";
};

/**
 * DELETE /conversations/:id/messages/:messageId
 * - Own text message → deleted for everyone (placeholder stays, content + files removed).
 * - Anything else (the other side's message, a system notice, an offer card) → hidden for me only.
 */
const deleteMessage = async (viewer: Viewer, conversationId: string, messageId: string) => {
  const conversation = await findOwnConversation(viewer, conversationId);
  const message = await Message.findOne({ _id: messageId, conversationId }).select("senderId kind createdAt").lean();
  if (!message) throw new ApiError(StatusCodes.NOT_FOUND, "Message not found");

  const isOwnText = message.kind === "text" && String(message.senderId) === viewer.id;
  if (!isOwnText) {
    await Message.updateOne({ _id: messageId }, { $addToSet: { hiddenFor: new Types.ObjectId(viewer.id) } });
    socketEmit.toUser(viewer.id, CHAT_EVENTS.messageRemoved, { conversationId, messageId });
    return { messageId, scope: "me" as const };
  }

  const updated = await Message.findOneAndUpdate(
    { _id: messageId, isDeleted: { $ne: true } },
    { $set: { isDeleted: true, text: "" }, $unset: { attachments: 1 } },
    { new: true },
  ).lean();
  if (updated) {
    // If it was the latest message, the inbox preview must not keep showing the deleted text.
    await Conversation.updateOne(
      { _id: conversationId, "lastMessage.at": message.createdAt, "lastMessage.senderId": message.senderId },
      { $set: { "lastMessage.text": DELETED_MESSAGE_TEXT } },
    );
    const payload = { conversationId, message: toMessageView(updated) };
    for (const userId of userParticipants(conversation)) socketEmit.toUser(userId, CHAT_EVENTS.messageUpdated, payload);
    if (isSupport(conversation)) socketEmit.toAdmins(CHAT_EVENTS.messageUpdated, payload);
  }
  return { messageId, scope: "everyone" as const };
};

/**
 * DELETE /conversations/:id — "Delete thread" for the viewer only: history before now disappears for them
 * and the thread leaves their inbox until a new message arrives. The other side keeps everything.
 */
const clearConversation = async (viewer: Viewer, conversationId: string) => {
  const result = await Conversation.updateOne(
    { _id: conversationId, [ownField(viewer.role)]: viewer.id },
    { $set: { [clearedField(viewer.role)]: new Date(), [hiddenField(viewer.role)]: true, [unreadField(viewer.role)]: 0 } },
  );
  if (!result.matchedCount) throw notFound();
  socketEmit.toUser(viewer.id, CHAT_EVENTS.conversationRemoved, { conversationId });
  void pushUnreadTotal(viewer.id, viewer.role);
  return { conversationId };
};

/** POST /conversations/:id/read — clears the viewer's unread counter and tells the other side. */
const markRead = async (viewer: Viewer, conversationId: string) => {
  const readAt = new Date();
  const conversation = await Conversation.findOneAndUpdate(
    { _id: conversationId, [ownField(viewer.role)]: viewer.id },
    { $set: { [unreadField(viewer.role)]: 0, [lastReadField(viewer.role)]: readAt } },
    { new: true },
  ).lean<ConversationDoc>();
  if (!conversation) throw notFound();

  const readEvent = { conversationId, readerId: viewer.id, readAt };
  if (isSupport(conversation)) socketEmit.toAdmins(CHAT_EVENTS.conversationRead, readEvent);
  else socketEmit.toUser(String(conversation[otherField(viewer.role)]), CHAT_EVENTS.conversationRead, readEvent);
  void pushUnreadTotal(viewer.id, viewer.role);
  return { conversationId, readAt };
};

/**
 * GET /conversations/unread-count — total for the sidebar badge.
 * Only threads with unread > 0 are read (small set, uses the own-side index prefix), summed in Node.
 */
const unreadTotal = async (viewer: Viewer) => {
  const field = unreadField(viewer.role);
  const rows = await Conversation.find({ [ownField(viewer.role)]: viewer.id, [field]: { $gt: 0 } }).select(field).lean();
  return rows.reduce((sum, row: any) => sum + (row[field] ?? 0), 0);
};

export const ConversationService = {
  openWithCreator,
  ensureConversation,
  ensureSupportConversation,
  openSupport,
  listForUser,
  getForUser,
  listMessages,
  sendMessage,
  deleteMessage,
  clearConversation,
  markRead,
  unreadTotal,
  appendMessage,
  broadcastMessageUpdate,
  loadCounterparts,
  notifyNewMessage,
  senderDisplayName,
  // Support desk (support module)
  toMessageView,
  toSupportInboxView,
  supportUserOf,
  pushUnreadTotal,
  preview,
};
export type { ConversationDoc, Viewer as ChatViewer, Actor as ChatActor, Counterpart };
