import { baseApi, unwrap, unwrapPage, type ApiEnvelope, type PageMeta, type Paginated } from './baseApi';
import type { VerificationRequest, VerificationStatus } from '@/types/admin.types';

export interface VerificationListParams {
  status?: VerificationStatus;
  /** Matches request code, creator name or handle */
  q?: string;
  page?: number;
  limit?: number;
}

/** List meta also carries how many requests are in each status (for the tab badges). */
export type VerificationListMeta = PageMeta & { counts?: Partial<Record<VerificationStatus, number>> };

const cleanParams = (params: VerificationListParams) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ''));

/** `/admin/verifications` — verified-badge requests from creators. */
export const verificationApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getVerifications: build.query<Paginated<VerificationRequest> & { meta: VerificationListMeta }, VerificationListParams>({
      query: (params) => ({ url: '/admin/verifications', params: cleanParams(params) }),
      transformResponse: (r: ApiEnvelope<VerificationRequest[]>) => unwrapPage(r),
      providesTags: ['Verifications'],
    }),

    getVerification: build.query<VerificationRequest, string>({
      query: (id) => `/admin/verifications/${id}`,
      transformResponse: (r: ApiEnvelope<VerificationRequest>) => unwrap(r),
      providesTags: (_result, _error, id) => [{ type: 'Verifications', id }],
    }),

    // Approving sets `verified` on the creator, so the users list is refreshed too.
    approveVerification: build.mutation<VerificationRequest, string>({
      query: (id) => ({ url: `/admin/verifications/${id}/approve`, method: 'POST' }),
      transformResponse: (r: ApiEnvelope<VerificationRequest>) => unwrap(r),
      invalidatesTags: ['Verifications', 'Users', 'User'],
    }),

    rejectVerification: build.mutation<VerificationRequest, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/admin/verifications/${id}/reject`, method: 'POST', body: { reason } }),
      transformResponse: (r: ApiEnvelope<VerificationRequest>) => unwrap(r),
      invalidatesTags: ['Verifications'],
    }),

    /** Signed URL for a private uploaded sample (valid ~10 minutes). */
    getAdminFileUrl: build.query<{ url: string }, string>({
      query: (fileId) => `/admin/files/${fileId}/url`,
      transformResponse: (r: ApiEnvelope<{ url: string }>) => unwrap(r),
    }),
  }),
});

export const {
  useGetVerificationsQuery,
  useGetVerificationQuery,
  useApproveVerificationMutation,
  useRejectVerificationMutation,
  useLazyGetAdminFileUrlQuery,
} = verificationApi;
