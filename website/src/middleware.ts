import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, BACKEND_URL, REFRESH_COOKIE } from '@/lib/api/core';
import { HAS_SESSION_COOKIE } from '@/lib/session/routes';

/**
 * Runs before every page render (Edge runtime).
 *
 * 1. Session refresh: if the `at` cookie is missing or expires within 60s and an `rt` cookie exists,
 *    call the backend's /auth/refresh and
 *      - forward the new Set-Cookie headers to the browser, and
 *      - put the new cookies on THIS request, so Server Components already see the fresh token.
 *    If the refresh token is rejected, both cookies are deleted (the page then sees "logged out").
 * 2. Adds `x-pathname`, so `requireSession()` can build `/login?next=<path>`.
 * 3. Keeps the non-httpOnly `has_session` hint in sync with the refresh cookie, so static public
 *    pages only ask /me in the browser when a session may exist.
 *
 * API calls (`/api/*`), Next internals and static files are excluded by the matcher; browser API
 * calls refresh themselves through the axios 401 interceptor.
 */

const REFRESH_EARLY_SEC = 60;

/** `exp` (seconds) from a JWT without verifying it. Verification happens on the backend. */
const jwtExp = (token: string | undefined): number | null => {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
};

const needsRefresh = (accessToken: string | undefined) => {
  const exp = jwtExp(accessToken);
  return exp === null || exp - Date.now() / 1000 < REFRESH_EARLY_SEC;
};

/** All Set-Cookie headers (Expires dates contain commas, so a plain split is not safe). */
const readSetCookies = (headers: Headers): string[] => {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetter.getSetCookie === 'function') return withGetter.getSetCookie();
  const joined = headers.get('set-cookie');
  return joined ? joined.split(/,(?=\s*[A-Za-z0-9_-]+=)/).map((c) => c.trim()) : [];
};

/** Rebuilds the request Cookie header with new values (empty value = cookie removed). */
const rewriteCookieHeader = (current: string, updates: Record<string, string>) => {
  const jar = new Map<string, string>();
  for (const part of current.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) jar.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  for (const [name, value] of Object.entries(updates)) {
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
  return Array.from(jar, ([k, v]) => `${k}=${v}`).join('; ');
};

type RefreshResult =
  | { kind: 'ok'; setCookies: string[]; values: Record<string, string> }
  | { kind: 'rejected' }
  | { kind: 'unavailable' };

const refresh = async (request: NextRequest, refreshToken: string): Promise<RefreshResult> => {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        Cookie: `${REFRESH_COOKIE}=${refreshToken}`,
        Accept: 'application/json',
        ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}),
        ...(request.headers.get('user-agent') ? { 'User-Agent': request.headers.get('user-agent')! } : {}),
      },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) return { kind: 'rejected' };
    if (!res.ok) return { kind: 'unavailable' };

    const setCookies = readSetCookies(res.headers);
    const values: Record<string, string> = {};
    for (const cookie of setCookies) {
      const [pair] = cookie.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      // Skip the "clear legacy path" cookie (empty value); keep the real new values.
      if ((name === ACCESS_COOKIE || name === REFRESH_COOKIE) && value) values[name] = value;
    }
    return values[ACCESS_COOKIE] ? { kind: 'ok', setCookies, values } : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
};

const HINT_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Logged-in-only areas. Note `/brand` vs `/brands/<slug>` and `/creator` vs `/creators/<handle>`:
 * the plural routes are public profiles and must NOT match.
 */
const PROTECTED = /^\/(brand|creator)(\/|$)/;
const isProtectedPath = (pathname: string) => PROTECTED.test(pathname);

/** Sets / removes the `has_session` hint only when it is out of sync (no header churn). */
const syncHint = (request: NextRequest, response: NextResponse, on: boolean) => {
  const present = request.cookies.has(HAS_SESSION_COOKIE);
  if (on && !present) {
    response.cookies.set(HAS_SESSION_COOKIE, '1', { path: '/', sameSite: 'lax', maxAge: HINT_MAX_AGE });
  } else if (!on && present) {
    response.cookies.delete(HAS_SESSION_COOKIE);
  }
  return response;
};

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname + request.nextUrl.search);

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  // Guests on a protected page → real 307 to login (no streamed render / loading flash).
  // Only a cheap "has any session cookie" check; requireSession() still verifies everything.
  if (!accessToken && !refreshToken && isProtectedPath(request.nextUrl.pathname)) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
    return syncHint(request, NextResponse.redirect(login), false);
  }

  if (!refreshToken || !needsRefresh(accessToken)) {
    return syncHint(request, NextResponse.next({ request: { headers: requestHeaders } }), Boolean(refreshToken));
  }

  const result = await refresh(request, refreshToken);

  if (result.kind === 'ok') {
    requestHeaders.set('cookie', rewriteCookieHeader(request.headers.get('cookie') ?? '', result.values));
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    for (const cookie of result.setCookies) response.headers.append('set-cookie', cookie);
    return syncHint(request, response, true);
  }

  if (result.kind === 'rejected') {
    requestHeaders.set(
      'cookie',
      rewriteCookieHeader(request.headers.get('cookie') ?? '', { [ACCESS_COOKIE]: '', [REFRESH_COOKIE]: '' }),
    );
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
    return syncHint(request, response, false);
  }

  // Backend unreachable: render with what we have; the page shows its own error state.
  return syncHint(request, NextResponse.next({ request: { headers: requestHeaders } }), true);
}

export const config = {
  // Pages only: skip API proxy, Next internals and files with an extension (images, fonts, etc.).
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)'],
};
