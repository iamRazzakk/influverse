import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { ApiError, CSRF_HEADER, CSRF_VALUE, apiErrorFromBody, buildQuery, createApiClient } from './core';
import type { ApiClient, ApiEnvelope, SendFn } from './types';

/**
 * Browser transport. The ONE axios instance of the website; never call `axios.get(url)` elsewhere.
 *
 * - Calls the same-origin `/api/v1/*` proxy, so the httpOnly `at` / `rt` cookies go along automatically.
 *   No token is ever stored in JS.
 * - Sends the CSRF header the backend requires on cookie-authenticated writes.
 * - On 401: one shared refresh, then retries the request once. If refresh fails → session expired.
 *
 * Do not import this file into Server Components (use lib/api/server.ts there).
 */

export const axiosInstance = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  timeout: 30_000,
  headers: { [CSRF_HEADER]: CSRF_VALUE, Accept: 'application/json' },
  // Same query format as the server transport.
  paramsSerializer: { serialize: (params) => buildQuery(params).slice(1) },
});

/** A 401 from these means "wrong credentials / bad code", not "access token expired". */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/reset-password', '/auth/verify-otp'];

/**
 * Only one refresh at a time. The server rotates the refresh token on every use, so two parallel
 * refreshes would look like token reuse and end the session.
 */
let refreshInFlight: Promise<boolean> | null = null;

export const refreshSession = (): Promise<boolean> => {
  if (!refreshInFlight) {
    refreshInFlight = axiosInstance
      .post('/auth/refresh')
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

/** What happens when the session can't be renewed. Default: go to login and come back afterwards. */
let onSessionExpired = () => {
  if (typeof window === 'undefined') return;
  const here = window.location.pathname + window.location.search;
  window.location.assign(`/login?next=${encodeURIComponent(here)}`);
};

/** Lets the app replace the default redirect (e.g. show a modal instead). */
export const setSessionExpiredHandler = (handler: () => void) => {
  onSessionExpired = handler;
};

type RetriableConfig = AxiosRequestConfig & { _retried?: boolean; _authRedirect?: boolean };

axiosInstance.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetriableConfig | undefined;
  const url = config?.url ?? '';
  if (error.response?.status === 401 && config && !config._retried && !NO_REFRESH_PATHS.some((p) => url.startsWith(p))) {
    config._retried = true;
    if (await refreshSession()) return axiosInstance.request(config);
    if (config._authRedirect !== false) onSessionExpired();
  }
  return Promise.reject(error);
});

/** Normalizes anything axios throws into ApiError. */
export const toApiError = (error: unknown): ApiError => {
  if (error instanceof ApiError) return error;
  if (axios.isAxiosError(error)) {
    if (error.response) return apiErrorFromBody(error.response.status, error.response.data, error.message);
    if (axios.isCancel(error)) return new ApiError(0, 'Request cancelled');
    return new ApiError(0, error.code === 'ECONNABORTED' ? 'The request timed out' : 'Could not reach the server');
  }
  return new ApiError(0, error instanceof Error ? error.message : 'Something went wrong');
};

const send: SendFn = async (method, path, body, options) => {
  try {
    const config: RetriableConfig = {
      _authRedirect: options.authRedirect,
      method,
      url: path,
      data: body,
      params: options.params,
      headers: options.headers,
      signal: options.signal,
      onUploadProgress: options.onUploadProgress
        ? (e) => options.onUploadProgress!(e.total ? Math.round((e.loaded / e.total) * 100) : 0)
        : undefined,
    };
    const res = await axiosInstance.request<ApiEnvelope<unknown>>(config);
    return res.data ?? { success: true, data: undefined };
  } catch (error) {
    throw toApiError(error);
  }
};

/** Browser ApiClient: pass to any `endpoints/*` factory, e.g. `ordersEndpoints(http).approve(id)`. */
export const http: ApiClient = createApiClient(send);
