'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toApiError } from '@/lib/api/client';
import type { ApiError } from '@/lib/api/core';

interface Options<R> {
  /** Re-render the current server page after success (fresh data). Default true. */
  refresh?: boolean;
  onSuccess?: (result: R) => void;
  onError?: (error: ApiError) => void;
}

/**
 * Runs one write request with local loading/error state. No global store.
 * On success it calls `router.refresh()`, so Server Components re-fetch and show the new data.
 *
 *   const approve = useMutation((id: string) => ordersEndpoints(http).approve(id));
 *   <Button loading={approve.loading} onClick={() => approve.run(order.id)} />
 *
 * `run` re-throws, so callers can `await` it inside try/catch when they need to.
 * Use `runSafe` to get `undefined` on error instead (the error is in `error`).
 */
export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>, options: Options<R> = {}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Latest fn/options without re-creating `run` on every render.
  const fnRef = useRef(fn);
  const optionsRef = useRef(options);
  fnRef.current = fn;
  optionsRef.current = options;

  const run = useCallback(
    async (...args: A): Promise<R> => {
      setLoading(true);
      setError(null);
      try {
        const result = await fnRef.current(...args);
        if (optionsRef.current.refresh !== false) router.refresh();
        optionsRef.current.onSuccess?.(result);
        return result;
      } catch (e) {
        const apiError = toApiError(e);
        setError(apiError);
        optionsRef.current.onError?.(apiError);
        throw apiError;
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  const runSafe = useCallback(
    async (...args: A): Promise<R | undefined> => {
      try {
        return await run(...args);
      } catch {
        return undefined;
      }
    },
    [run],
  );

  const reset = useCallback(() => setError(null), []);

  return { run, runSafe, loading, error, reset };
}
