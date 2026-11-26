import { z } from "zod";
import { zObjectId } from "../../../shared/zod";
import { PACKAGE_LIMITS, PACKAGE_PLATFORMS, USAGE_RIGHTS } from "./package.constant";

const packageBody = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
  platforms: z.array(z.enum(PACKAGE_PLATFORMS)).min(1).max(PACKAGE_PLATFORMS.length).transform((list) => [...new Set(list)]),
  priceCents: z.number().int().min(PACKAGE_LIMITS.minPriceCents).max(PACKAGE_LIMITS.maxPriceCents),
  deliveryDays: z.number().int().min(PACKAGE_LIMITS.minDeliveryDays).max(PACKAGE_LIMITS.maxDeliveryDays),
  revisions: z.number().int().min(0).max(PACKAGE_LIMITS.maxRevisions).default(2),
  inclusions: z.array(z.string().trim().min(1).max(200)).max(15).default([]),
  usageRights: z.enum(USAGE_RIGHTS).default("organic_30d"),
  popular: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const idParam = z.object({ id: zObjectId });

export const PackageValidation = {
  create: z.object({ body: packageBody.strict() }),
  update: z.object({
    params: idParam,
    // `.partial()` drops the defaults so a PATCH only touches the fields that were sent.
    body: packageBody
      .partial()
      .strict()
      .refine((v) => Object.keys(v).length > 0, "Nothing to update"),
  }),
  idParam: z.object({ params: idParam }),
  reorder: z.object({ body: z.object({ ids: z.array(zObjectId).min(1).max(10) }) }),
};
