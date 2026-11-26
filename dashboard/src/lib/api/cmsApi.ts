import { baseApi, unwrap, type ApiEnvelope } from './baseApi';
import type {
  CmsFaq,
  CmsPageDoc,
  CmsPageSlug,
  CmsPartnerBrand,
  FaqCategory,
  SiteSettings,
} from '@/types/admin.types';

type FaqInput = { category: FaqCategory; question: string; answer: string; isPublished?: boolean };
type PartnerBrandInput = { name: string; logoUrl: string; websiteUrl?: string; category?: string; isActive?: boolean };
type Direction = 'up' | 'down';

/**
 * `/admin/cms/*` (permission `cms.manage`). Every write on the server also clears the
 * public Redis cache and asks the website to revalidate, so changes go live right away.
 */
export const cmsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // ---- legal / about pages ----
    getCmsPage: build.query<CmsPageDoc, CmsPageSlug>({
      query: (slug) => `/admin/cms/pages/${slug}`,
      transformResponse: (r: ApiEnvelope<CmsPageDoc>) => unwrap(r),
      providesTags: (_r, _e, slug) => [{ type: 'Cms', id: slug }],
    }),
    saveCmsPage: build.mutation<
      CmsPageDoc,
      { slug: CmsPageSlug; title: string; contentMarkdown: string; version: string; isPublished?: boolean }
    >({
      query: ({ slug, ...body }) => ({ url: `/admin/cms/pages/${slug}`, method: 'PUT', body }),
      transformResponse: (r: ApiEnvelope<CmsPageDoc>) => unwrap(r),
      invalidatesTags: (_r, _e, { slug }) => [{ type: 'Cms', id: slug }],
    }),

    // ---- FAQs ----
    getFaqs: build.query<CmsFaq[], void>({
      query: () => '/admin/cms/faqs',
      transformResponse: (r: ApiEnvelope<CmsFaq[]>) => unwrap(r) ?? [],
      providesTags: ['Faqs'],
    }),
    createFaq: build.mutation<CmsFaq, FaqInput>({
      query: (body) => ({ url: '/admin/cms/faqs', method: 'POST', body }),
      transformResponse: (r: ApiEnvelope<CmsFaq>) => unwrap(r),
      invalidatesTags: ['Faqs'],
    }),
    updateFaq: build.mutation<CmsFaq, { id: string } & Partial<FaqInput>>({
      query: ({ id, ...body }) => ({ url: `/admin/cms/faqs/${id}`, method: 'PATCH', body }),
      transformResponse: (r: ApiEnvelope<CmsFaq>) => unwrap(r),
      invalidatesTags: ['Faqs'],
    }),
    deleteFaq: build.mutation<void, string>({
      query: (id) => ({ url: `/admin/cms/faqs/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Faqs'],
    }),
    moveFaq: build.mutation<CmsFaq[], { id: string; direction: Direction }>({
      query: ({ id, direction }) => ({ url: `/admin/cms/faqs/${id}/move`, method: 'POST', body: { direction } }),
      transformResponse: (r: ApiEnvelope<CmsFaq[]>) => unwrap(r),
      invalidatesTags: ['Faqs'],
    }),

    // ---- partner brands ("Trusted by") ----
    getPartnerBrands: build.query<CmsPartnerBrand[], void>({
      query: () => '/admin/cms/partner-brands',
      transformResponse: (r: ApiEnvelope<CmsPartnerBrand[]>) => unwrap(r) ?? [],
      providesTags: ['PartnerBrands'],
    }),
    createPartnerBrand: build.mutation<CmsPartnerBrand, PartnerBrandInput>({
      query: (body) => ({ url: '/admin/cms/partner-brands', method: 'POST', body }),
      transformResponse: (r: ApiEnvelope<CmsPartnerBrand>) => unwrap(r),
      invalidatesTags: ['PartnerBrands'],
    }),
    updatePartnerBrand: build.mutation<CmsPartnerBrand, { id: string } & Partial<PartnerBrandInput>>({
      query: ({ id, ...body }) => ({ url: `/admin/cms/partner-brands/${id}`, method: 'PATCH', body }),
      transformResponse: (r: ApiEnvelope<CmsPartnerBrand>) => unwrap(r),
      invalidatesTags: ['PartnerBrands'],
    }),
    deletePartnerBrand: build.mutation<void, string>({
      query: (id) => ({ url: `/admin/cms/partner-brands/${id}`, method: 'DELETE' }),
      invalidatesTags: ['PartnerBrands'],
    }),
    movePartnerBrand: build.mutation<CmsPartnerBrand[], { id: string; direction: Direction }>({
      query: ({ id, direction }) => ({ url: `/admin/cms/partner-brands/${id}/move`, method: 'POST', body: { direction } }),
      transformResponse: (r: ApiEnvelope<CmsPartnerBrand[]>) => unwrap(r),
      invalidatesTags: ['PartnerBrands'],
    }),

    /** Public copy of the site settings (no login needed) — used by the logo on the login screen. */
    getPublicSite: build.query<SiteSettings, void>({
      query: () => '/cms/site',
      transformResponse: (r: ApiEnvelope<SiteSettings>) => unwrap(r) ?? {},
      providesTags: ['Site'],
    }),

    // ---- site settings (logos, hero copy, social links, ticker) ----
    getSiteSettings: build.query<SiteSettings, void>({
      query: () => '/admin/cms/site',
      transformResponse: (r: ApiEnvelope<SiteSettings>) => unwrap(r) ?? {},
      providesTags: ['Site'],
    }),
    /** Partial update — send only what changed. `ticker` fields are merged on the server. */
    updateSiteSettings: build.mutation<SiteSettings, Partial<SiteSettings>>({
      query: (body) => ({ url: '/admin/cms/site', method: 'PATCH', body }),
      transformResponse: (r: ApiEnvelope<SiteSettings>) => unwrap(r),
      invalidatesTags: ['Site'],
    }),
  }),
});

export const {
  useGetCmsPageQuery,
  useSaveCmsPageMutation,
  useGetFaqsQuery,
  useCreateFaqMutation,
  useUpdateFaqMutation,
  useDeleteFaqMutation,
  useMoveFaqMutation,
  useGetPartnerBrandsQuery,
  useCreatePartnerBrandMutation,
  useUpdatePartnerBrandMutation,
  useDeletePartnerBrandMutation,
  useMovePartnerBrandMutation,
  useGetSiteSettingsQuery,
  useGetPublicSiteQuery,
  useUpdateSiteSettingsMutation,
} = cmsApi;
