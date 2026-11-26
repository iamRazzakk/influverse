import { serverApi } from '@/lib/api/server';
import { ordersEndpoints } from '@/lib/api/endpoints/orders';
import { publicEndpoints } from '@/lib/api/endpoints/public';
import { DashboardView } from './DashboardView';

/**
 * Server page: loads order stats (for `?year=`, default this year), the live orders list and the
 * shortlist preview in parallel. Each failed request just leaves its section empty, as before.
 */
export default async function BrandDashboardPage({ searchParams }: { searchParams: { year?: string } }) {
  const thisYear = new Date().getFullYear();
  const requested = Number(searchParams.year);
  const year = Number.isInteger(requested) && requested > 2000 && requested <= thisYear ? requested : thisYear;

  const api = serverApi();
  const [stats, orderPage, saved] = await Promise.all([
    ordersEndpoints(api).stats(year).catch(() => null),
    ordersEndpoints(api).list({ page: 1, limit: 50 }).catch(() => null),
    publicEndpoints(api).savedCreators({ page: 1, limit: 4 }).catch(() => null),
  ]);

  return <DashboardView stats={stats} year={year} orderPage={orderPage} saved={saved} />;
}
