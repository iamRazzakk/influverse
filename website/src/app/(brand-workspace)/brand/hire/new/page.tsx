import { publicApi } from '@/lib/api/server';
import { publicEndpoints } from '@/lib/api/endpoints/public';
import { HireNewView } from './HireNewView';

/**
 * Server page: `?creator=<handle or id>&package=<id>` (set by the "Hire" buttons on the creator
 * profile). Loads that creator's public profile + packages before render; no creator → empty picker.
 */
export default async function NewHireCampaignPage({
  searchParams,
}: {
  searchParams: { creator?: string; creatorId?: string; package?: string; packageId?: string };
}) {
  const creatorParam = searchParams.creator || searchParams.creatorId || '';
  const packageParam = searchParams.package || searchParams.packageId || null;
  const creatorDetail = creatorParam
    ? await publicEndpoints(publicApi).creator(creatorParam).catch(() => null)
    : null;

  return <HireNewView creatorParam={creatorParam} packageParam={packageParam} creatorDetail={creatorDetail} />;
}
