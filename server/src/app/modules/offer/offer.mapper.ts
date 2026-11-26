import { OfferStatus } from "./offer.constant";
import { Offer } from "./offer.model";

/**
 * Pure mapping + a batch loader. Kept apart from offer.service so the chat module can embed
 * offers in messages without importing the offer service (which itself uses the chat service).
 */

/** A pending offer past its expiry is expired — no cron needed for correctness. */
export const effectiveStatus = (offer: { status: string; expiresAt: Date }): OfferStatus =>
  (offer.status === "pending" || offer.status === "awaiting_payment") && new Date(offer.expiresAt).getTime() <= Date.now()
    ? "expired"
    : (offer.status as OfferStatus);

export const toOfferView = (offer: any) => {
  const feeCents = Math.round((offer.priceCents * offer.platformFeePercent) / 100);
  return {
    id: String(offer._id),
    code: offer.code,
    direction: offer.direction,
    conversationId: String(offer.conversationId),
    brandId: String(offer.brandId),
    creatorId: String(offer.creatorId),
    packageId: offer.packageId ? String(offer.packageId) : null,
    packageTitle: offer.packageTitle ?? null,
    title: offer.title,
    brief: offer.brief ?? "",
    deliverables: offer.deliverables ?? [],
    platforms: offer.platforms ?? [],
    /** Creator payout. */
    priceCents: offer.priceCents,
    platformFeePercent: offer.platformFeePercent,
    feeCents,
    /** What the brand pays. */
    totalCents: offer.priceCents + feeCents,
    deliveryDays: offer.deliveryDays,
    status: effectiveStatus(offer),
    expiresAt: offer.expiresAt,
    respondedAt: offer.respondedAt ?? null,
    orderId: offer.orderId ? String(offer.orderId) : null,
    createdAt: offer.createdAt,
  };
};

export type OfferView = ReturnType<typeof toOfferView>;

/** Offers by id → view, one `$in` query. */
export const loadOfferViews = async (offerIds: string[]) => {
  const unique = [...new Set(offerIds)];
  if (!unique.length) return new Map<string, OfferView>();
  const offers = await Offer.find({ _id: { $in: unique } }).lean();
  return new Map(offers.map((o) => [String(o._id), toOfferView(o)]));
};
