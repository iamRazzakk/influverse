export const PACKAGE_PLATFORMS = ["instagram", "tiktok", "youtube", "ugc"] as const;
export const PACKAGE_TYPES = ["story", "reel", "post", "video", "ugc_video", "integrated", "bundle"] as const;
export const USAGE_RIGHTS = ["organic_30d", "commercial_60d", "commercial_90d", "whitelisting_60d", "perpetual"] as const;
export type UsageRights = (typeof USAGE_RIGHTS)[number];

/** Display labels used by the website package form (sent via GET /meta/options). */
export const USAGE_RIGHTS_LABELS: Record<UsageRights, string> = {
  organic_30d: "30-Day Organic Rights",
  commercial_60d: "60-Day Commercial Rights",
  commercial_90d: "90-Day Full Commercial Rights",
  whitelisting_60d: "60-Day Whitelisting / Paid Ads",
  perpetual: "Perpetual Usage Rights",
};

/**
 * Package type is derived on the server from the selected channels (same rule the website used):
 * several channels → bundle, UGC only → ugc_video, YouTube only → video, otherwise → reel.
 */
export const derivePackageType = (platforms: readonly string[]) => {
  if (platforms.length > 1) return "bundle";
  if (platforms[0] === "ugc") return "ugc_video";
  if (platforms[0] === "youtube") return "video";
  return "reel";
};

export const PACKAGE_LIMITS = {
  minPriceCents: 5_000,
  maxPriceCents: 5_000_000,
  minDeliveryDays: 1,
  maxDeliveryDays: 60,
  maxRevisions: 10,
} as const;

/** Default package created when onboarding finishes (01 doc §3: reel, €350, 4 days, 2 revisions) */
export const DEFAULT_PACKAGE = {
  title: "Instagram Reel",
  platforms: ["instagram"],
  type: "reel",
  priceCents: 35_000,
  deliveryDays: 4,
  revisions: 2,
  inclusions: ["1 Reel (up to 60s)", "Raw footage", "Caption copy"],
  usageRights: "organic_30d",
} as const;
