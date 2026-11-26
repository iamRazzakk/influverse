import { baseApi, unwrap, unwrapPage, type ApiEnvelope, type Paginated } from './baseApi';
import type { AdminRole, AdminUser, AuditLogEntry } from '@/types/admin.types';

/**
 * `/admin/team/*` — super admin only (`team.manage`); other roles get 403.
 * `/admin/audit-logs` — needs `settings.manage` (super admin).
 */
export const teamApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getTeam: build.query<AdminUser[], { role?: AdminRole; status?: AdminUser['status']; q?: string } | void>({
      query: (params) => ({ url: '/admin/team', params: params || undefined }),
      transformResponse: (r: ApiEnvelope<AdminUser[]>) => unwrap(r) ?? [],
      providesTags: ['Team'],
    }),
    /** Sends an invitation email; the new admin sets a name + password on /accept-invite. */
    inviteTeamMember: build.mutation<AdminUser, { name: string; email: string; role: AdminRole }>({
      query: (body) => ({ url: '/admin/team/invite', method: 'POST', body }),
      transformResponse: (r: ApiEnvelope<AdminUser>) => unwrap(r),
      invalidatesTags: ['Team'],
    }),
    updateTeamMember: build.mutation<AdminUser, { id: string; name?: string; email?: string; role?: AdminRole }>({
      query: ({ id, ...body }) => ({ url: `/admin/team/${id}`, method: 'PATCH', body }),
      transformResponse: (r: ApiEnvelope<AdminUser>) => unwrap(r),
      invalidatesTags: ['Team'],
    }),
    setTeamMemberStatus: build.mutation<AdminUser, { id: string; action: 'suspend' | 'activate' }>({
      query: ({ id, action }) => ({ url: `/admin/team/${id}/${action}`, method: 'POST' }),
      transformResponse: (r: ApiEnvelope<AdminUser>) => unwrap(r),
      invalidatesTags: ['Team'],
    }),
    resendTeamInvite: build.mutation<void, string>({
      query: (id) => ({ url: `/admin/team/${id}/resend-invite`, method: 'POST' }),
    }),
    removeTeamMember: build.mutation<void, string>({
      query: (id) => ({ url: `/admin/team/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Team'],
    }),

    getAuditLogs: build.query<
      Paginated<AuditLogEntry>,
      { page?: number; limit?: number; adminId?: string; action?: string; targetType?: string } | void
    >({
      query: (params) => ({ url: '/admin/audit-logs', params: { page: 1, limit: 20, ...(params || {}) } }),
      transformResponse: (r: ApiEnvelope<AuditLogEntry[]>) => unwrapPage(r),
      providesTags: ['AuditLogs'],
    }),
  }),
});

export const {
  useGetTeamQuery,
  useInviteTeamMemberMutation,
  useUpdateTeamMemberMutation,
  useSetTeamMemberStatusMutation,
  useResendTeamInviteMutation,
  useRemoveTeamMemberMutation,
  useGetAuditLogsQuery,
} = teamApi;
