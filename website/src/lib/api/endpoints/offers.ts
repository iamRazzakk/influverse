import type { ApiClient } from '../types';
import type { ChatCounterpart, ChatMessage } from './chat';

/**
 * Offers. Server: server/src/app/modules/offer. Money is integer cents.
 *
 * Two directions (the website's original flows):
 * - brand → creator: OfferModal (creator profile / package cards) or /brand/hire/new. The creator answers on /creator/offers.
 * - creator → brand: the "Offer" button in the creator's chat. The brand answers on the offer card in chat.
 */

export type OfferDirection = 'brand_to_creator' | 'creator_to_brand';
/** `awaiting_payment` = brand offer whose card hold isn't done yet (only the brand sees it). */
export type OfferStatus = 'awaiting_payment' | 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired';
export type OfferPlatform = 'instagram' | 'tiktok' | 'youtube' | 'ugc';

export interface Offer {
  id: string;
  code: string;
  direction: OfferDirection;
  conversationId: string;
  brandId: string;
  creatorId: string;
  packageId: string | null;
  packageTitle: string | null;
  title: string;
  brief: string;
  deliverables: string[];
  platforms: OfferPlatform[];
  /** Creator payout. */
  priceCents: number;
  platformFeePercent: number;
  feeCents: number;
  /** What the brand pays (payout + fee). */
  totalCents: number;
  deliveryDays: number;
  status: OfferStatus;
  expiresAt: string;
  respondedAt: string | null;
  orderId: string | null;
  createdAt: string;
  /** Only in lists: the other party. */
  counterpart?: ChatCounterpart | null;
}

export interface BrandOfferInput {
  creatorId: string;
  packageId?: string;
  title: string;
  brief: string;
  deliverables: string[];
  platforms: OfferPlatform[];
  priceCents: number;
  deliveryDays: number;
}

export interface CustomOfferInput {
  conversationId: string;
  title: string;
  deliverables: string[];
  platforms: OfferPlatform[];
  priceCents: number;
  deliveryDays?: number;
}

/** `/offers` — brand → creator offers and creator → brand custom offers. */
export const offersEndpoints = (c: ApiClient) => ({
  /**
   * Brand → creator. Returns a Stripe Checkout URL: the brand's card is HELD there (not charged),
   * and the offer reaches the creator once the hold succeeds. Charged only when the creator accepts.
   */
  createBrandOffer: (body: BrandOfferInput) => c.post<{ offer: Offer; checkoutUrl: string }>('/offers', body),
  /** Brand reopens the Stripe page for an offer whose payment wasn't finished. */
  resumeCheckout: (id: string) => c.post<{ checkoutUrl: string }>(`/offers/${id}/checkout`),
  /** Creator → brand, inside a chat. Returns the chat message with the offer embedded. */
  sendCustom: (body: CustomOfferInput) => c.post<ChatMessage>('/offers/custom', body),
  list: (params: { box: 'received' | 'sent'; status?: OfferStatus; page?: number; limit?: number }) =>
    c.getPage<Offer>('/offers', { params: { page: 1, limit: 20, ...params } }),
  /** Sidebar badge: pending offers waiting for MY answer. */
  pendingCount: async () => (await c.get<{ total: number }>('/offers/pending-count')).total,
  /**
   * Creator accepting a brand offer → the held payment is captured and the order starts.
   * Brand accepting a creator's custom offer → returns `checkoutUrl` (pay on Stripe; the webhook finishes it).
   */
  accept: (id: string) => c.post<Offer & { checkoutUrl?: string }>(`/offers/${id}/accept`),
  decline: (id: string, reason?: string) => c.post<Offer>(`/offers/${id}/decline`, reason ? { reason } : {}),
  withdraw: (id: string) => c.post<Offer>(`/offers/${id}/withdraw`),
});
