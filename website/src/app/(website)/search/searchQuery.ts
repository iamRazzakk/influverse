import type { CreatorSearchParams, CreatorSort } from '@/types/public';

/** Minimal read interface shared by URLSearchParams and Next's ReadonlyURLSearchParams. */
type ParamReader = { get(key: string): string | null };

export const SEARCH_PAGE_SIZE = 9;

/**
 * GET /creators params for /search, from the *submitted* search in the URL (`q`/`search`, `platform`,
 * `category`, `gender`). Pure, so the server page and SearchView build the exact same request.
 */
export const searchApiParams = (
  params: ParamReader,
  { sort, page, limit }: { sort: CreatorSort; page: number; limit: number },
): CreatorSearchParams => {
  const q = (params.get('q') || params.get('search') || '').trim();
  const platform = params.get('platform') || 'all';
  const category = params.get('category') || 'all';
  const gender = params.get('gender') || 'all';
  return {
    q: q.length >= 2 ? q : undefined,
    platform: ['instagram', 'tiktok', 'youtube'].includes(platform) ? platform : undefined,
    category: category !== 'all' ? category : undefined,
    gender: gender !== 'all' ? gender : undefined,
    sort,
    page,
    limit,
  };
};
