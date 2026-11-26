import type { Metadata } from 'next';
import { publicApi, tryPublic } from '@/lib/api/server';
import { publicEndpoints } from '@/lib/api/endpoints/public';
import { metaEndpoints } from '@/lib/api/endpoints/meta';
import { toUrlSearchParams } from '../creators/creatorQuery';
import { SEARCH_PAGE_SIZE, searchApiParams } from './searchQuery';
import { SearchView } from './SearchView';

type Props = { searchParams: Record<string, string | string[] | undefined> };

export function generateMetadata({ searchParams }: Props): Metadata {
  const q = (toUrlSearchParams(searchParams).get('q') || '').trim();
  return {
    title: q ? `Search results for "${q}" | Influverse` : 'Search Creators | Influverse',
    description: 'Search vetted Instagram, TikTok and YouTube creators on Influverse.',
  };
}

/**
 * /search. The server renders page 1 (sorted by relevance) for the URL's search through the cached
 * public client; a new search changes the URL and re-renders this page. No cookies / session here.
 */
export default async function SearchPage({ searchParams }: Props) {
  const params = toUrlSearchParams(searchParams);
  const [initialResults, meta] = await Promise.all([
    publicEndpoints(publicApi)
      .searchCreators(searchApiParams(params, { sort: 'relevance', page: 1, limit: SEARCH_PAGE_SIZE }))
      .catch(() => null),
    tryPublic((api) => metaEndpoints(api).options()),
  ]);

  return (
    <SearchView initialResults={initialResults} creatorCategories={meta?.creatorCategories ?? []} pageSize={SEARCH_PAGE_SIZE} />
  );
}
