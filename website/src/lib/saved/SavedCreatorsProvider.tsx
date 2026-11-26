'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { http } from '@/lib/api/client';
import { publicEndpoints } from '@/lib/api/endpoints/public';

/**
 * The logged-in brand's saved-creator ids, shared by every creator card on the page.
 * Search / profile endpoints don't say whether the viewer saved a creator, so the list is loaded
 * ONCE (lazily, the first time a brand's card asks) instead of once per card.
 */
interface SavedCreatorsContextValue {
  savedIds: ReadonlySet<string>;
  /** Load the ids for this brand (no-op if already loaded for the same user). */
  ensureLoaded: (userId: string) => void;
  setSaved: (creatorId: string, saved: boolean) => void;
}

const SavedCreatorsContext = createContext<SavedCreatorsContextValue | null>(null);

export function SavedCreatorsProvider({ children }: { children: React.ReactNode }) {
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(new Set());
  const loadedFor = useRef<string | null>(null);

  const ensureLoaded = useCallback((userId: string) => {
    if (loadedFor.current === userId) return;
    loadedFor.current = userId;
    setSavedIds(new Set());
    publicEndpoints(http)
      .savedCreators({ page: 1, limit: 100 })
      .then((page) => {
        if (loadedFor.current === userId) setSavedIds(new Set(page.items.map((c) => c.id)));
      })
      .catch(() => {
        loadedFor.current = null; // try again next time
      });
  }, []);

  const setSaved = useCallback((creatorId: string, saved: boolean) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (saved) next.add(creatorId);
      else next.delete(creatorId);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ savedIds, ensureLoaded, setSaved }), [savedIds, ensureLoaded, setSaved]);
  return <SavedCreatorsContext.Provider value={value}>{children}</SavedCreatorsContext.Provider>;
}

export const useSavedCreators = (): SavedCreatorsContextValue => {
  const value = useContext(SavedCreatorsContext);
  if (!value) throw new Error('useSavedCreators must be used inside <SavedCreatorsProvider>');
  return value;
};
