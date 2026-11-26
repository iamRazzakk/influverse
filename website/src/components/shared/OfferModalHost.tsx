'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useOfferModal } from '@/lib/offer/OfferModalProvider';

/**
 * The offer modal's code (~600 lines + form deps) is only downloaded the first time someone opens it.
 * It stays mounted afterwards so antd's close animation and form state behave exactly as before.
 */
const OfferModal = dynamic(() => import('./OfferModal').then((m) => m.OfferModal), { ssr: false });

export function OfferModalHost() {
  const { isOpen } = useOfferModal();
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (isOpen) setOpened(true);
  }, [isOpen]);

  return opened || isOpen ? <OfferModal /> : null;
}
