import { publicApi, serverApi } from '@/lib/api/server';
import { profileEndpoints } from '@/lib/api/endpoints/profile';
import { metaEndpoints } from '@/lib/api/endpoints/meta';
import { authEndpoints } from '@/lib/api/endpoints/auth';
import { SettingsView } from './SettingsView';

/**
 * Server page: loads the brand profile, dropdown options (public, cached) and the active sessions in
 * parallel. A failed profile shows the view's "Could not load" state (retry = router.refresh()).
 */
export default async function BrandSettingsPage() {
  const api = serverApi();
  const [profile, meta, sessions] = await Promise.all([
    profileEndpoints(api).getBrand().catch(() => null),
    metaEndpoints(publicApi).options().catch(() => null),
    authEndpoints(api).sessions().catch(() => null),
  ]);

  return <SettingsView profile={profile} meta={meta} sessions={sessions} />;
}
