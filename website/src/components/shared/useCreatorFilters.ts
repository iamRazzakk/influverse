'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useDebouncedValue } from '@/components/shared/useDebouncedValue';
import type { CreatorSearchParams, CreatorSort } from '@/types/public';
import {
  CREATORS_PAGE_SIZE,
  parseCreatorFilters,
  toCreatorApiParams,
  type CreatorFilterValues,
} from '@/app/(website)/creators/creatorQuery';

/**
 * Creator discovery filters kept in the URL (`/creators?q=..&category=..&page=2`), so results are
 * shareable, survive reloads and work with the browser back button. The server page reads the same URL
 * and renders the results (GET /creators); this hook only writes filter changes to the URL.
 *
 * "all" in a select means "no filter" and is never written to the URL.
 */
export type { CreatorFilterValues };

export const FOLLOWER_RANGE_LABELS: Record<string, string> = {
  nano: 'Nano (< 10K)',
  micro: 'Micro (10K – 100K)',
  macro: 'Macro (100K – 1M)',
  mega: 'Mega (1M+)',
};

export const SORT_LABELS: Record<CreatorSort, string> = {
  relevance: 'Relevance',
  followers: 'Most Followers',
  rating: 'Top Rated',
  price_asc: 'Price: Low to High',
  price_desc: 'Price: High to Low',
  newest: 'Newest',
};

/** Countries offered in the location filter (ISO-2, as stored on creator profiles). */
export const COUNTRY_OPTIONS = ['DE', 'AT', 'CH', 'FR', 'IT', 'ES', 'NL', 'BE', 'PT', 'IE', 'GB', 'SE', 'DK', 'NO', 'FI', 'PL', 'US', 'CA'];

export function useCreatorFilters(pageSize = CREATORS_PAGE_SIZE) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // A URL change re-renders the server page (new results). Until it arrives, the controls already show
  // the new values (`optimistic` query string) and `isPending` dims the old results.
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const urlQuery = params.toString();
  const currentQuery = optimistic ?? urlQuery;
  useEffect(() => {
    if (!isPending || optimistic === urlQuery) setOptimistic(null);
  }, [isPending, optimistic, urlQuery]);

  const filters: CreatorFilterValues = useMemo(() => parseCreatorFilters(new URLSearchParams(currentQuery)), [currentQuery]);

  /** Writes changed filters to the URL. Any change except `page` jumps back to page 1. */
  const setFilters = useCallback(
    (updates: Partial<CreatorFilterValues>) => {
      const next = new URLSearchParams(currentQuery);
      next.delete('search');
      for (const [key, value] of Object.entries(updates)) {
        const empty = value === '' || value === 'all' || value === false || value === undefined || (key === 'sort' && value === 'relevance');
        if (empty) next.delete(key);
        else next.set(key, String(value));
      }
      if (!('page' in updates)) next.delete('page');
      if (next.get('page') === '1') next.delete('page');
      const query = next.toString();
      setOptimistic(query);
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    },
    [currentQuery, pathname, router],
  );

  const resetFilters = useCallback(() => {
    setOptimistic('');
    startTransition(() => router.replace(pathname, { scroll: false }));
  }, [pathname, router]);

  // The text box updates instantly; the URL (and therefore the API call) only after typing stops.
  const [searchText, setSearchText] = useState(filters.q);
  useEffect(() => setSearchText(filters.q), [filters.q]);
  const debouncedText = useDebouncedValue(searchText, 350);
  useEffect(() => {
    if (debouncedText.trim() !== filters.q) setFilters({ q: debouncedText.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedText]);

  /** Params for GET /creators (same mapping the server page uses). */
  const apiParams: CreatorSearchParams = useMemo(() => toCreatorApiParams(filters, pageSize), [filters, pageSize]);

  const activeFilterCount = [
    filters.category !== 'all',
    filters.country !== 'all',
    filters.platform !== 'all',
    filters.followerRange !== 'all',
    filters.gender !== 'all',
    filters.verified,
    Boolean(filters.minPrice || filters.maxPrice),
  ].filter(Boolean).length;

  return { filters, setFilters, resetFilters, searchText, setSearchText, apiParams, activeFilterCount, isPending };
}
