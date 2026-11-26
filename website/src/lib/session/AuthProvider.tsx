'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { http } from '@/lib/api/client';
import { authEndpoints } from '@/lib/api/endpoints/auth';
import { meEndpoints } from '@/lib/api/endpoints/me';
import { hasSessionHint, setSessionHint } from './routes';
import type { AuthStatus, Session } from './types';
import type { AuthUser, BrandProfile, CreatorProfile, UserRole } from '@/types/api';

/**
 * Who is logged in, for client components. NOT a store: it is a read-only view of the session.
 *
 * Two ways it gets filled:
 *  - Workspace layouts (server) pass `initialSession` from `requireSession()`. `reload()` then calls
 *    `router.refresh()` so the server layout re-reads it.
 *  - Root layout (public / auth / onboarding pages, which stay static) has no initial value; it asks
 *    `/me` in the browser, only when the `has_session` hint cookie says a session may exist.
 *
 * `useAuth()` returns the same fields the old Redux `state.auth` had.
 */
export interface AuthContextValue {
  status: AuthStatus;
  isAuthenticated: boolean;
  currentUser: AuthUser | null;
  profile: BrandProfile | CreatorProfile | null;
  activeRole: UserRole;
  /** Re-reads /me (after login, profile edits, onboarding). Resolves with the new session or null. */
  reload: () => Promise<Session | null>;
  /** Logs out on the server (clears cookies) and locally. Navigation is up to the caller. */
  signOut: (allDevices?: boolean) => Promise<void>;
  /** Internal: `useAuth()` calls this so the browser-loaded provider only fetches /me when someone reads it. */
  request: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  initialSession,
  children,
}: {
  /** From the server (workspace layouts). `undefined` = load in the browser. */
  initialSession?: Session | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const serverManaged = initialSession !== undefined;
  const [session, setSession] = useState<Session | null>(initialSession ?? null);
  const [status, setStatus] = useState<AuthStatus>(
    serverManaged ? (initialSession ? 'authenticated' : 'guest') : 'checking',
  );

  // Server re-rendered the layout (router.refresh) → take the new value.
  useEffect(() => {
    if (!serverManaged) return;
    setSession(initialSession ?? null);
    setStatus(initialSession ? 'authenticated' : 'guest');
  }, [serverManaged, initialSession]);

  // Silent: a guest gets null, never a redirect to /login.
  const fetchMe = useCallback(async (): Promise<Session | null> => {
    try {
      return await meEndpoints(http).get({ authRedirect: false });
    } catch {
      return null;
    }
  }, []);

  const reload = useCallback(async () => {
    const me = await fetchMe();
    setSession(me);
    setStatus(me ? 'authenticated' : 'guest');
    setSessionHint(Boolean(me));
    if (serverManaged) router.refresh();
    return me;
  }, [fetchMe, router, serverManaged]);

  // Browser-loaded mode: ask /me once, the first time a component reads the session (lazy, so the
  // root provider stays idle inside workspaces, where the nested server-managed provider answers).
  const [wanted, setWanted] = useState(false);
  const request = useCallback(() => setWanted(true), []);
  const started = useRef(false);
  useEffect(() => {
    if (serverManaged || !wanted || started.current) return;
    started.current = true;
    if (!hasSessionHint()) {
      setStatus('guest');
      return;
    }
    void fetchMe().then((me) => {
      setSession(me);
      setStatus(me ? 'authenticated' : 'guest');
      if (!me) setSessionHint(false);
    });
  }, [serverManaged, wanted, fetchMe]);

  const signOut = useCallback(async (allDevices = false) => {
    try {
      await authEndpoints(http).logout(allDevices);
    } catch {
      /* session may already be gone — sign out locally anyway */
    }
    setSession(null);
    setStatus('guest');
    setSessionHint(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      isAuthenticated: status === 'authenticated' && Boolean(session),
      currentUser: session?.user ?? null,
      profile: session?.profile ?? null,
      activeRole: session?.user.role ?? 'brand',
      reload,
      signOut,
      request,
    }),
    [status, session, reload, signOut, request],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** The nearest session (workspace layout's server value wins over the root's browser value). */
export const useAuth = (): AuthContextValue => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  const { request } = value;
  useEffect(() => request(), [request]);
  return value;
};
