import type { ApiClient, QueryParams } from '../types';

import type {
  CreatorCardPlatform,
  CreatorCardData,
  SavedCreatorCard,
  CreatorSuggestion,
  FileRef,
  PublicPackage,
  PublicPortfolioItem,
  PublicGalleryPhoto,
  PublicCreatorDetail,
  PublicBrand,
  CmsPage,
  CmsFaq,
  PartnerBrand,
  SiteSettings,
  CreatorSort,
  CreatorSearchParams,
} from '@/types/public';

export type {
  CreatorCardPlatform,
  CreatorCardData,
  SavedCreatorCard,
  CreatorSuggestion,
  FileRef,
  PublicPackage,
  PublicPortfolioItem,
  PublicGalleryPhoto,
  PublicCreatorDetail,
  PublicBrand,
  CmsPage,
  CmsFaq,
  PartnerBrand,
  SiteSettings,
  CreatorSort,
  CreatorSearchParams,
};

/** Public discovery (creators, brands, CMS) + the brand's saved-creator list. */
export const publicEndpoints = (c: ApiClient) => ({
  searchCreators: (params: CreatorSearchParams, signal?: AbortSignal) =>
    c.getPage<CreatorCardData>('/creators', { params: params as unknown as QueryParams, tags: ['creators'], revalidate: 120, signal }),
  suggestCreators: (q: string, signal?: AbortSignal) => c.get<CreatorSuggestion[]>('/creators/suggest', { params: { q }, signal }),
  featuredCreators: () => c.get<CreatorCardData[]>('/creators/featured', { tags: ['creators'], revalidate: 120 }),
  /** Tag `creator:<id or handle>` is revalidated by the server when the profile changes. */
  creator: (idOrHandle: string) =>
    c.get<PublicCreatorDetail>(`/creators/${encodeURIComponent(idOrHandle)}`, { tags: ['creators', `creator:${idOrHandle}`] }),
  brand: (slug: string) => c.get<PublicBrand>(`/brands/${encodeURIComponent(slug)}`, { tags: [`brand:${slug}`] }),

  cmsPage: (slug: string) => c.get<CmsPage>(`/cms/pages/${slug}`, { tags: [`cms:page:${slug}`], revalidate: 3600 }),
  faqs: (category?: 'brands' | 'creators') =>
    c.get<CmsFaq[]>('/cms/faqs', { params: category ? { category } : undefined, tags: ['cms:faqs'] }),
  partnerBrands: () => c.get<PartnerBrand[]>('/cms/partner-brands', { tags: ['cms:partner-brands'] }),
  siteSettings: () => c.get<SiteSettings>('/cms/site', { tags: ['cms:site'] }),

  // ---- brand only (use with serverApi() / http, never publicApi) ----
  savedCreators: (params: { page?: number; limit?: number } = {}) =>
    c.getPage<SavedCreatorCard>('/me/saved-creators', { params: { page: 1, limit: 24, ...params } }),
  saveCreator: (creatorId: string) => c.put<{ creatorId: string; saved: boolean }>(`/me/saved-creators/${creatorId}`),
  unsaveCreator: (creatorId: string) => c.delete<{ creatorId: string; saved: boolean }>(`/me/saved-creators/${creatorId}`),
});
