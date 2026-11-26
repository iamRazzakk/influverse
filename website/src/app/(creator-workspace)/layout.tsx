import React from 'react';
import { CreatorSidebar } from '@/components/layout/CreatorSidebar';
import { WorkspaceShell } from '@/components/layout/WorkspaceShell';
import { requireSession } from '@/lib/session/getSession';
import { AuthProvider } from '@/lib/session/AuthProvider';
import { RealtimeProvider } from '@/lib/realtime/RealtimeProvider';

/**
 * Server gate: not logged in / wrong role / unverified / onboarding unfinished → redirect
 * (replaces the old client-side AuthGuard).
 */
export default async function CreatorWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession({ role: 'creator' });
  return (
    <AuthProvider initialSession={session}>
      <RealtimeProvider>
        <WorkspaceShell sidebar={<CreatorSidebar />}>{children}</WorkspaceShell>
      </RealtimeProvider>
    </AuthProvider>
  );
}
