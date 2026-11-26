import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, ApiError } from '@/lib/api/core';
import { serverApi } from '@/lib/api/server';
import { meEndpoints } from '@/lib/api/endpoints/me';
import { homeFor } from './routes';
import type { Session } from './types';
import type { UserRole } from '@/types/api';

export type { Session };

/**
 * The logged-in user for this request, or `null`. Wrapped in React `cache()`, so the layout and the
 * page can both call it while `/me` is fetched only once per request.
 *
 * middleware.ts has already refreshed an expired `at` cookie before this runs.
 * Calling it makes the route dynamic (reads cookies). Don't use it on static public pages.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  if (!cookies().get(ACCESS_COOKIE)?.value) return null;
  try {
    return await meEndpoints(serverApi()).get();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
    throw error; // backend down etc. → nearest error.tsx
  }
});

/**
 * Gate for protected layouts/pages (replaces the old client-side AuthGuard). Returns the session or redirects:
 *   - not logged in          → /login?next=<current path>
 *   - email not verified     → /verify-email
 *   - wrong role             → that user's own home
 *   - onboarding unfinished  → /<role>/onboarding (unless requireOnboarding is false)
 */
export async function requireSession({
  role,
  requireOnboarding = true,
}: { role?: UserRole; requireOnboarding?: boolean } = {}): Promise<Session> {
  const session = await getSession();
  if (!session) {
    const path = headers().get('x-pathname') ?? '/';
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  const { user } = session;
  if (!user.emailVerified) redirect('/verify-email');
  if (role && user.role !== role) redirect(homeFor(user.role, user.onboardingCompleted));
  if (requireOnboarding && !user.onboardingCompleted) redirect(`/${user.role}/onboarding`);
  return session;
}
