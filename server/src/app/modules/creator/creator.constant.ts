export const CREATOR_CATEGORIES = [
  "beauty",
  "fashion",
  "fitness",
  "travel",
  "food",
  "lifestyle",
  "tech",
  "business",
  "art",
  "family",
] as const;
export type CreatorCategory = (typeof CREATOR_CATEGORIES)[number];

export const COLLABORATION_PREFERENCES = ["sponsored", "ugc", "reviews", "events", "ambassador", "affiliate"] as const;
export const GENDERS = ["female", "male", "other"] as const;
export const SOCIAL_PLATFORMS = ["instagram", "tiktok", "youtube"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const APPROVAL_STATUS = {
  underReview: "under_review",
  approved: "approved",
  actionRequired: "action_required",
} as const;

export const HANDLE_REGEX = /^[a-z0-9_.]{3,30}$/;

/** Search filter `followerRange` → followersTotal range */
export const FOLLOWER_RANGES = {
  nano: [0, 10_000],
  micro: [10_000, 100_000],
  macro: [100_000, 1_000_000],
  mega: [1_000_000, Number.MAX_SAFE_INTEGER],
} as const;

export const CREATOR_REQUIRED_FOR_ONBOARDING = [
  "handle",
  "country",
  "city",
  "languages",
  "categories",
  "collaborationPreferences",
] as const;
