'use client';

import React from 'react';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { EmptyState } from '@/components/shared/EmptyState';

/**
 * Workspace page whose data API is not built yet (orders, chat, payments — server Phases 3–4).
 * Shows the normal page header and a clean empty state instead of mock data.
 */
export function WorkspaceEmptyPage({
  title,
  subtitle,
  backHref,
  icon,
  emptyTitle,
  emptyDescription,
  action,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  icon: React.ReactNode;
  emptyTitle: string;
  emptyDescription: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="min-h-screen pb-16 font-sans">
      <WorkspaceHeader title={title} subtitle={subtitle} backHref={backHref} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="bg-white rounded-xl p-6 sm:p-12 border border-[#E7E7E2] shadow-2xs">
          <EmptyState
            color="neutral"
            icon={icon}
            title={emptyTitle}
            description={emptyDescription}
            primaryAction={action}
            variant="plain"
          />
        </div>
      </div>
    </div>
  );
}
