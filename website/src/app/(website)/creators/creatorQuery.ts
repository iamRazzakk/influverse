import type { CreatorSearchParams, CreatorSort } from '@/types/public';

/**
 * URL <-> GET /creators params for the /creators discovery page. Pure (no React), so the server page
 * and the client filter hook (components/shared/useCreatorFilters.ts) parse the URL the same way.
 *
 * "all" in a select means "no filter" and is never written to the URL.
 */
export interface CreatorFilterValues {
  q: string;
  category: string;
  platform: string;
  country: string;
  gender: string;
  followerRange: string;
  sort: CreatorSort;
  verified: boolean;
  /** euros (whole numbers) in the UI, converted to cents for the API */
  minPrice: string;
  maxPrice: string;
  page: number;
}

export const CREATORS_PAGE_SIZE = 9;

const SORTS: CreatorSort[] = ['relevance', 'price_asc', 'price_desc', 'followers', 'rating', 'newest'];
const PLATFORMS = ['instagram', 'tiktok', 'youtube'];
const RANGES = ['nano', 'micro', 'macro', 'mega'];

const euroToCents = (value: string) => {
  const n = Number(value);
  return value !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
};

export const parseCreatorFilters = (params: URLSearchParams): CreatorFilterValues => {
  const get = (key: string) => params.get(key) ?? '';
  const platform = get('platform');
  const range = get('followerRange');
  const sort = get('sort') as CreatorSort;
  return {
    q: get('q') || get('search'),
    category: get('category') || 'all',
    platform: PLATFORMS.includes(platform) ? platform : 'all',
    country: get('country') || 'all',
    gender: get('gender') || 'all',
    followerRange: RANGES.includes(range) ? range : 'all',
    sort: SORTS.includes(sort) ? sort : 'relevance',
    verified: get('verified') === 'true',
    minPrice: get('minPrice'),
    maxPrice: get('maxPrice'),
    page: Math.max(1, Number(get('page')) || 1),
  };
};

/** Params for GET /creators. Text search needs at least 2 characters on the server. */
export const toCreatorApiParams = (filters: CreatorFilterValues, pageSize = CREATORS_PAGE_SIZE): CreatorSearchParams => ({
  q: filters.q.length >= 2 ? filters.q : undefined,
  category: filters.category !== 'all' ? filters.category : undefined,
  platform: filters.platform !== 'all' ? filters.platform : undefined,
  country: filters.country !== 'all' ? filters.country : undefined,
  gender: filters.gender !== 'all' ? filters.gender : undefined,
  followerRange: filters.followerRange !== 'all' ? filters.followerRange : undefined,
  verified: filters.verified || undefined,
  minPrice: euroToCents(filters.minPrice),
  maxPrice: euroToCents(filters.maxPrice),
  sort: filters.sort,
  page: filters.page,
  limit: pageSize,
});

/** Next.js `searchParams` prop → URLSearchParams (first value of repeated keys). */
export const toUrlSearchParams = (searchParams: Record<string, string | string[] | undefined>) => {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined) out.set(key, v);
  }
  return out;
};
