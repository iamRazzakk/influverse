'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { PublicPackage } from '@/types/public';

/**
 * Open / close state of the global "Send Collaboration Offer" modal (components/shared/OfferModal.tsx).
 * Opened from a creator profile's "Send Offer" button and from package cards. Client-only UI state;
 * same behaviour as the old Redux offerModal slice.
 *
 *   const { openOfferModal } = useOfferModal();
 *   openOfferModal({ id, name, handle, avatar, verified, startingPriceCents, packages, packageId });
 */
export interface OfferModalCreator {
  /** Creator's user id (what POST /offers expects). */
  id: string;
  name: string;
  handle: string;
  avatar: string;
  verified: boolean;
  startingPriceCents: number;
  /** The creator's active packages (from GET /creators/:id). */
  packages: PublicPackage[];
  /** Pre-selected package (clicked package card). */
  packageId?: string;
}

interface OfferModalContextValue {
  isOpen: boolean;
  creator: OfferModalCreator | null;
  openOfferModal: (creator: OfferModalCreator) => void;
  closeOfferModal: () => void;
}

const OfferModalContext = createContext<OfferModalContextValue | null>(null);

export function OfferModalProvider({ children }: { children: React.ReactNode }) {
  const [creator, setCreator] = useState<OfferModalCreator | null>(null);

  const openOfferModal = useCallback((c: OfferModalCreator) => setCreator(c), []);
  const closeOfferModal = useCallback(() => setCreator(null), []);

  const value = useMemo(
    () => ({ isOpen: creator !== null, creator, openOfferModal, closeOfferModal }),
    [creator, openOfferModal, closeOfferModal],
  );

  return <OfferModalContext.Provider value={value}>{children}</OfferModalContext.Provider>;
}

export const useOfferModal = (): OfferModalContextValue => {
  const value = useContext(OfferModalContext);
  if (!value) throw new Error('useOfferModal must be used inside <OfferModalProvider>');
  return value;
};
