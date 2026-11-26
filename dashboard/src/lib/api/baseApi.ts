import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type { RootState } from '@/store';
import { setAccessToken, signedOut } from '@/store/slices/authSlice';

/**
 * Dev: calls go to the same origin (`/api/v1/*`) and the Vite proxy (vite.config.ts) forwards them to the
 * backend, so the httpOnly refresh cookie is first-party (no logout on hard reload) and there is no CORS.
 * Production build: VITE_API_URL — serve the dashboard and API from the same site (e.g. one domain via nginx).
 */
export const API_URL = import.meta.env.DEV
  ? '/api/v1'
  : (import.meta.env.VITE_API_URL || 'http://10.10.26.159:9990/api/v1').replace(/\/$/, '');

/** Every server response looks like this (see server/src/shared/sendResponse.ts). */
export interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
  meta?: PageMeta;
}

export interface PageMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  nextCursor?: string | null;
  [key: string]: unknown;
}

/** A list endpoint returns both the rows and the pagination meta. */
export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  // Needed so the httpOnly `art` refresh cookie is sent to /admin/auth/*.
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return headers;
  },
});

/**
 * Only one refresh call runs at a time. If ten requests fail with 401 together,
 * they all wait for the same refresh instead of sending ten refresh calls
 * (the server rotates the refresh token, so parallel refreshes would look like token reuse).
 */
let refreshInFlight: Promise<string | null> | null = null;

export const refreshAccessToken = (api: Parameters<BaseQueryFn>[1]): Promise<string | null> => {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const result = await rawBaseQuery({ url: '/admin/auth/refresh', method: 'POST' }, api, {});
      const token = (result.data as ApiEnvelope<{ accessToken: string }> | undefined)?.data?.accessToken ?? null;
      if (token) api.dispatch(setAccessToken(token));
      return token;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};

/** Paths where a 401 means "wrong credentials", not "access token expired". */
const NO_REFRESH_PATHS = ['/admin/auth/login', '/admin/auth/refresh', '/admin/auth/reset-password', '/admin/auth/accept-invite'];

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extra) => {
  let result = await rawBaseQuery(args, api, extra);
  const url = typeof args === 'string' ? args : args.url;

  if (result.error?.status === 401 && !NO_REFRESH_PATHS.some((p) => url.startsWith(p))) {
    const token = await refreshAccessToken(api);
    if (token) {
      result = await rawBaseQuery(args, api, extra);
    } else {
      api.dispatch(signedOut());
    }
  }
  return result;
};

/**
 * Feature APIs add their endpoints with `baseApi.injectEndpoints(...)` in their own file.
 * Tags drive cache invalidation (e.g. approving a verification refetches the users list).
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Me', 'Team', 'Users', 'User', 'Verifications', 'Cms', 'Faqs', 'PartnerBrands', 'Site', 'Notifications', 'AuditLogs', 'Orders', 'Transactions', 'Tickets', 'SupportInbox', 'SupportThread'],
  endpoints: () => ({}),
});

/** Unwraps `{ data }` from the envelope. */
export const unwrap = <T>(response: ApiEnvelope<T>) => response.data;

/** Keeps rows + meta for paginated lists. */
export const unwrapPage = <T>(response: ApiEnvelope<T[]>): Paginated<T> => ({
  items: response.data ?? [],
  meta: response.meta ?? {},
});

/** Turns any RTK Query / fetch error into one readable message for the UI. */
export const getErrorMessage = (error: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (!error || typeof error !== 'object') return fallback;
  const err = error as { status?: unknown; data?: { message?: string; errorMessages?: { message: string }[] }; error?: string };
  if (err.status === 'FETCH_ERROR') return 'Cannot reach the server. Check your connection.';
  const details = err.data?.errorMessages?.map((e) => e.message).filter(Boolean);
  if (err.data?.message === 'Validation Error' && details?.length) return details.join(', ');
  return err.data?.message || details?.[0] || err.error || fallback;
};
