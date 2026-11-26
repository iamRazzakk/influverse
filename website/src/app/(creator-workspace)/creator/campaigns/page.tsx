import { serverApi } from '@/lib/api/server';
import { loadCampaignSources } from '@/components/shared/useCampaignRows';
import { CampaignsView } from './CampaignsView';

/**
 * Server page: loads pending brand offers, sent offers and orders (GET /offers, GET /orders) in parallel.
 * Status tabs and search filter the loaded rows in the browser. Accept / decline → router.refresh().
 */
export default async function CreatorCampaignsPage() {
  const sources = await loadCampaignSources(serverApi(), 'creator');
  return <CampaignsView sources={sources} />;
}
