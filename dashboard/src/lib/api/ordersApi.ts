import { baseApi, type ApiEnvelope } from './baseApi';
import { cleanQueryParams, unwrapListWithStats } from './listWithStats';
import type { ListWithStats, MarketplaceParty } from '@/types/marketplace.types';

/** Order lifecycle states (server/src/app/modules/order/order.constant.ts). */
export const ADMIN_ORDER_STATUSES = [
  'awaiting_payment',
  'in_production',
  'deliverable_submitted',
  'approved',
  'completed',
  'cancelled',
  'disputed',
] as const;
export type AdminOrderStatus = (typeof ADMIN_ORDER_STATUSES)[number];

export interface AdminOrder {
  id: string;
  code: string;
  title: string;
  brief?: string;
  requirements?: string[];
  status: AdminOrderStatus;
  /** What the creator earns (before the platform fee is added for the brand) */
  priceCents: number;
  feeCents: number;
  /** What the brand paid = price + fee */
  totalCents: number;
  platformFeePercent: number;
  platforms: string[];
  deliveryDays: number;
  paidAt: string | null;
  dueAt: string | null;
  deliveredAt: string | null;
  reviewDueAt: string | null;
  approvedAt: string | null;
  autoApproved: boolean;
  completedAt: string | null;
  cancelledAt: string | null;
  revisionCount: number;
  deliverablesCount: number;
  review: { rating: number; comment: string; createdAt: string } | null;
  escrowReleased: boolean;
  createdAt: string;
  brand: MarketplaceParty | null;
  creator: MarketplaceParty | null;
}

/** Count of orders in each status (all orders, not just the current page). */
export type OrderStatusCounts = Record<AdminOrderStatus, number>;

export interface OrderListParams {
  status?: AdminOrderStatus;
  /** Exact order code, e.g. ORD-10001 */
  q?: string;
  page?: number;
  limit?: number;
}

const EMPTY_ORDER_STATS = Object.fromEntries(ADMIN_ORDER_STATUSES.map((s) => [s, 0])) as OrderStatusCounts;

/** `/admin/orders` — read-only view of every marketplace order. */
export const ordersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAdminOrders: build.query<ListWithStats<AdminOrder, OrderStatusCounts>, OrderListParams>({
      query: (params) => ({ url: '/admin/orders', params: cleanQueryParams(params) }),
      transformResponse: (r: ApiEnvelope<{ items: AdminOrder[]; stats: OrderStatusCounts }>) =>
        unwrapListWithStats(r, EMPTY_ORDER_STATS),
      providesTags: ['Orders'],
    }),
  }),
});

export const { useGetAdminOrdersQuery } = ordersApi;
