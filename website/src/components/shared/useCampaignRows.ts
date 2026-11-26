import { useMemo } from 'react';
import type { ApiClient, Paginated } from '@/lib/api/types';
import { offersEndpoints, type Offer } from '@/lib/api/endpoints/offers';
import { ordersEndpoints, type Order } from '@/lib/api/endpoints/orders';
import type { ChatCounterpart } from '@/lib/api/endpoints/chat';

/**
 * The Campaigns pages list pending offers ("Pending" tab, like the original `offer_sent` orders)
 * and real orders together. This merges both into one row shape, newest first.
 *
 * Data flow: the server page calls `loadCampaignSources(serverApi(), viewer)` and passes the result
 * to its client view, which calls `useCampaignRows(viewer, sources)`. This module has no
 * 'use client' so the loader can run on the server (it only needs an ApiClient).
 */

/** The four lists the rows are built from. `null` = that request failed. */
export interface CampaignSources {
  received: Paginated<Offer> | null;
  sent: Paginated<Offer> | null;
  /** Brand only: own offers whose Stripe deposit wasn't finished (always null for creators). */
  unpaid: Paginated<Offer> | null;
  orders: Paginated<Order> | null;
}

/** Loads every list in parallel. Pass `serverApi()` from a Server Component. */
export const loadCampaignSources = async (api: ApiClient, viewer: 'brand' | 'creator'): Promise<CampaignSources> => {
  const offers = offersEndpoints(api);
  const [received, sent, unpaid, orders] = await Promise.all([
    offers.list({ box: 'received', status: 'pending', limit: 100 }).catch(() => null),
    offers.list({ box: 'sent', status: 'pending', limit: 100 }).catch(() => null),
    viewer === 'brand' ? offers.list({ box: 'sent', status: 'awaiting_payment', limit: 50 }).catch(() => null) : null,
    ordersEndpoints(api).list({ limit: 100 }).catch(() => null),
  ]);
  return { received, sent, unpaid, orders };
};

export type CampaignTab = 'all' | 'pending' | 'active' | 'review' | 'disputed' | 'completed';

export type CampaignStatus =
  /** Brand's own offer whose escrow deposit wasn't completed on Stripe. */
  | 'offer_unpaid'
  | 'offer_pending'
  | 'awaiting_payment'
  | 'in_production'
  | 'deliverable_submitted'
  | 'approved'
  | 'completed'
  | 'cancelled'
  | 'disputed';

export interface CampaignRow {
  key: string;
  kind: 'offer' | 'order';
  id: string;
  conversationId: string;
  counterpart: ChatCounterpart | null;
  title: string;
  platformLabel: string;
  /** Creator payout. */
  priceCents: number;
  /** Brand total (payout + fee). */
  totalCents: number;
  dueLabel: string;
  status: CampaignStatus;
  /** Pending offer that the viewer must answer (creator: brand offers; brand: creator custom offers). */
  awaitingMyAnswer: boolean;
  createdAt: string;
}

const PLATFORM_LABEL: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', ugc: 'UGC' };
const platformLabel = (platforms: string[]) =>
  platforms.length >= 4 ? 'All platforms' : platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(' · ');

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const tabOf = (status: CampaignStatus): CampaignTab => {
  if (status === 'offer_pending' || status === 'offer_unpaid' || status === 'awaiting_payment') return 'pending';
  if (status === 'in_production') return 'active';
  if (status === 'deliverable_submitted') return 'review';
  if (status === 'disputed') return 'disputed';
  if (status === 'approved' || status === 'completed') return 'completed';
  return 'all';
};

/** Client side: server-loaded sources → rows. Re-runs after router.refresh() brings new props. */
export function useCampaignRows(viewer: 'brand' | 'creator', sources: CampaignSources) {
  const { received, sent, unpaid, orders } = sources;

  const rows = useMemo<CampaignRow[]>(() => {
    const fromOffer = (offer: Offer, awaitingMyAnswer: boolean, status: CampaignStatus = 'offer_pending'): CampaignRow => ({
      key: `offer-${offer.id}`,
      kind: 'offer',
      id: offer.id,
      conversationId: offer.conversationId,
      counterpart: offer.counterpart ?? null,
      title: offer.title,
      platformLabel: platformLabel(offer.platforms),
      priceCents: offer.priceCents,
      totalCents: offer.totalCents,
      dueLabel: `${offer.deliveryDays}-day delivery`,
      status,
      awaitingMyAnswer,
      createdAt: offer.createdAt,
    });
    const fromOrder = (order: Order): CampaignRow => ({
      key: `order-${order.id}`,
      kind: 'order',
      id: order.id,
      conversationId: order.conversationId,
      counterpart: order.counterpart,
      title: order.title,
      platformLabel: platformLabel(order.platforms),
      priceCents: order.priceCents,
      totalCents: order.totalCents,
      // The deadline starts when the escrow is paid.
      dueLabel: order.dueAt ? `Due ${formatDate(order.dueAt)}` : `${order.deliveryDays}-day delivery after payment`,
      status: order.status,
      awaitingMyAnswer: false,
      createdAt: order.createdAt,
    });

    return [
      ...(received?.items ?? []).map((o) => fromOffer(o, true)),
      ...(sent?.items ?? []).map((o) => fromOffer(o, false)),
      ...(viewer === 'brand' ? unpaid?.items ?? [] : []).map((o) => fromOffer(o, false, 'offer_unpaid')),
      ...(orders?.items ?? []).filter((o) => o.status !== 'cancelled').map(fromOrder),
    ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [received, sent, unpaid, orders, viewer]);

  return {
    rows,
    // Initial data comes from the server, so there is no loading phase any more.
    isLoading: false,
    isError: !received || !sent || !orders,
    viewer,
  };
}
