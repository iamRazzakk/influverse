import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import { baseApi, type ApiEnvelope } from '@/lib/api/baseApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card } from '@/components/ui/Card';
import {
  ShieldCheck,
  Users,
  Euro,
  LifeBuoy,
  ShoppingBag,
  UserCheck,
  Building2,
  TrendingUp,
  ChevronRight,
  FileEdit,
} from 'lucide-react';

/**
 * Overview counts that already exist on the server: we ask a list endpoint for one row
 * and read `meta.total`. Revenue, orders and tickets come with the server's Phase 3–6
 * (orders/payments, support tickets, `daily_stats` rollup + `/admin/stats`).
 */
const overviewApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    overviewTotal: build.query<number, { path: '/admin/users' | '/admin/verifications'; params: Record<string, string> }>({
      query: ({ path, params }) => ({ url: path, params: { ...params, page: 1, limit: 1 } }),
      transformResponse: (r: ApiEnvelope<unknown[]>) => Number(r.meta?.total ?? 0),
      providesTags: ['Users', 'Verifications'],
    }),
  }),
});
const { useOverviewTotalQuery } = overviewApi;

/** Shows "…" while loading and "—" if the count could not be loaded (e.g. missing permission). */
const useCount = (path: '/admin/users' | '/admin/verifications', params: Record<string, string>) => {
  const { data, isLoading, isError } = useOverviewTotalQuery({ path, params });
  if (isLoading) return '…';
  if (isError || data === undefined) return '—';
  return data.toLocaleString();
};

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  const creators = useCount('/admin/users', { role: 'creator' });
  const brands = useCount('/admin/users', { role: 'brand' });
  const pendingApprovals = useCount('/admin/users', { role: 'creator', approval: 'under_review' });
  const pendingVerifications = useCount('/admin/verifications', { status: 'pending' });

  const quickLinks = [
    { label: 'Review creator applications', path: ROUTES.DASHBOARD.USERS, icon: <UserCheck className="w-4 h-4" /> },
    { label: 'Verification requests', path: ROUTES.DASHBOARD.VERIFICATION, icon: <ShieldCheck className="w-4 h-4" /> },
    { label: 'Website content (CMS)', path: ROUTES.DASHBOARD.CMS, icon: <FileEdit className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" subtitle="Marketplace health at a glance." />

      {/* Live counts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Creators" value={creators} icon={<Users className="w-5 h-5" />} accentColor="black" />
        <StatCard title="Brands" value={brands} icon={<Building2 className="w-5 h-5" />} accentColor="pink" />
        <StatCard
          title="Pending Approvals"
          value={pendingApprovals}
          subtitle="Creators waiting for review"
          icon={<UserCheck className="w-5 h-5" />}
          accentColor="amber"
        />
        <StatCard
          title="Pending Verifications"
          value={pendingVerifications}
          subtitle="Blue-badge requests"
          icon={<ShieldCheck className="w-5 h-5" />}
          accentColor="emerald"
        />
      </div>

      {/* Money / orders / support — server phases 3–6 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Gross Volume (GMV)" value="—" subtitle="Available once payments go live" icon={<Euro className="w-5 h-5" />} />
        <StatCard title="Active Orders" value="—" subtitle="Available once orders go live" icon={<ShoppingBag className="w-5 h-5" />} />
        <StatCard title="Open Tickets" value="—" subtitle="Available once support goes live" icon={<LifeBuoy className="w-5 h-5" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <EmptyState
            icon={<TrendingUp className="w-6 h-6" />}
            title="No growth data yet"
            description="User growth and revenue charts appear here once the daily stats rollup is running."
            className="h-full"
          />
        </div>

        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-extrabold text-neutral-900">Quick actions</h3>
          <div className="space-y-2">
            {quickLinks.map((link) => (
              <button
                key={link.path}
                type="button"
                onClick={() => navigate(link.path)}
                className="w-full flex items-center justify-between gap-2 p-3 rounded-xl border border-neutral-200 hover:bg-neutral-50 transition-colors text-left"
              >
                <span className="flex items-center gap-2 text-xs font-bold text-neutral-800">
                  {link.icon}
                  {link.label}
                </span>
                <ChevronRight className="w-4 h-4 text-neutral-400" />
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
