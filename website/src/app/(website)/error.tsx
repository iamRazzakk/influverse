'use client';

import { RouteError } from '@/components/shared/RouteError';

/** Catches render / data errors in this route group (shows a retry card instead of a blank page). */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} />;
}
