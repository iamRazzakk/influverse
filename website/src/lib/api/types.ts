/**
 * Shared API types. Imported by both the server transport (lib/api/server.ts) and the browser
 * transport (lib/api/client.ts), so this file must stay free of React, Next and axios imports.
 */

/** Every server response looks like this (server/src/shared/sendResponse.ts). */
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

/** List endpoints return rows + pagination meta. */
export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

/** One field error from the server's validation layer (`errorMessages`). */
export interface FieldError {
  path: string;
  message: string;
}

/** Query-string values. `undefined`, `null` and `''` are dropped; arrays become `a,b,c`. */
export type QueryParams = Record<string, string | number | boolean | null | undefined | ReadonlyArray<string | number>>;

export interface RequestOptions {
  params?: QueryParams;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Server only: Next.js cache tags (public reads through `publicApi`). */
  tags?: string[];
  /** Server only: seconds before the cached response is refetched (public reads). */
  revalidate?: number | false;
  /** Browser only: upload progress 0–100. */
  onUploadProgress?: (percent: number) => void;
  /**
   * Browser only. Default true: when the session can't be renewed, go to /login.
   * Set false for "am I logged in?" checks on public pages (a guest just gets the 401).
   */
  authRedirect?: boolean;
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** What a transport must implement: send one request, return the parsed envelope or throw ApiError. */
export type SendFn = (
  method: HttpMethod,
  path: string,
  body: unknown,
  options: RequestOptions,
) => Promise<ApiEnvelope<unknown>>;

/**
 * Transport-agnostic client used by every `endpoints/*` file.
 * The same endpoint function runs on the server (fetch + cookie token) or in the browser (axios).
 */
export interface ApiClient {
  /** `data` of the envelope. */
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  /** `data` (rows) + `meta` of a list endpoint. */
  getPage<T>(path: string, options?: RequestOptions): Promise<Paginated<T>>;
  post<T = void>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T = void>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  put<T = void>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  delete<T = void>(path: string, options?: RequestOptions): Promise<T>;
  /** Full envelope, for endpoints whose useful output is `message` (e.g. forgot-password). */
  raw<T>(method: HttpMethod, path: string, body?: unknown, options?: RequestOptions): Promise<ApiEnvelope<T>>;
}
