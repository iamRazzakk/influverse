import type { ApiClient, ApiEnvelope, FieldError, Paginated, QueryParams, SendFn } from './types';

/**
 * Real backend URL incl. version prefix. Used by the Next.js server (RSC, middleware) and by the
 * `/api/v1` rewrite in next.config.mjs. Browsers never call it directly; they use `/api/v1`.
 */
export const BACKEND_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://10.10.26.159:9990/api/v1').replace(/\/$/, '');

/** Cookie names set by the backend (server/src/app/modules/auth/auth.constant.ts). */
export const ACCESS_COOKIE = 'at';
export const REFRESH_COOKIE = 'rt';

/** Header the backend's CSRF guard expects on cookie-authenticated writes. */
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_VALUE = 'influverse-web';

/** Error thrown by every transport. `status` 0 = network failure / timeout. */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: FieldError[];

  constructor(status: number, message: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isNotFound() {
    return this.status === 404;
  }

  /** First message for a form field, e.g. `err.fieldMessage('email')`. */
  fieldMessage(path: string) {
    return this.fieldErrors.find((e) => e.path === path)?.message;
  }
}

/** Builds an ApiError from a parsed error body (`{ message, errorMessages }`). */
export const apiErrorFromBody = (status: number, body: unknown, fallback = 'Something went wrong') => {
  const b = (body ?? {}) as { message?: unknown; errorMessages?: unknown };
  const message = typeof b.message === 'string' && b.message ? b.message : fallback;
  const fieldErrors = Array.isArray(b.errorMessages) ? (b.errorMessages as FieldError[]) : [];
  return new ApiError(status, message, fieldErrors);
};

/** Same format as before (URLSearchParams): skips empty values, arrays joined with commas. */
export const buildQuery = (params?: QueryParams) => {
  if (!params) return '';
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    qs.append(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
};

/** Turns a transport's `send` into the full ApiClient. */
export const createApiClient = (send: SendFn): ApiClient => {
  const data = async <T>(promise: Promise<ApiEnvelope<unknown>>) => (await promise).data as T;

  return {
    get: (path, options = {}) => data(send('GET', path, undefined, options)),
    getPage: async <T>(path: string, options = {}) => {
      const env = (await send('GET', path, undefined, options)) as ApiEnvelope<T[]>;
      return { items: env.data ?? [], meta: env.meta ?? {} } satisfies Paginated<T>;
    },
    post: (path, body, options = {}) => data(send('POST', path, body, options)),
    patch: (path, body, options = {}) => data(send('PATCH', path, body, options)),
    put: (path, body, options = {}) => data(send('PUT', path, body, options)),
    delete: (path, options = {}) => data(send('DELETE', path, undefined, options)),
    raw: async <T>(...args: Parameters<SendFn>) => (await send(...args)) as ApiEnvelope<T>,
  } as ApiClient;
};

/** A fresh key for POST endpoints that use the server's `Idempotency-Key` support. */
export const idempotencyKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
