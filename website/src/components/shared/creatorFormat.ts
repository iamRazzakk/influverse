/**
 * Small display helpers for server values (enum keys → labels, ISO country codes, counts).
 * The server sends raw keys like "beauty" or "ugc_video"; the UI shows "Beauty" / "UGC Video".
 */

const SPECIAL_WORDS: Record<string, string> = { ugc: 'UGC', tiktok: 'TikTok', youtube: 'YouTube', x: 'X' };

/** "beauty" → "Beauty", "ugc_video" → "UGC Video", "organic_30d" → "Organic 30d" */
export const labelize = (value?: string | null) =>
  (value ?? '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => SPECIAL_WORDS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/** "FR" → "France" (browser Intl), falls back to the code. */
export const countryName = (code?: string | null, lang = 'en') => {
  if (!code) return '';
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

/** "Paris, France" from city + ISO country. */
export const formatLocation = (city?: string | null, country?: string | null) =>
  [city, countryName(country)].filter(Boolean).join(', ');

/** 12500 → "12.5K" */
export const formatCount = (value?: number | null) => {
  const n = value ?? 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
};

/** Rating to one decimal, "New" when there are no reviews yet. */
export const formatRating = (rating?: number | null, reviewsCount?: number | null) =>
  reviewsCount ? (rating ?? 0).toFixed(1) : 'New';

/** Initials placeholder (inline SVG, no external service) so cards never show a broken image. */
export const avatarFallback = (name?: string | null) => {
  const initials =
    (name ?? '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#F4F4F0"/><text x="50" y="50" dy=".35em" text-anchor="middle" font-family="sans-serif" font-size="38" font-weight="700" fill="#0A0A0A">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};
