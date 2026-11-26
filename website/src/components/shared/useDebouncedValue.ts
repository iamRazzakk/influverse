'use client';

import { useEffect, useState } from 'react';

/** Returns `value` only after it stopped changing for `delayMs` (used for typeahead / search inputs). */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
