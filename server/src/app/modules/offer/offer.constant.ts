/**
 * Two ways an offer is made (same as the website's original flows):
 * - `brand_to_creator` — brand sends a collaboration offer from the creator's profile / hire page.
 *   The creator accepts or declines it on /creator/offers. The chat gets "Offer sent / accepted / declined" notices.
 * - `creator_to_brand` — creator sends a custom offer inside the chat. It shows as an offer card;
 *   the brand accepts or declines it on the card.
 */
export const OFFER_DIRECTIONS = ["brand_to_creator", "creator_to_brand"] as const;
export type OfferDirection = (typeof OFFER_DIRECTIONS)[number];

/**
 * - `awaiting_payment` — brand offer whose card hold is not authorized yet (invisible to the creator).
 * - `expired` — set by the expiry job; until then a pending offer past `expiresAt` is SHOWN as expired.
 */
export const OFFER_STATUSES = ["awaiting_payment", "pending", "accepted", "declined", "withdrawn", "expired"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_LIMITS = {
  minTitle: 2,
  maxTitle: 120,
  maxBrief: 4000,
  maxDeliverables: 20,
  maxDeliverableLength: 300,
  minDeliveryDays: 1,
  maxDeliveryDays: 180,
} as const;
