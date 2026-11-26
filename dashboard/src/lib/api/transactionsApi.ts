import { baseApi, type ApiEnvelope } from './baseApi';
import { cleanQueryParams, unwrapListWithStats } from './listWithStats';
import type { ListWithStats, MarketplaceParty } from '@/types/marketplace.types';

/** Platform-wide money totals (all payments / payouts, not just the current page). */
export interface TransactionStats {
  /** Captured brand payments */
  collectedCents: number;
  platformFeesCents: number;
  refundedCents: number;
  /** Card holds that are authorized but not captured yet */
  heldCents: number;
  paidOutCents: number;
  /** Payouts not paid yet (pending, processing or failed) */
  payoutsPendingCents: number;
}

/** One brand payment (a row of the brand-side ledger plus admin-only fields). */
export interface AdminPaymentRow {
  /** Display reference, e.g. TXN-ABC123 (not searchable — search uses `paymentId`) */
  id: string;
  paymentId: string;
  orderId: string | null;
  orderCode: string | null;
  date: string;
  creatorName: string;
  campaignTitle: string;
  amountCents: number;
  payoutCents: number;
  feeCents: number;
  status: 'in_escrow' | 'released' | 'refunded';
  method: string;
  invoiceNumber: string;
  refundedAt: string | null;
  brand: MarketplaceParty | null;
  creator: MarketplaceParty | null;
  purpose: 'offer_hold' | 'custom_offer_accept' | 'order';
  paymentStatus: 'authorized' | 'captured' | 'refunded';
  paymentIntentId: string | null;
}

/** One transfer of escrow to a creator's Stripe account. */
export interface AdminPayoutRow {
  id: string;
  code: string;
  orderId: string;
  orderCode: string;
  title: string;
  creator: MarketplaceParty | null;
  amountCents: number;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  attempts: number;
  stripeTransferId: string | null;
  failureMessage: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface TransactionListParams {
  /** payments: 24-hex payment id. payouts: payout code (PAY-…) or order code (ORD-…). */
  q?: string;
  page?: number;
  limit?: number;
}

const EMPTY_TRANSACTION_STATS: TransactionStats = {
  collectedCents: 0,
  platformFeesCents: 0,
  refundedCents: 0,
  heldCents: 0,
  paidOutCents: 0,
  payoutsPendingCents: 0,
};

/** `/admin/transactions?tab=payments|payouts` — one endpoint, two row shapes, so two typed queries. */
export const transactionsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAdminPayments: build.query<ListWithStats<AdminPaymentRow, TransactionStats>, TransactionListParams>({
      query: (params) => ({ url: '/admin/transactions', params: cleanQueryParams({ ...params, tab: 'payments' }) }),
      transformResponse: (r: ApiEnvelope<{ items: AdminPaymentRow[]; stats: TransactionStats }>) =>
        unwrapListWithStats(r, EMPTY_TRANSACTION_STATS),
      providesTags: ['Transactions'],
    }),
    getAdminPayouts: build.query<ListWithStats<AdminPayoutRow, TransactionStats>, TransactionListParams>({
      query: (params) => ({ url: '/admin/transactions', params: cleanQueryParams({ ...params, tab: 'payouts' }) }),
      transformResponse: (r: ApiEnvelope<{ items: AdminPayoutRow[]; stats: TransactionStats }>) =>
        unwrapListWithStats(r, EMPTY_TRANSACTION_STATS),
      providesTags: ['Transactions'],
    }),
    retryAdminPayout: build.mutation<{ status: AdminPayoutRow['status']; attempts: number; failureMessage?: string }, string>({
      query: (payoutId) => ({ url: `/admin/transactions/payouts/${payoutId}/retry`, method: 'POST' }),
      transformResponse: (r: ApiEnvelope<{ status: AdminPayoutRow['status']; attempts: number; failureMessage?: string }>) => r.data,
      invalidatesTags: ['Transactions'],
    }),
  }),
});

export const { useGetAdminPaymentsQuery, useGetAdminPayoutsQuery, useRetryAdminPayoutMutation } = transactionsApi;
