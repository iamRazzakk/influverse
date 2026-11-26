import { z } from "zod";
import { zCountry, zUrl } from "../../../shared/zod";
import {
  BRAND_INDUSTRIES,
  CAMPAIGN_GOALS,
  COMPANY_SIZES,
  CREATOR_TIERS,
  MONTHLY_BUDGETS,
  TARGET_PLATFORMS,
} from "./brand.constant";

const updateProfile = z.object({
  body: z
    .object({
      companyName: z.string().trim().min(1).max(120).optional(),
      logo: zUrl.nullable().optional(),
      coverImage: zUrl.nullable().optional(),
      jobTitle: z.string().trim().max(100).nullable().optional(),
      tagline: z.string().trim().max(160).nullable().optional(),
      bio: z.string().trim().max(2000).nullable().optional(),
      website: zUrl.nullable().optional(),
      country: zCountry.optional(),
      city: z.string().trim().min(1).max(100).optional(),
      companySize: z.enum(COMPANY_SIZES).optional(),
      foundedYear: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
      industry: z.enum(BRAND_INDUSTRIES).optional(),
      industryTags: z.array(z.string().trim().min(1).max(30)).max(8).optional(),
      targetPlatforms: z.array(z.enum(TARGET_PLATFORMS)).optional(),
      campaignGoals: z.array(z.enum(CAMPAIGN_GOALS)).optional(),
      monthlyBudget: z.enum(MONTHLY_BUDGETS).optional(),
      creatorTiers: z.array(z.enum(CREATOR_TIERS)).optional(),
      vatNumber: z.string().trim().max(20).nullable().optional(),
      billingAddress: z
        .object({
          line1: z.string().trim().max(200),
          line2: z.string().trim().max(200).optional(),
          city: z.string().trim().max(100),
          postalCode: z.string().trim().max(20),
          country: zCountry,
        })
        .optional(),
      onboardingStep: z.number().int().min(1).max(6).optional(),
    })
    .strict(),
});

const slugParam = z.object({ params: z.object({ slug: z.string().trim().min(1).max(80) }) });

export const BrandValidation = { updateProfile, slugParam };
