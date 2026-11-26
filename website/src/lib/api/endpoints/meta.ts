import type { ApiClient } from '../types';
import type { MetaOptions, Notification } from '@/types/api';

/** Public settings (`GET /settings/public`) — fee %, limits etc. */
export type PublicSettings = Record<string, unknown>;

/** Small shared endpoints: dropdown options, public settings, notifications. */
export const metaEndpoints = (c: ApiClient) => ({
  /** Public and rarely changes: long cache when used with `publicApi`. */
  options: () => c.get<MetaOptions>('/meta/options', { tags: ['meta'], revalidate: 3600 }),
  publicSettings: () => c.get<PublicSettings>('/settings/public', { tags: ['settings'], revalidate: 600 }),

  notifications: (params: { page?: number; limit?: number; unread?: boolean } = {}) =>
    c.getPage<Notification>('/notifications', { params: { page: 1, limit: 20, ...params } }),
  unreadNotificationCount: async () => (await c.get<{ count: number }>('/notifications/unread-count')).count,
  markNotificationRead: (id: string) => c.post(`/notifications/${id}/read`),
  markAllNotificationsRead: () => c.post('/notifications/read-all'),
});
