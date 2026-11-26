import type { ApiClient } from '../types';
import type { Offer } from './offers';

export type ChatRole = 'brand' | 'creator';

export interface ChatCounterpart {
  id: string;
  /** `support` = the "Influverse Support" side of a support thread. */
  role: ChatRole | 'support';
  name: string;
  avatar: string | null;
  /** Creator handle or brand slug — for the profile link in the chat header. */
  handle: string | null;
  verified: boolean;
  available: boolean;
}

export type ChatMessageKind = 'text' | 'offer' | 'system';
export type ChatSystemType =
  | 'offer_sent'
  | 'offer_accepted'
  | 'offer_declined'
  | 'offer_withdrawn'
  | 'offer_expired'
  | 'ticket_opened'
  | 'ticket_resolved';

export interface ChatAttachment {
  /** File id. Private file → ask `GET /files/:id/url` for a signed link (see useGetFileUrlQuery). */
  id: string;
  url: string;
  name: string;
  mime: string;
  size: number;
  /** Client-only: local preview (object URL) while the message is still sending. */
  localUrl?: string;
}

export interface ChatLastMessage {
  text: string;
  kind: ChatMessageKind;
  senderId: string | null;
  at: string;
}

export interface Conversation {
  id: string;
  /** `support` = the user's thread with Influverse Support (admins reply from the dashboard). */
  kind: 'direct' | 'support';
  counterpart: ChatCounterpart | null;
  lastMessage: ChatLastMessage | null;
  lastMessageAt: string | null;
  unread: number;
  counterpartLastReadAt: string | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: ChatMessageKind;
  text: string;
  attachments: ChatAttachment[];
  offerId: string | null;
  /** Embedded for offer cards and offer notices, with its live status. */
  offer: Offer | null;
  systemType: ChatSystemType | null;
  systemPayload: Record<string, unknown> | null;
  /** Deleted by its sender — shown as "This message was deleted". */
  isDeleted: boolean;
  clientMsgId: string | null;
  createdAt: string;
  /** Client-only: optimistic row waiting for the server, or a send that failed. */
  localStatus?: 'sending' | 'failed';
}

/** One cursor page from the server. */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export const newClientMsgId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

// ---------------------------------------------------------------------------
// Pure list helpers (newest first). Used by the chat UI's local state + socket events.
// ---------------------------------------------------------------------------

/** Drops duplicates by id (socket + fetch races), keeping the first (newest) copy. */
export const dedupeById = <T extends { id: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
};

/**
 * Puts a saved message into a thread list, replacing its optimistic copy (same clientMsgId) or a copy
 * that already arrived over the socket. New messages go to the top. Returns a new array.
 */
export const upsertMessage = (list: ChatMessage[], message: ChatMessage): ChatMessage[] => {
  let replaced = false;
  const next: ChatMessage[] = [];
  for (const row of list) {
    const same = row.id === message.id || (message.clientMsgId && row.clientMsgId === message.clientMsgId);
    if (!same) next.push(row);
    else if (!replaced) {
      next.push(message);
      replaced = true;
    } // second copy → dropped
  }
  return replaced ? next : [message, ...next];
};

/** Moves a conversation to the top of the inbox with the given changes (newest activity first). */
export const bumpConversation = (list: Conversation[], id: string, changes: Partial<Conversation>): { list: Conversation[]; found: boolean } => {
  const index = list.findIndex((c) => c.id === id);
  if (index < 0) return { list, found: false };
  const row = { ...list[index], ...changes };
  return { list: [row, ...list.slice(0, index), ...list.slice(index + 1)], found: true };
};

/** Brand ↔ creator chat. Messages are SENT over REST and RECEIVED over the socket (`message:new`). */
export const chatEndpoints = (c: ApiClient) => ({
  /** Inbox, newest activity first. Pass the previous page's `nextCursor` for more. */
  conversations: async (cursor?: string | null, signal?: AbortSignal): Promise<CursorPage<Conversation>> => {
    const page = await c.getPage<Conversation>('/conversations', { params: { limit: 30, cursor: cursor ?? undefined }, signal });
    return { items: page.items, nextCursor: (page.meta.nextCursor as string | null | undefined) ?? null };
  },
  /** The viewer's "Influverse Support" thread — created on first use, always shown in the inbox. */
  supportConversation: () => c.get<Conversation>('/conversations/support'),
  conversation: (id: string, signal?: AbortSignal) => c.get<Conversation>(`/conversations/${id}`, { signal }),
  /** One thread, newest first; pass the previous page's `nextCursor` as `before` for OLDER messages. */
  messages: async (conversationId: string, before?: string | null, signal?: AbortSignal): Promise<CursorPage<ChatMessage>> => {
    const page = await c.getPage<ChatMessage>(`/conversations/${conversationId}/messages`, {
      params: { limit: 30, before: before ?? undefined },
      signal,
    });
    return { items: page.items, nextCursor: (page.meta.nextCursor as string | null | undefined) ?? null };
  },
  /** Brand opens (or reopens) the thread with a creator. Idempotent on the server. */
  open: (creatorId: string) => c.post<Conversation>('/conversations', { creatorId }),
  /** Retry-safe: resending with the same `clientMsgId` can't duplicate the message. */
  send: (conversationId: string, body: { text: string; clientMsgId: string; attachmentIds?: string[] }) =>
    c.post<ChatMessage>(`/conversations/${conversationId}/messages`, body),
  markRead: (id: string) => c.post<{ conversationId: string; readAt: string }>(`/conversations/${id}/read`),
  /** Own message → deleted for everyone (placeholder); someone else's → hidden for me. */
  deleteMessage: (conversationId: string, messageId: string) =>
    c.delete<{ messageId: string; scope: 'me' | 'everyone' }>(`/conversations/${conversationId}/messages/${messageId}`),
  /** "Delete thread" — clears the history for me only; the other side keeps it. */
  clear: (id: string) => c.delete<{ conversationId: string }>(`/conversations/${id}`),
  /** Sidebar badge; kept live by the `chat:unread` socket event. */
  unread: () => c.get<{ total: number }>('/conversations/unread-count'),
});
