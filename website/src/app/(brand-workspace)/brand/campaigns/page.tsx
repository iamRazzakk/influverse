import { serverApi } from '@/lib/api/server';
import { loadCampaignSources } from '@/components/shared/useCampaignRows';
import { CampaignsView } from './CampaignsView';

/**
 * Server page: loads pending offers, unpaid offers and orders (GET /offers, GET /orders) in parallel.
 * Status tabs and search filter the loaded rows in the browser. A failed list shows the view's
 * "Couldn't load" state (retry = router.refresh()).
 */
export default async function BrandCampaignsPage() {
  const sources = await loadCampaignSources(serverApi(), 'brand');
  return <CampaignsView sources={sources} />;
}
