import { publicApi, serverApi } from '@/lib/api/server';
import { studioEndpoints } from '@/lib/api/endpoints/studio';
import { metaEndpoints } from '@/lib/api/endpoints/meta';
import { PackagesView } from './PackagesView';

/**
 * Server page: loads the creator's packages (GET /me/packages) and the dropdown options
 * (public, cached) in parallel. A failed packages request → the view's "Couldn't load" state.
 */
export default async function CreatorPackagesPage() {
  const [packages, meta] = await Promise.all([
    studioEndpoints(serverApi()).packages().catch(() => null),
    metaEndpoints(publicApi).options().catch(() => null),
  ]);

  return <PackagesView initialPackages={packages} meta={meta} />;
}
