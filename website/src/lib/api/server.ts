import 'server-only';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE, ApiError, BACKEND_URL, apiErrorFromBody, buildQuery, createApiClient } from './core';
import type { ApiClient, ApiEnvelope, SendFn } from './types';

/**
 * Server transport (Server Components, Route Handlers, Server Actions). Uses native `fetch` so
 * reads plug into the Next.js Data Cache.
 *
 *   publicApi   — public data, cached with tags + revalidate. NEVER sends a token.
 *   serverApi() — the logged-in user's data. Token from the httpOnly `at` cookie, always `no-store`.
 *                 Calling it makes the page dynamic (it reads cookies), which is what we want.
 */

const DEFAULT_REVALIDATE = 300;

const parse = async (res: Response) => {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

const makeSend =
  (mode: 'public' | 'private', token?: string): SendFn =>
  async (method, path, body, options) => {
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (mode === 'private' && token) headers.Authorization = `Bearer ${token}`;

    // Only public GETs are cached. Everything else (writes, personal data) always hits the API.
    const cacheInit: RequestInit =
      mode === 'public' && method === 'GET'
        ? { next: { tags: options.tags ?? [], revalidate: options.revalidate ?? DEFAULT_REVALIDATE } }
        : { cache: 'no-store' };

    let res: Response;
    try {
      res = await fetch(`${BACKEND_URL}${path}${buildQuery(options.params)}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: options.signal,
        ...cacheInit,
      });
    } catch {
      throw new ApiError(0, 'Could not reach the server');
    }

    const parsed = await parse(res);
    if (!res.ok) throw apiErrorFromBody(res.status, parsed, res.statusText || 'Request failed');
    return (parsed ?? { success: true, data: undefined }) as ApiEnvelope<unknown>;
  };

/** Public, cached reads. Safe for static / ISR pages. */
export const publicApi: ApiClient = createApiClient(makeSend('public'));

/** The logged-in user's API client. Throws 401 (from the backend) when there is no session. */
export const serverApi = (): ApiClient => createApiClient(makeSend('private', cookies().get(ACCESS_COOKIE)?.value));

/** Public read that returns `null` instead of throwing (sections that can hide themselves). */
export const tryPublic = async <T>(fn: (api: ApiClient) => Promise<T>): Promise<T | null> => {
  try {
    return await fn(publicApi);
  } catch {
    return null;
  }
};
