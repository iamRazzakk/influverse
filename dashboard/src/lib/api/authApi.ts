import { baseApi, unwrap, type ApiEnvelope } from './baseApi';
import type { AdminUser } from '@/types/admin.types';
import { setAccessToken, setCurrentAdmin, signedIn, signedOut } from '@/store/slices/authSlice';

type AuthResult = { accessToken: string; admin: AdminUser };

/** `/admin/auth/*` — login, session restore, profile and password. */
export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<AuthResult, { email: string; password: string; rememberMe?: boolean }>({
      query: (body) => ({ url: '/admin/auth/login', method: 'POST', body }),
      transformResponse: (r: ApiEnvelope<AuthResult>) => unwrap(r),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        dispatch(signedIn(data));
      },
    }),

    logout: build.mutation<void, void>({
      query: () => ({ url: '/admin/auth/logout', method: 'POST' }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        // Sign out locally even if the server call fails (e.g. session already expired).
        try {
          await queryFulfilled;
        } finally {
          dispatch(signedOut());
          dispatch(baseApi.util.resetApiState());
        }
      },
    }),

    getMe: build.query<AdminUser, void>({
      query: () => '/admin/auth/me',
      transformResponse: (r: ApiEnvelope<AdminUser>) => unwrap(r),
      providesTags: ['Me'],
    }),

    updateMe: build.mutation<AdminUser, { name?: string; avatar?: string | null }>({
      query: (body) => ({ url: '/admin/auth/me', method: 'PATCH', body }),
      transformResponse: (r: ApiEnvelope<AdminUser>) => unwrap(r),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        dispatch(setCurrentAdmin(data));
      },
      invalidatesTags: ['Me'],
    }),

    changePassword: build.mutation<{ accessToken?: string } | undefined, { currentPassword: string; newPassword: string }>({
      query: (body) => ({ url: '/admin/auth/change-password', method: 'POST', body }),
      transformResponse: (r: ApiEnvelope<{ accessToken?: string } | undefined>) => unwrap(r),
      // The server bumps the token version, so the old access token stops working — swap in the new one.
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        if (data?.accessToken) dispatch(setAccessToken(data.accessToken));
      },
    }),

    forgotPassword: build.mutation<string | undefined, { email: string }>({
      query: (body) => ({ url: '/admin/auth/forgot-password', method: 'POST', body }),
      transformResponse: (r: ApiEnvelope<unknown>) => r.message,
    }),

    resetPassword: build.mutation<string | undefined, { token: string; password: string }>({
      query: (body) => ({ url: '/admin/auth/reset-password', method: 'POST', body }),
      transformResponse: (r: ApiEnvelope<unknown>) => r.message,
    }),

    acceptInvite: build.mutation<AuthResult, { token: string; name: string; password: string }>({
      query: (body) => ({ url: '/admin/auth/accept-invite', method: 'POST', body }),
      transformResponse: (r: ApiEnvelope<AuthResult>) => unwrap(r),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        dispatch(signedIn(data));
      },
    }),
  }),
});

export const {
  useLoginMutation,
  useLogoutMutation,
  useGetMeQuery,
  useUpdateMeMutation,
  useChangePasswordMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useAcceptInviteMutation,
} = authApi;
