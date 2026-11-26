import type { ApiEnvelope } from './baseApi';
import type { ListPageMeta, ListWithStats } from '@/types/marketplace.types';

/**
 * Orders, transactions and tickets answer with `data: { items, stats }` (not a bare array like the
 * other lists), so `unwrapPage` doesn't fit. This keeps rows, header totals and pagination together.
 */
export const unwrapListWithStats = <TItem, TStats>(
  response: ApiEnvelope<{ items: TItem[]; stats: TStats }>,
  emptyStats: TStats,
): ListWithStats<TItem, TStats> => ({
  items: response.data?.items ?? [],
  stats: response.data?.stats ?? emptyStats,
  meta: {
    page: Number(response.meta?.page ?? 1),
    limit: Number(response.meta?.limit ?? 20),
    total: Number(response.meta?.total ?? 0),
    totalPages: Number(response.meta?.totalPages ?? 1),
  } satisfies ListPageMeta,
});

/** Drops empty filters so the URL only carries what the admin actually chose. */
export const cleanQueryParams = <T extends object>(params: T) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
