import { baseApi, unwrap, type ApiEnvelope } from './baseApi';
import { cleanQueryParams, unwrapListWithStats } from './listWithStats';
import type { ListWithStats, MarketplaceParty } from '@/types/marketplace.types';
import type { AdminOrderStatus } from './ordersApi';

/* ------------------------------------------------------------------ tickets */

export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved';
/** resume = order continues, release = creator paid, refund = brand refunded + order cancelled */
export type TicketResolutionAction = 'resume' | 'release' | 'refund';

export interface SupportTicketView {
  id: string;
  code: string;
  type: 'order_issue' | 'general';
  orderId: string | null;
  orderCode: string | null;
  brandId: string | null;
  creatorId: string | null;
  reporterId: string;
  reporterRole: 'brand' | 'creator';
  category: string;
  reason: string;
  status: SupportTicketStatus;
  resolution: {
    action: TicketResolutionAction;
    note: string | null;
    by: 'brand' | 'creator' | 'admin';
    at: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

/** List rows also carry both parties. */
export interface AdminTicketRow extends SupportTicketView {
  brand: MarketplaceParty | null;
  creator: MarketplaceParty | null;
}

/** Full ticket: the order it holds and each party's support thread (to open the chat from the ticket). */
export interface AdminTicketDetail extends AdminTicketRow {
  brandConversationId: string | null;
  creatorConversationId: string | null;
  order: {
    id: string;
    code: string;
    title: string;
    status: AdminOrderStatus;
    priceCents: number;
    feeCents: number;
    totalCents: number;
    deliverablesCount: number;
    paidAt: string | null;
    dueAt: string | null;
  } | null;
}

export interface TicketStats {
  open: number;
  inProgress: number;
  resolved: number;
}

export interface TicketListParams {
  status?: SupportTicketStatus;
  /** Ticket code (TKT-…) or order code (ORD-…) */
  q?: string;
  page?: number;
  limit?: number;
}

/* ------------------------------------------------------------------ support chat */

/** One row of the support inbox (each user has exactly one support thread). */
export interface SupportConversation {
  id: string;
  kind: 'support';
  user: MarketplaceParty;
  lastMessage: { text: string; kind: string; senderId: string | null; at: string } | null;
  lastMessageAt: string | null;
  /** Messages from the user that no admin has read yet (shared by all admins) */
  unread: number;
  /** When the user last read the thread — drives "Seen" under admin replies */
  userLastReadAt: string | null;
  createdAt: string;
}

export interface SupportAttachment {
  id: string;
  /** Private files come as `/files/<id>/url`; ask `/admin/files/<id>/url` for a signed link. */
  url: string;
  name: string;
  mime: string;
  size: number;
}

export interface SupportMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: 'text' | 'offer' | 'system';
  text: string;
  attachments: SupportAttachment[];
  systemType: string | null;
  systemPayload: Record<string, unknown> | null;
  isDeleted: boolean;
  clientMsgId?: string | null;
  createdAt: string;
}

export interface SupportThreadPage {
  conversation: SupportConversation;
  /** The user's tickets that are still open / in progress (chips above the chat) */
  openTickets: SupportTicketView[];
  /** Newest first */
  items: SupportMessage[];
  /** Pass as `before` to load older messages; null when the start of the thread is reached */
  nextCursor: string | null;
}

export interface SupportInboxPage {
  items: SupportConversation[];
  nextCursor: string | null;
}

/** `/admin/support` — the support desk: tickets raised on orders and the "Influverse Support" chat. */
export const supportApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSupportTickets: build.query<ListWithStats<AdminTicketRow, TicketStats>, TicketListParams>({
      query: (params) => ({ url: '/admin/support/tickets', params: cleanQueryParams(params) }),
      transformResponse: (r: ApiEnvelope<{ items: AdminTicketRow[]; stats: TicketStats }>) =>
        unwrapListWithStats(r, { open: 0, inProgress: 0, resolved: 0 }),
      providesTags: ['Tickets'],
    }),

