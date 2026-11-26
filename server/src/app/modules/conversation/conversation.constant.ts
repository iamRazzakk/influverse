/**
 * - `text`   — a normal chat message (may carry file attachments).
 * - `offer`  — a custom offer card; `offerId` points to the offer.
 * - `system` — written by the server (e.g. "Offer accepted"), never by a user.
 */
export const MESSAGE_KINDS = ["text", "offer", "system"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/** What a `system` notice is about — the website styles each one differently. */
export const SYSTEM_MESSAGE_TYPES = [
  "offer_sent",
  "offer_accepted",
  "offer_declined",
  "offer_withdrawn",
  "offer_expired",
  // Support threads: a ticket was opened / resolved for an order.
  "ticket_opened",
  "ticket_resolved",
] as const;
export type SystemMessageType = (typeof SYSTEM_MESSAGE_TYPES)[number];

export const CHAT_LIMITS = {
  maxTextLength: 4000,
  maxAttachments: 10,
  /** Inbox preview is cut to this many characters. */
  previewLength: 140,
  messagesPageSize: 30,
  conversationsPageSize: 20,
  /** At most one "new message" notification / email per conversation per recipient in this window. */
  notifyThrottleSeconds: 15 * 60,
} as const;

export const DELETED_MESSAGE_TEXT = "This message was deleted";

/** `attachedTo.kind` for chat files — the upload module asks us who may download them. */
export const CHAT_FILE_KIND = "conversation";

/** Socket events sent to the `user:<id>` room of each participant. */
export const CHAT_EVENTS = {
  messageNew: "message:new",
  /** A message changed for everyone (deleted by its sender, offer status changed …). */
  messageUpdated: "message:updated",
  /** A message disappeared for this user only (hidden / thread cleared in another tab). */
  messageRemoved: "message:removed",
  conversationRead: "conversation:read",
  conversationRemoved: "conversation:removed",
  unreadTotal: "chat:unread",
} as const;

/** Socket events sent to the `admins` room for the support desk (dashboard). */
export const SUPPORT_EVENTS = {
  /** `{ conversationId, message, conversation }` — any new message in a support thread. */
  messageNew: "support:message",
  /** `{ conversationId }` — an admin read the thread (other admins' badges update). */
  conversationRead: "support:read",
  /** `{ ticket }` — a ticket was opened / changed. */
  ticketUpdated: "support:ticket",
} as const;

/** Display card for the "Influverse Support" side of a support thread (shown as the counterpart). */
export const SUPPORT_COUNTERPART = {
  id: "support",
  role: "support",
  name: "Influverse Trust & Support",
  avatar: null,
  handle: null,
  verified: true,
  available: true,
} as const;
