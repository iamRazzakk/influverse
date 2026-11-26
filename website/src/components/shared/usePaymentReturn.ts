'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { message } from 'antd';

/**
 * Stripe Checkout sends the brand back with `?payment=held|success|cancelled`.
 * Shows a short message, refreshes the page data (the webhook may land a moment later),
 * and removes the flag from the URL so a reload doesn't repeat it.
 *
 * Default refresh = `router.refresh()` (Server Components re-fetch). Client-state screens
 * (e.g. the chat) can pass their own `onRefresh`.
 */
export function usePaymentReturn(onRefresh?: () => void) {
  const router = useRouter();
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('payment');
    if (!result) return;

    if (result === 'held') message.success('Escrow deposit held — your offer is on its way to the creator. You are only charged when they accept.', 6);
    else if (result === 'success') message.success('Payment received — the escrow is funded and the campaign is starting.', 6);
    else if (result === 'cancelled') message.info('Payment cancelled. Nothing was charged.');

    url.searchParams.delete('payment');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);

    const refresh = () => (refreshRef.current ? refreshRef.current() : router.refresh());
    refresh();
    // Stripe's webhook can arrive a few seconds after the redirect.
    const timers = [2500, 7000].map((ms) => window.setTimeout(refresh, ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [router]);
}
