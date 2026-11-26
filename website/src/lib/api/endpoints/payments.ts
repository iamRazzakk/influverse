import type { ApiClient } from '../types';
import type { ChatCounterpart } from './chat';
import type { OrderStatus } from './orders';

/**
 * Money pages + support (server: payment / payout / support modules).
 * - Brand "Payments": ledger of Stripe payments (no wallet — brands pay per offer).
 * - Creator "Payouts": released payouts (Stripe Connect) + orders still in escrow.
 * - Support: tickets on the user's orders and the user's "Influverse Support" chat thread.
 */

export interface BrandLedgerRow {
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
  stripeDocumentReady: boolean;
  method: string;
  invoiceNumber: string;
  refundedAt: string | null;
}

export interface BrandPayments {
  summary: { totalSpentCents: number; inEscrowCents: number; refundedCents: number };
  items: BrandLedgerRow[];
}

export interface PayoutAccount {
  connected: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export interface CreatorPayoutRow {
  id: string;
  orderId: string;
  orderCode: string;
  date: string | null;
  brandName: string;
  campaignTitle: string;
  amountCents: number;
  status: 'paid_out' | 'available' | 'in_escrow';
  payoutMethod: string;
  referenceCode: string;
}

export interface CreatorPayouts {
  summary: { totalEarnedCents: number; pendingEscrowCents: number; availableCents: number };
  account: PayoutAccount;
  items: CreatorPayoutRow[];
}

export interface SupportTicket {
  id: string;
  code: string;
  type: 'order_issue' | 'general';
  orderId: string | null;
  orderCode: string | null;
  reporterRole: 'brand' | 'creator';
  category: string;
  reason: string;
  status: 'open' | 'in_progress' | 'resolved';
  resolution: { action: 'resume' | 'release' | 'refund'; note: string | null; by: 'brand' | 'creator' | 'admin'; at: string } | null;
  createdAt: string;
  order: { title: string; brief: string; status: OrderStatus; totalCents: number; priceCents: number } | null;
  brand: ChatCounterpart | null;
  creator: ChatCounterpart | null;
}

export const paymentsEndpoints = (c: ApiClient) => ({
  brandPayments: () => c.get<BrandPayments>('/payments/me'),
  stripePaymentDocument: (paymentId: string) => c.get<{ url: string; type: 'invoice' | 'receipt' }>(`/payments/${paymentId}/stripe-document`),
  creatorPayouts: () => c.get<CreatorPayouts>('/payouts/me'),
  /** Stripe Connect onboarding → redirect the browser to `url`. */
  startPayoutSetup: () => c.post<{ url: string }>('/payouts/connect'),
  /** Stripe Express dashboard (bank account, payout schedule). */
  openPayoutDashboard: () => c.post<{ url: string }>('/payouts/dashboard'),
  supportTickets: (params: { status?: 'open' | 'resolved'; page?: number } = {}) =>
    c.getPage<SupportTicket>('/support/tickets', { params: { page: 1, limit: 50, ...params } }),
});
