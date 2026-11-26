import { z } from "zod";
import { zEmail, zObjectId, zUrl } from "../../../shared/zod";
import { CMS_PAGE_SLUGS, FAQ_CATEGORIES, SOCIAL_LINK_PLATFORMS } from "./cms.model";

const zSlug = z.enum(CMS_PAGE_SLUGS);
const zFaqCategory = z.enum(FAQ_CATEGORIES);
const zDirection = z.object({ direction: z.enum(["up", "down"]) });
const idParam = z.object({ id: zObjectId });

const faqBody = z.object({
  category: zFaqCategory,
  question: z.string().trim().min(3).max(500),
  answer: z.string().trim().min(1).max(5000),
  isPublished: z.boolean().default(true),
  translations: z.object({ de: z.object({ question: z.string().max(500), answer: z.string().max(5000) }) }).partial().optional(),
});

const partnerBrandBody = z.object({
  name: z.string().trim().min(1).max(100),
  logoUrl: zUrl,
  websiteUrl: zUrl.optional(),
  category: z.string().trim().max(50).optional(),
  isActive: z.boolean().default(true),
});

export const CmsValidation = {
  publicPage: z.object({ params: z.object({ slug: zSlug }) }),
  publicFaqs: z.object({ query: z.object({ category: zFaqCategory.optional() }) }),

  savePage: z.object({
    params: z.object({ slug: zSlug }),
    body: z.object({
      title: z.string().trim().min(1).max(200),
      contentMarkdown: z.string().min(1).max(200_000),
      version: z.string().trim().regex(/^\d+(\.\d+){0,2}$/, "Use a version like 1.0 or 2.1.3"),
      isPublished: z.boolean().default(true),
    }),
  }),

  adminFaqs: z.object({ query: z.object({ category: zFaqCategory.optional() }) }),
  createFaq: z.object({ body: faqBody }),
  updateFaq: z.object({ params: idParam, body: faqBody.partial().refine((v) => Object.keys(v).length > 0, "Nothing to update") }),
  moveItem: z.object({ params: idParam, body: zDirection }),
  idParam: z.object({ params: idParam }),

  createPartnerBrand: z.object({ body: partnerBrandBody }),
  updatePartnerBrand: z.object({
    params: idParam,
    body: partnerBrandBody.partial().refine((v) => Object.keys(v).length > 0, "Nothing to update"),
  }),

  updateSite: z.object({
    body: z
      .object({
        logoLightUrl: zUrl,
        logoDarkUrl: zUrl,
        faviconUrl: zUrl,
        heroHeadline: z.string().trim().max(200),
        heroSubtitle: z.string().trim().max(500),
        supportEmail: zEmail,
        socialLinks: z.array(z.object({ platform: z.enum(SOCIAL_LINK_PLATFORMS), url: zUrl })).max(10),
        ticker: z
          .object({
            headline: z.string().trim().max(200),
            speedSeconds: z.number().int().min(5).max(120),
            pauseOnHover: z.boolean(),
            direction: z.enum(["left", "right"]),
            isEnabled: z.boolean(),
          })
          .partial(),
      })
      .partial()
      .strict(),
  }),
};
