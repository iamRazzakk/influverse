/**
 * Shapes returned by the marketplace admin endpoints (orders, transactions, support desk).
 * Kept apart from the older mock-era types in admin.types.ts, which used different field names.
 */

/** A brand or creator as the server shows it next to an order / ticket / chat (`loadCounterparts`). */
export interface MarketplaceParty {
  id: string;
  role: 'brand' | 'creator';
  name: string;
  avatar: string | null;
  /** Creator handle or brand slug */
  handle: string | null;
  verified: boolean;
  /** false when the account is suspended / deactivated */
  available: boolean;
}

/** `meta` of every page-based admin list. */
export interface ListPageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** List endpoints of this group return `data: { items, stats }` plus the page meta. */
export interface ListWithStats<TItem, TStats> {
  items: TItem[];
  stats: TStats;
  meta: ListPageMeta;
}
