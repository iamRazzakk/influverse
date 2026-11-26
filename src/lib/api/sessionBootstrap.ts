import { store } from '@/store';
import { signedIn, signedOut } from '@/store/slices/authSlice';
import { API_URL, type ApiEnvelope } from './baseApi';
import type { AdminUser } from '@/types/admin.types';

/**
 * Runs once when the dashboard opens. The access token is kept only in memory, so after a page
 * reload we use the httpOnly refresh cookie to get a new one, then load the admin profile.
 */
export const restoreSession = async () => {
  try {
    const refresh = await fetch(`${API_URL}/admin/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!refresh.ok) throw new Error('no session');
    const { data } = (await refresh.json()) as ApiEnvelope<{ accessToken: string }>;

    const me = await fetch(`${API_URL}/admin/auth/me`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${data.accessToken}` },
    });
    if (!me.ok) throw new Error('profile failed');
    const { data: admin } = (await me.json()) as ApiEnvelope<AdminUser>;

    store.dispatch(signedIn({ accessToken: data.accessToken, admin }));
  } catch {
    store.dispatch(signedOut());
  }
};
