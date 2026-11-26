import type { UserRole } from '@/types/api';

/** Where each role lands after login (client + server safe). */
export const homeFor = (role: UserRole, onboardingCompleted: boolean) =>
  onboardingCompleted ? `/${role}/dashboard` : `/${role}/onboarding`;

/**
 * Non-httpOnly hint cookie set by middleware.ts while a refresh cookie exists. It only tells
 * client code "worth asking /me" — it grants nothing. Lets public pages skip /me for guests.
 */
export const HAS_SESSION_COOKIE = 'has_session';

export const hasSessionHint = () =>
  typeof document !== 'undefined' && document.cookie.split('; ').some((c) => c.startsWith(`${HAS_SESSION_COOKIE}=`));

export const setSessionHint = (on: boolean) => {
  if (typeof document === 'undefined') return;
  document.cookie = on
    ? `${HAS_SESSION_COOKIE}=1; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`
    : `${HAS_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
};

/** Only same-site paths for `?next=` (can't redirect to another domain). */
export const safeNextPath = (next: string | null | undefined) =>
  next && next.startsWith('/') && !next.startsWith('//') ? next : null;
