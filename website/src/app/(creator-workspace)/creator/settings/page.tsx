import { serverApi } from '@/lib/api/server';
import { profileEndpoints } from '@/lib/api/endpoints/profile';
import { authEndpoints } from '@/lib/api/endpoints/auth';
import { SettingsView } from './SettingsView';

/**
 * Server page: loads the creator profile (handle / bio / approval) and the active sessions in parallel.
 * `?tab=` is still read in the view (it also redirects old profile / portfolio tabs).
 */
export default async function CreatorSettingsPage() {
  const api = serverApi();
  const [profile, sessions] = await Promise.all([
    profileEndpoints(api).getCreator().catch(() => null),
    authEndpoints(api).sessions().catch(() => null),
  ]);

  return <SettingsView profile={profile} sessions={sessions} />;
}