    getSupportTicket: build.query<AdminTicketDetail, string>({
      query: (id) => `/admin/support/tickets/${id}`,
      transformResponse: (r: ApiEnvelope<AdminTicketDetail>) => unwrap(r),
      providesTags: (_result, _error, id) => [{ type: 'Tickets', id }],
    }),

    // Resolving moves money / order state and posts a notice in both parties' support threads,
    // so orders, transactions and the chat views are refreshed too.
    resolveSupportTicket: build.mutation<SupportTicketView, { id: string; action: TicketResolutionAction; note?: string }>({
      query: ({ id, ...body }) => ({ url: `/admin/support/tickets/${id}/resolve`, method: 'POST', body }),
      transformResponse: (r: ApiEnvelope<SupportTicketView>) => unwrap(r),
      invalidatesTags: ['Tickets', 'Orders', 'Transactions', 'SupportInbox', 'SupportThread'],
    }),

    getSupportConversations: build.query<SupportInboxPage, { cursor?: string; unread?: boolean; limit?: number }>({
      query: (params) => ({ url: '/admin/support/conversations', params: cleanQueryParams(params) }),
      transformResponse: (r: ApiEnvelope<SupportConversation[]>) => ({
        items: r.data ?? [],
        nextCursor: (r.meta?.nextCursor as string | null | undefined) ?? null,
      }),
      providesTags: ['SupportInbox'],
    }),

    getSupportUnreadCount: build.query<number, void>({
      query: () => '/admin/support/conversations/unread-count',
      transformResponse: (r: ApiEnvelope<{ total: number }>) => unwrap(r).total ?? 0,
      providesTags: ['SupportInbox'],
    }),

    getSupportMessages: build.query<SupportThreadPage, { conversationId: string; before?: string; limit?: number }>({
      query: ({ conversationId, ...params }) => ({
        url: `/admin/support/conversations/${conversationId}/messages`,
        params: cleanQueryParams(params),
      }),
      transformResponse: (r: ApiEnvelope<Omit<SupportThreadPage, 'nextCursor'>>) => ({
        conversation: r.data.conversation,
        openTickets: r.data.openTickets ?? [],
        items: r.data.items ?? [],
        nextCursor: (r.meta?.nextCursor as string | null | undefined) ?? null,
      }),
      providesTags: (_result, _error, { conversationId }) => [{ type: 'SupportThread', id: conversationId }],
    }),

    sendSupportMessage: build.mutation<
      SupportMessage,
      { conversationId: string; text?: string; attachmentIds?: string[]; clientMsgId?: string }
    >({
      query: ({ conversationId, ...body }) => ({
        url: `/admin/support/conversations/${conversationId}/messages`,
        method: 'POST',
        body,
      }),
      transformResponse: (r: ApiEnvelope<SupportMessage>) => unwrap(r),
      // A reply moves the user's open tickets to "in progress" — refresh the ticket list as well.
      invalidatesTags: (_result, _error, { conversationId }) => [
        { type: 'SupportThread', id: conversationId },
        'SupportInbox',
        'Tickets',
      ],
    }),

    markSupportConversationRead: build.mutation<{ conversationId: string; readAt: string }, string>({
      query: (conversationId) => ({ url: `/admin/support/conversations/${conversationId}/read`, method: 'POST' }),
      transformResponse: (r: ApiEnvelope<{ conversationId: string; readAt: string }>) => unwrap(r),
      invalidatesTags: ['SupportInbox'],
    }),
  }),
});

export const {
  useGetSupportTicketsQuery,
  useGetSupportTicketQuery,
  useResolveSupportTicketMutation,
  useGetSupportConversationsQuery,
  useGetSupportUnreadCountQuery,
  useGetSupportMessagesQuery,
  useLazyGetSupportMessagesQuery,
  useSendSupportMessageMutation,
  useMarkSupportConversationReadMutation,
} = supportApi;
