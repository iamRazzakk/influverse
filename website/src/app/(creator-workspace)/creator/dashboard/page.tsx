import { serverApi } from '@/lib/api/server';
import { ordersEndpoints } from '@/lib/api/endpoints/orders';
import { DashboardView } from './DashboardView';

/**
 * Server page: loads the creator's order stats (for the chart's `?year=`) and latest orders in
 * parallel. Session/role/onboarding are checked by the workspace layout, which also re-reads /me
 * on every request (fresh counts + approval status).
 */
export default async function CreatorDashboardPage({ searchParams }: { searchParams: { year?: string } }) {
  const thisYear = new Date().getFullYear();
  const parsed = Number(searchParams.year);
  const year = Number.isInteger(parsed) && parsed > 2000 && parsed <= thisYear ? parsed : thisYear;

  const api = ordersEndpoints(serverApi());
  const [stats, orderPage] = await Promise.all([
    api.stats(year).catch(() => null),
    api.list({ page: 1, limit: 50 }).catch(() => null),
  ]);

  return <DashboardView stats={stats} orderPage={orderPage} selectedYear={year} />;
}
