'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toApiError } from '@/lib/api/client';
import type { ApiError } from '@/lib/api/core';

interface Options<T> {
  /** Don't run until this is false (e.g. waiting for an id). */
  skip?: boolean;
  /** Initial value, usually data the server already rendered. If set, the first fetch is skipped. */
  initialData?: T;
  /** Refetch every N ms while mounted (only where no socket event exists). */
  pollMs?: number;
}

/**
 * Browser read for the FEW cases the server can't render: live chat, typeahead, polling.
 * Most reads belong in Server Components; don't use this for normal page data.
 *
 *   const { data, loading, error, refetch } = useRequest(
 *     (signal) => chatEndpoints(http).messages(id, { signal }), [id], { skip: !id },
 *   );
 *
 * `deps` work like useEffect deps: the request re-runs when they change; stale responses are aborted.
 */
export function useRequest<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList,
  { skip = false, initialData, pollMs }: Options<T> = {},
) {
  const [data, setData] = useState<T | undefined>(initialData);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!skip && initialData === undefined);

  const fnRef = useRef(fn);
  fnRef.current = fn;
  const controllerRef = useRef<AbortController | null>(null);
  const skipFirst = useRef(initialData !== undefined);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current(controller.signal);
      if (!controller.signal.aborted) setData(result);
    } catch (e) {
      if (!controller.signal.aborted) setError(toApiError(e));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (skip) return;
    if (skipFirst.current) {
      skipFirst.current = false;
    } else {
      void load();
    }
    const timer = pollMs ? setInterval(() => void load(), pollMs) : undefined;
    return () => {
      if (timer) clearInterval(timer);
      controllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, pollMs, load, ...deps]);

  return { data, setData, error, loading, refetch: load };
}
