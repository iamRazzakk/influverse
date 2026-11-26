import { z } from "zod";
import { zCountry, zQueryBool, zUrl } from "../../../shared/zod";
import {
  COLLABORATION_PREFERENCES,
  CREATOR_CATEGORIES,
  FOLLOWER_RANGES,
  GENDERS,
  HANDLE_REGEX,
  SOCIAL_PLATFORMS,
} from "./creator.constant";

const zHandle = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.replace(/^@/, ""))
  .pipe(z.string().regex(HANDLE_REGEX, "Handle: 3–30 chars, a-z 0-9 _ ."));

const updateProfile = z.object({
  body: z
    .object({
      handle: zHandle.optional(),
      bio: z.string().trim().max(1000).optional(),
      coverImage: zUrl.nullable().optional(),
      contactEmail: z.string().trim().email().nullable().optional(),
      contactPhone: z.string().trim().max(30).nullable().optional(),
      gender: z.enum(GENDERS).optional(),
      country: zCountry.optional(),
      city: z.string().trim().min(1).max(100).optional(),
      languages: z.array(z.string().trim().min(1).max(40)).min(1).max(10).optional(),
      categories: z.array(z.enum(CREATOR_CATEGORIES)).min(1).max(3).optional(),
      tags: z.array(z.string().trim().min(1).max(30)).max(15).optional(),
      collaborationPreferences: z.array(z.enum(COLLABORATION_PREFERENCES)).min(1).optional(),
      aestheticVibe: z.string().trim().max(200).optional(),
      ugc: z.object({ enabled: z.boolean(), avgDeliveryDays: z.number().int().min(1).max(60).optional() }).optional(),
      audience: z
        .object({
          topCountries: z
            .array(z.object({ country: zCountry, percentage: z.number().min(0).max(100) }))
            .max(5)
            .optional(),
          genderSplit: z.object({ female: z.number().min(0).max(100), male: z.number().min(0).max(100) }).optional(),
          topAgeGroup: z.string().max(20).optional(),
        })
        .optional(),
      onboardingStep: z.number().int().min(1).max(6).optional(),
    })
    .strict(),
});

const platformParam = z.object({ platform: z.enum(SOCIAL_PLATFORMS) });

const upsertPlatform = z.object({
  params: platformParam,
  body: z
    .object({
      handle: z.string().trim().min(1).max(60).transform((v) => v.replace(/^@/, "")),
      url: zUrl.optional(),
      followers: z.number().int().min(0).max(1_000_000_000).default(0),
      engagementRate: z.number().min(0).max(100).default(0),
      avgViews: z.number().int().min(0).default(0),
    })
    .strict(),
});

const removePlatform = z.object({ params: platformParam });

const handleAvailable = z.object({ query: z.object({ handle: zHandle }) });

export const SEARCH_SORTS = ["relevance", "price_asc", "price_desc", "followers", "rating", "newest"] as const;

const search = z.object({
  query: z.object({
    q: z.string().trim().max(100).optional(),
    category: z.enum(CREATOR_CATEGORIES).optional(),
    platform: z.enum(SOCIAL_PLATFORMS).optional(),
    country: zCountry.optional(),
    gender: z.enum(GENDERS).optional(),
    followerRange: z.enum(Object.keys(FOLLOWER_RANGES) as [keyof typeof FOLLOWER_RANGES]).optional(),
    minPrice: z.coerce.number().int().min(0).optional(), // cents
    maxPrice: z.coerce.number().int().min(0).optional(),
    verified: zQueryBool.optional(),
    sort: z.enum(SEARCH_SORTS).default("relevance"),
    page: z.coerce.number().int().min(1).max(500).default(1),
    limit: z.coerce.number().int().min(1).max(48).default(9),
  }),
});

const suggest = z.object({ query: z.object({ q: z.string().trim().min(1).max(50) }) });

const idOrHandle = z.object({ params: z.object({ idOrHandle: z.string().trim().min(1).max(40) }) });

export const CreatorValidation = {
  updateProfile,
  upsertPlatform,
  removePlatform,
  handleAvailable,
  search,
  suggest,
  idOrHandle,
};
