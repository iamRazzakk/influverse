import type { MeResponse } from '@/types/api';

/** The logged-in account + its brand/creator profile (GET /me). */
export type Session = MeResponse;

export type AuthStatus = 'checking' | 'authenticated' | 'guest';
