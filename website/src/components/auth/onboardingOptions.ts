/**
 * Display labels for server enum values. The VALUES come from GET /meta/options
 * (server constants are the single source of truth); this file only maps a value to
 * friendly text. Unknown values fall back to a Title Case version of the value.
 */

/** "ugc_library" → "Ugc Library" */
export const titleCase = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const labelOf = (labels: Record<string, string>, value: string) => labels[value] ?? titleCase(value);

export const CREATOR_CATEGORY_LABELS: Record<string, string> = {
  beauty: 'Beauty & Skincare',
  fashion: 'Fashion & Style',
  fitness: 'Fitness & Health',
  travel: 'Travel & Adventure',
  food: 'Food & Cuisine',
  lifestyle: 'Lifestyle & Wellness',
  tech: 'Tech & Gaming',
  business: 'Business & Finance',
  art: 'Art & Photography',
  family: 'Family & Parenting',
};

export const COLLABORATION_LABELS: Record<string, { label: string; desc: string }> = {
  sponsored: { label: 'Sponsored Posts', desc: 'Dedicated reels, videos, and posts' },
  ugc: { label: 'UGC Content', desc: 'Ad content without posting to your feed' },
  reviews: { label: 'Product Reviews', desc: 'Unboxings and honest product reviews' },
  events: { label: 'Events & Brand Trips', desc: 'In-person events and brand trips' },
  ambassador: { label: 'Brand Ambassadorship', desc: 'Long-term brand partnerships' },
  affiliate: { label: 'Affiliate & Gifting', desc: 'Affiliate links and product gifting' },
};

export const GENDER_LABELS: Record<string, string> = { female: 'Female', male: 'Male', other: 'Other' };

export const BRAND_INDUSTRY_LABELS: Record<string, { label: string; desc: string }> = {
  beauty: { label: 'Beauty & Cosmetics', desc: 'Skincare, makeup, fragrance & wellness' },
  fashion: { label: 'Fashion & Apparel', desc: 'Clothing, accessories & luxury goods' },
  fitness: { label: 'Fitness & Sports', desc: 'Activewear, supplements & equipment' },
  food: { label: 'Food & Beverage', desc: 'Restaurants, drinks & packaged foods' },
  tech: { label: 'Tech & Gaming', desc: 'Apps, gadgets, software & gaming' },
  travel: { label: 'Travel & Hospitality', desc: 'Hotels, airlines & experiences' },
  home: { label: 'Home & Living', desc: 'Interior, furniture & home goods' },
  business: { label: 'Business & Finance', desc: 'Fintech, SaaS & professional services' },
  family: { label: 'Family & Kids', desc: 'Parenting, toys & education' },
  eco: { label: 'Sustainability & Eco', desc: 'Green products & conscious brands' },
  art: { label: 'Art & Culture', desc: 'Creative, design & entertainment' },
};

export const TARGET_PLATFORM_LABELS: Record<string, { label: string; desc: string }> = {
  instagram: { label: 'Instagram', desc: 'Reels, Stories & feed posts' },
  tiktok: { label: 'TikTok', desc: 'Short-form viral video' },
  youtube: { label: 'YouTube', desc: 'Long-form reviews & Shorts' },
  ugc: { label: 'UGC Ads', desc: 'Creator content for your paid ads' },
};

export const CAMPAIGN_GOAL_LABELS: Record<string, { label: string; desc: string }> = {
  awareness: { label: 'Brand Awareness & Reach', desc: 'Build massive brand recognition & cultural buzz' },
  sales: { label: 'Direct Conversions & ROAS', desc: 'Drive traceable sales, discount codes & app installs' },
  launch: { label: 'Product Launch Momentum', desc: 'Create hype spikes for new SKU drops and seasonal releases' },
  ugc_library: { label: 'High-Volume UGC Creatives', desc: 'Stockpile authentic vertical videos for Meta & TikTok paid ads' },
  ambassador: { label: 'Long-Term Brand Ambassadors', desc: 'Build recurring, high-trust creator partnerships' },
};

export const MONTHLY_BUDGET_LABELS: Record<string, { label: string; desc: string }> = {
  starter: { label: 'Under €2,500 / month', desc: 'Great for testing 2-5 micro creators or UGC pilots' },
  growth: { label: '€2,500 – €10,000 / month', desc: 'Consistent monthly creator drops & multiformat campaigns' },
  scale: { label: '€10,000 – €50,000 / month', desc: 'Aggressive growth with mid-tier creators & Spark Ads' },
  enterprise: { label: '€50,000+ / month', desc: 'Custom enterprise contracts, VIP talents & dedicated SLAs' },
};

export const CREATOR_TIER_LABELS: Record<string, { label: string; range: string; desc: string }> = {
  nano: { label: 'Nano Creators', range: '5K - 25K followers', desc: 'Ultra-engaged micro communities & highest comment intent' },
  micro: { label: 'Micro Creators', range: '25K - 100K followers', desc: 'High ROI, authentic authority in dedicated niches' },
  mid: { label: 'Mid-Tier Creators', range: '100K - 500K followers', desc: 'Proven commercial reach with professional production' },
  macro: { label: 'Macro & VIP Creators', range: '500K+ followers', desc: 'Mass market prestige and viral spotlight reach' },
  ugc_only: { label: 'Professional UGC Actors', range: 'Any audience size', desc: 'Focused exclusively on high-converting paid ad hooks' },
};

/** The server stores ISO-2 country codes. */
export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'CA', name: 'Canada' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'DE', name: 'Germany' },
  { code: 'DK', name: 'Denmark' },
  { code: 'ES', name: 'Spain' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'GR', name: 'Greece' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IN', name: 'India' },
  { code: 'IT', name: 'Italy' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NO', name: 'Norway' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'SE', name: 'Sweden' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'US', name: 'United States' },
];

export const countryName = (code?: string | null) =>
  (code && COUNTRIES.find((c) => c.code === code.toUpperCase())?.name) || code || '';

/** Languages are free text on the server; this is just the quick-pick list. */
export const COMMON_LANGUAGES = [
  'English',
  'German',
  'French',
  'Spanish',
  'Italian',
  'Dutch',
  'Portuguese',
  'Swedish',
  'Polish',
  'Turkish',
  'Arabic',
  'Hindi',
  'Bengali',
  'Japanese',
  'Korean',
  'Chinese',
];

/** Server phone format is E.164-ish (`+4915112345678`) — strip spaces, dashes and brackets. */
export const normalizePhone = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return (trimmed.startsWith('+') ? '+' : '') + trimmed.replace(/\D/g, '');
};

/** Adds https:// when the user typed a bare domain (server requires a full URL). */
export const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};
