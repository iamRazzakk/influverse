import { serverApi } from '@/lib/api/server';
import { offersEndpoints } from '@/lib/api/endpoints/offers';
import { OffersView } from './OffersView';

/**
 * Server page: loads the brand offers waiting for this creator's answer before render.
 * A failed request → `null` → the view's "Couldn't load" state.
 */
export default async function CreatorOffersPage() {
  const data = await offersEndpoints(serverApi())
    .list({ box: 'received', status: 'pending', limit: 50 })
    .catch(() => null);

  return <OffersView data={data} />;
}
