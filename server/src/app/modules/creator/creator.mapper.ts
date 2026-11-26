import { formatCount } from "../../../utils/format";
import { SOCIAL_PLATFORMS, SocialPlatform } from "./creator.constant";

/**
 * Pure helpers for creator profiles — no database access here.
 */

type PlatformStats = { handle?: string | null; followers?: number | null; engagementRate?: number | null } | null | undefined;
type PlatformMap = Partial<Record<SocialPlatform, PlatformStats>> | null | undefined;

/**
 * Derives the denormalised search fields from the `platforms` sub-document.
 * Call this whenever platforms change and `$set` the result together with the platforms
 * (one atomic write, no pre-save hook needed).
 */
export const summarisePlatforms = (platforms: PlatformMap) => {
  const platformKeys: SocialPlatform[] = [];
  let followersTotal = 0;
  for (const key of SOCIAL_PLATFORMS) {
    const stats = platforms?.[key];
    if (stats?.handle) {
      platformKeys.push(key);
      followersTotal += stats.followers ?? 0;
    }
  }
  return { platformKeys, followersTotal };
};

/** Fields loaded for search result cards — keep in sync with `toCreatorCard`. */
export const CREATOR_CARD_PROJECTION =
  "userId handle name avatar coverImage country city categories platforms followersTotal " +
  "startingPriceCents rating reviewsCount verified totalCollaborations";

/** Compact creator card used by search, featured and saved-creator lists. */
export const toCreatorCard = (profile: Record<string, any>) => ({
  id: String(profile.userId),
  handle: profile.handle,
  name: profile.name,
  avatar: profile.avatar ?? null,
  coverImage: profile.coverImage ?? null,
  country: profile.country,
  city: profile.city,
  categories: profile.categories ?? [],
  platforms: SOCIAL_PLATFORMS.filter((key) => profile.platforms?.[key]?.handle).map((key) => {
    const stats = profile.platforms[key];
    return {
      platform: key,
      handle: stats.handle,
      url: stats.url ?? null,
      followers: stats.followers ?? 0,
      followersFormatted: formatCount(stats.followers),
      engagementRate: stats.engagementRate ?? 0,
      avgViews: stats.avgViews ?? 0,
    };
  }),
  followersTotal: profile.followersTotal ?? 0,
  followersFormatted: formatCount(profile.followersTotal),
  startingPriceCents: profile.startingPriceCents ?? 0,
  rating: profile.rating ?? 0,
  reviewsCount: profile.reviewsCount ?? 0,
  totalCollaborations: profile.totalCollaborations ?? 0,
  verified: Boolean(profile.verified),
});

/** Private fields that must never appear on the public creator page. */
export const CREATOR_PRIVATE_FIELDS = "-contactEmail -contactPhone -approvalNote -approvedBy -approvedAt";
