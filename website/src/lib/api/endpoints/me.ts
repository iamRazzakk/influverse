import type { ApiClient, RequestOptions } from '../types';
import type { AuthUser, MeResponse, NotificationPrefs } from '@/types/api';

/** `/me` — the logged-in account + its brand/creator profile. */
export const meEndpoints = (c: ApiClient) => ({
  get: (options?: RequestOptions) => c.get<MeResponse>('/me', options),
  update: (body: { name?: string; phone?: string | null; avatar?: string | null; preferredLanguage?: 'en' | 'de' }) =>
    c.patch<AuthUser>('/me', body),
  updateNotificationPrefs: (body: Partial<NotificationPrefs>) => c.patch<NotificationPrefs>('/me/notification-prefs', body),
  deactivate: (password: string, reason?: string) => c.post('/me/deactivate', { password, reason }),
  cancelDeactivation: () => c.post('/me/deactivate/cancel'),
});
