import { redirect } from 'next/navigation';
import { publicApi, serverApi } from '@/lib/api/server';
import { metaEndpoints } from '@/lib/api/endpoints/meta';
import { profileEndpoints } from '@/lib/api/endpoints/profile';
import { AuthProvider } from '@/lib/session/AuthProvider';
import { requireSession } from '@/lib/session/getSession';
import { homeFor } from '@/lib/session/routes';
import { CreatorOnboardingView } from './CreatorOnboardingView';

/**
 * Server page: only logged-in, verified creators who haven't finished onboarding see the wizard.
 * Already onboarded (opened this URL directly) → dashboard.
 * Loads the saved profile (resume where the creator left off) and the dropdown options before render.
 */
export default async function CreatorOnboardingPage() {
  const session = await requireSession({ role: 'creator', requireOnboarding: false });
  if (session.user.onboardingCompleted) redirect(homeFor(session.user.role, true));

  const [profile, meta] = await Promise.all([
    profileEndpoints(serverApi())
      .getCreator()
      .catch(() => null),
    metaEndpoints(publicApi)
      .options()
      .catch(() => null),
  ]);

  return (
    <AuthProvider initialSession={session}>
      <CreatorOnboardingView profile={profile} meta={meta} />
    </AuthProvider>
  );
}
