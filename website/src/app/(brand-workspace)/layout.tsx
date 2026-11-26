import React from 'react';
import { BrandSidebar } from '@/components/layout/BrandSidebar';
import { WorkspaceShell } from '@/components/layout/WorkspaceShell';
import { requireSession } from '@/lib/session/getSession';
import { AuthProvider } from '@/lib/session/AuthProvider';
import { RealtimeProvider } from '@/lib/realtime/RealtimeProvider';

// The Send Offer modal is mounted once in the root layout (app/layout.tsx); mounting it here too
// would open two modals on brand pages.

/**
 * Server gate: not logged in / wrong role / unverified / onboarding unfinished → redirect
 * (replaces the old client-side AuthGuard, so no loading spinner and no flash of the wrong page).
 */
export default async function BrandWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession({ role: 'brand' });
  return (
    <AuthProvider initialSession={session}>
      <RealtimeProvider>
        <WorkspaceShell sidebar={<BrandSidebar />}>{children}</WorkspaceShell>
      </RealtimeProvider>
    </AuthProvider>
  );
}
