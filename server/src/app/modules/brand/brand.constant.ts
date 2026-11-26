export const BRAND_INDUSTRIES = [
  "beauty",
  "fashion",
  "fitness",
  "food",
  "tech",
  "travel",
  "home",
  "business",
  "family",
  "eco",
  "art",
] as const;
export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"] as const;
export const TARGET_PLATFORMS = ["instagram", "tiktok", "youtube", "ugc"] as const;
export const CAMPAIGN_GOALS = ["awareness", "sales", "launch", "ugc_library", "ambassador"] as const;
export const MONTHLY_BUDGETS = ["starter", "growth", "scale", "enterprise"] as const;
export const CREATOR_TIERS = ["nano", "micro", "mid", "macro", "ugc_only"] as const;

/** These fields are required before complete-onboarding */
export const BRAND_REQUIRED_FOR_ONBOARDING = ["companyName", "country", "city", "industry"] as const;
