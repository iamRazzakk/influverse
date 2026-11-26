import { baseApi, unwrap, unwrapPage, type ApiEnvelope, type Paginated } from './baseApi';

export interface AdminNotification {
  id: string;
  type: string;
  title: string;
  body?: string;
  /** Dashboard route to open, e.g. `/verification` */
  link?: string;
  readAt?: string | null;
  createdAt: string;
}

/** `/admin/notifications` — the bell in the top bar. Polls every 60s so new items show up. */
export const notificationApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getNotifications: build.query<Paginated<AdminNotification>, { page?: number; limit?: number } | void>({
      query: (params) => ({ url: '/admin/notifications', params: { page: 1, limit: 15, ...(params || {}) } }),
      transformResponse: (r: ApiEnvelope<AdminNotification[]>) => unwrapPage(r),
      providesTags: ['Notifications'],
    }),
    getUnreadNotificationCount: build.query<number, void>({
      query: () => '/admin/notifications/unread-count',
      transformResponse: (r: ApiEnvelope<{ count: number }>) => unwrap(r).count,
      providesTags: ['Notifications'],
    }),
    markNotificationRead: build.mutation<void, string>({
      query: (id) => ({ url: `/admin/notifications/${id}/read`, method: 'POST' }),
      invalidatesTags: ['Notifications'],
    }),
    markAllNotificationsRead: build.mutation<void, void>({
      query: () => ({ url: '/admin/notifications/read-all', method: 'POST' }),
      invalidatesTags: ['Notifications'],
    }),
  }),
});

export const {
  useGetNotificationsQuery,
  useGetUnreadNotificationCountQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} = notificationApi;
