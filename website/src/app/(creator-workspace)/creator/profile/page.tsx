import { serverApi } from '@/lib/api/server';
import { profileEndpoints } from '@/lib/api/endpoints/profile';
import { studioEndpoints } from '@/lib/api/endpoints/studio';
import { ProfileView } from './ProfileView';

/**
 * Server page: loads everything the profile tabs show in parallel — the creator profile, the
 * gallery (lookbook) and the latest verified-badge request. Failed requests → `null` → each tab's
 * existing error / empty state.
 */
export default async function CreatorProfilePage() {
  const api = serverApi();
  const [profile, gallery, latestVerification] = await Promise.all([
    profileEndpoints(api).getCreator().catch(() => null),
    studioEndpoints(api).gallery().catch(() => null),
    studioEndpoints(api).latestVerification().catch(() => null),
  ]);

  return <ProfileView profile={profile} gallery={gallery} latestVerification={latestVerification} />;
}
