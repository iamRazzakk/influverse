import { baseApi, unwrap, unwrapPage, type ApiEnvelope, type Paginated } from './baseApi';
import type {
  BanActionType,
  CreatorApprovalStatus,
  MarketplaceUser,
  MarketplaceUserDetail,
  UserStatus,
} from '@/types/admin.types';

export type UserSort =
  | 'recent'
  | 'oldest'
  | 'volume_desc'
  | 'volume_asc'
  | 'deals_desc'
  | 'deals_asc'
  | 'name_asc'
  | 'name_desc';

export interface UserListParams {
  role?: 'brand' | 'creator';
  status?: UserStatus;
  approval?: CreatorApprovalStatus;
  /** Server needs at least 2 characters; `USR-10042` does an exact code lookup. */
  q?: string;
  sort?: UserSort;
  page?: number;
  limit?: number;
}

export interface SuspendUserInput {
  id: string;
  actionType: BanActionType;
  reason: string;
  escrowDisposition: 'hold' | 'refund';
  notes?: string;
  /** Required for `temporary` — ISO date in the future */
  until?: string;
}

/** Drops empty filters so they don't end up as `?role=` in the URL. */
const cleanParams = (params: UserListParams) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ''));

/** `/admin/users` + `/admin/creators` — users directory, moderation and creator approval. */
export const usersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getUsers: build.query<Paginated<MarketplaceUser>, UserListParams>({
      query: (params) => ({ url: '/admin/users', params: cleanParams(params) }),
      transformResponse: (r: ApiEnvelope<MarketplaceUser[]>) => unwrapPage(r),
      providesTags: ['Users'],
    }),

    getUser: build.query<MarketplaceUserDetail, string>({
      query: (id) => `/admin/users/${id}`,
      transformResponse: (r: ApiEnvelope<MarketplaceUserDetail>) => unwrap(r),
      providesTags: (_result, _error, id) => [{ type: 'User', id }],
    }),

    suspendUser: build.mutation<unknown, SuspendUserInput>({
      query: ({ id, ...body }) => ({ url: `/admin/users/${id}/suspend`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { id }) => ['Users', { type: 'User', id }],
    }),

    reactivateUser: build.mutation<unknown, string>({
      query: (id) => ({ url: `/admin/users/${id}/reactivate`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => ['Users', { type: 'User', id }],
    }),

    approveCreator: build.mutation<unknown, string>({
      query: (id) => ({ url: `/admin/creators/${id}/approve`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => ['Users', { type: 'User', id }],
    }),

    requestCreatorChanges: build.mutation<unknown, { id: string; note: string }>({
      query: ({ id, note }) => ({ url: `/admin/creators/${id}/action-required`, method: 'POST', body: { note } }),
      invalidatesTags: (_result, _error, { id }) => ['Users', { type: 'User', id }],
    }),

    setCreatorFeatured: build.mutation<unknown, { id: string; isFeatured: boolean }>({
      query: ({ id, isFeatured }) => ({ url: `/admin/creators/${id}/feature`, method: 'POST', body: { isFeatured } }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'User', id }],
    }),
  }),
});

export const {
  useGetUsersQuery,
  useGetUserQuery,
  useSuspendUserMutation,
  useReactivateUserMutation,
  useApproveCreatorMutation,
  useRequestCreatorChangesMutation,
  useSetCreatorFeaturedMutation,
} = usersApi;
