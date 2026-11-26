import { z } from "zod";
import { zObjectId, zPagination } from "../../../shared/zod";
import { PACKAGE_LIMITS, PACKAGE_PLATFORMS } from "../package/package.constant";
import { OFFER_LIMITS, OFFER_STATUSES } from "./offer.constant";

const title = z.string().trim().min(OFFER_LIMITS.minTitle, "Please enter a title").max(OFFER_LIMITS.maxTitle);
const deliverables = z
  .array(z.string().trim().min(1).max(OFFER_LIMITS.maxDeliverableLength))
  .max(OFFER_LIMITS.maxDeliverables, `Up to ${OFFER_LIMITS.maxDeliverables} lines`);
const platforms = z
  .array(z.enum(PACKAGE_PLATFORMS))
  .min(1, "Choose at least one platform")
  .transform((list) => [...new Set(list)]);
const priceCents = z
  .number()
  .int()
  .min(PACKAGE_LIMITS.minPriceCents, `Minimum price is €${PACKAGE_LIMITS.minPriceCents / 100}`)
  .max(PACKAGE_LIMITS.maxPriceCents, `Maximum price is €${PACKAGE_LIMITS.maxPriceCents / 100}`);
const deliveryDays = z.number().int().min(OFFER_LIMITS.minDeliveryDays).max(OFFER_LIMITS.maxDeliveryDays);

/** Brand → creator (profile "Send Offer" modal / hire page). Package offers get price / days / platforms from the package. */
const createBrandOffer = z.object({
  body: z.object({
    creatorId: zObjectId,
    packageId: zObjectId.optional(),
    title,
    brief: z.string().trim().min(1, "Please provide a campaign brief").max(OFFER_LIMITS.maxBrief),
    deliverables: deliverables.default([]),
    platforms,
    priceCents,
    deliveryDays,
  }),
});

/** Creator → brand custom offer inside a chat thread. */
const createCreatorOffer = z.object({
  body: z.object({
    conversationId: zObjectId,
    title,
    deliverables: deliverables.min(1, "Add at least one deliverable"),
    platforms,
    priceCents,
    deliveryDays: deliveryDays.default(7),
  }),
});

const list = z.object({
  query: z.object({
    box: z.enum(["received", "sent"]).default("received"),
    status: z.enum(OFFER_STATUSES).optional(),
    ...zPagination,
  }),
});

const decline = z.object({
  params: z.object({ id: zObjectId }),
  body: z.object({ reason: z.string().trim().max(500).optional() }).default({}),
});

export const OfferValidation = { createBrandOffer, createCreatorOffer, list, decline };
