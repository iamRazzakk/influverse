'use client';

import React, { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';

/**
 * Body of every route-group `error.tsx`. A render/data error shows this card with "Try again"
 * (re-runs the segment via `reset()`) instead of a blank page. Uses the existing EmptyState design.
 */
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Shows up in the browser console / server logs with the digest Next.js assigns.
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <div className="bg-white rounded-3xl p-6 sm:p-12 border border-[#E7E7E2] shadow-2xs">
        <EmptyState
          color="neutral"
          icon={<AlertTriangle className="w-8 h-8" />}
          title="Something went wrong"
          description="We couldn't load this page. Please try again in a moment."
          primaryAction={{ label: 'Try again', onClick: reset }}
          secondaryAction={{ label: 'Go to homepage', href: '/' }}
          variant="plain"
        />
      </div>
    </div>
  );
}
