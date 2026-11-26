import type { ApiClient } from '../types';
import type { ChatCounterpart } from './chat';
import type { OfferDirection, OfferPlatform } from './offers';

/**
 * Orders (campaigns). Server: server/src/app/modules/order. Created when an offer is accepted;
 * they wait in `awaiting_payment` until the escrow payment (Phase C) moves them to `in_production`.
 */

export type OrderStatus =
  | 'awaiting_payment'
  | 'in_production'
  | 'deliverable_submitted'
  | 'approved'
  | 'completed'
  | 'cancelled'
  | 'disputed';

export interface OrderDeliverableFile {
  id: string;
  /** Private: `/files/:id/url` → ask the server for a signed URL (useGetFileUrlQuery). */
  url: string;
  name: string;
  mime: string;
  size: number;
}

export interface OrderDeliverable {
  id: string;
  title: string;
  notes: string | null;
  files: OrderDeliverableFile[];
  links: { title: string; url: string }[];
  submittedAt: string;
}

export interface OrderReview {
  rating: number;
  comment: string;
  createdAt: string;
}

/** Support ticket holding the order (server: support module). */
export interface OrderIssue {
  id: string;
  code: string;
  category: string;
  reason: string;
  reporterRole: 'brand' | 'creator';
  status: 'open' | 'in_progress' | 'resolved';
  createdAt: string;
  /** The viewer's own "Influverse Support" chat thread. */
  supportConversationId: string | null;
}

export interface OrderPayoutState {
  code: string;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  amountCents: number;
  paidAt: string | null;
}

export interface Order {
  id: string;
  code: string;
  offerId: string;
  offerDirection: OfferDirection;
  conversationId: string;
  brandId: string;
  creatorId: string;
  packageId: string | null;
  title: string;
  brief: string;
  requirements: string[];
  platforms: OfferPlatform[];
  deliveryDays: number;
  /** Creator payout. */
  priceCents: number;
  platformFeePercent: number;
  feeCents: number;
  /** What the brand pays into escrow. */
  totalCents: number;
  status: OrderStatus;
  paidAt: string | null;
  dueAt: string | null;
  deliverables: OrderDeliverable[];
  revisionCount: number;
  deliveredAt: string | null;
  /** Brand must review before this, otherwise the order auto-approves. */
  reviewDueAt: string | null;
  approvedAt: string | null;
  autoApproved: boolean;
  completedAt: string | null;
  cancelledAt: string | null;
  /** Approved / completed → the escrow is released to the creator. */
  escrowReleased: boolean;
  review: OrderReview | null;
  createdAt: string;
  counterpart: ChatCounterpart | null;
  /** Detail only: open support ticket. */
  issue?: OrderIssue | null;
  /** Detail only: creator payout once approved. */
  payout?: OrderPayoutState | null;
}

/** GET /orders/stats — workspace dashboard numbers (brand: spend, creator: earnings). */
export interface OrderStats {
  summary: { activeCount: number; lifetimeCents: number; inEscrowCents: number; completedCount: number };
  year: number;
  /** Years with data, newest first (always includes this year). */
  years: number[];
  yearTotalCents: number;
  yearCounterpartsCount: number;
  /** 12 rows, month 1–12: money + distinct creators (brand) / brands (creator) and their names. */
  months: { month: number; amountCents: number; count: number; names: string[] }[];
}

/** `/orders` — brand and creator see their own orders. */
export const ordersEndpoints = (c: ApiClient) => ({
  list: (params: { status?: OrderStatus; page?: number; limit?: number } = {}) =>
    c.getPage<Order>('/orders', { params: { page: 1, limit: 50, ...params } }),
  stats: (year?: number) => c.get<OrderStats>('/orders/stats', { params: year ? { year } : {} }),
  get: (id: string) => c.get<Order>(`/orders/${id}`),
  /** Creator: files (uploaded with context `deliverable`) and / or cloud links → brand review. */
  submitDeliverable: ({ id, ...body }: { id: string; title: string; notes?: string; fileIds: string[]; links: string[] }) =>
    c.post<Order>(`/orders/${id}/deliverables`, body),
  requestRevision: (id: string, notes: string) => c.post<Order>(`/orders/${id}/revision`, { notes }),
  approve: (id: string) => c.post<Order>(`/orders/${id}/approve`),
  review: ({ id, ...body }: { id: string; rating: number; comment: string }) => c.post<Order>(`/orders/${id}/review`, body),
  /** Opens a support ticket and puts the order on hold. */
  reportIssue: ({ id, ...body }: { id: string; category: string; reason: string }) =>
    c.post<Order>(`/orders/${id}/report-issue`, body),
  /** Brand / creator: "Mark resolved" → the order continues. */
  resolveTicket: (ticketId: string) => c.post<unknown>(`/support/tickets/${ticketId}/resolve`),
  /** Brand funds the escrow of an `awaiting_payment` order → Stripe Checkout URL. */
  pay: (id: string) => c.post<{ checkoutUrl: string }>(`/orders/${id}/pay`),
});
