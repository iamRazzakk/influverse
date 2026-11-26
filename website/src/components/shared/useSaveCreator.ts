'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { message } from 'antd';
import { http } from '@/lib/api/client';
import { getErrorMessage } from '@/lib/api/errors';
import { publicEndpoints } from '@/lib/api/endpoints/public';
import { useAuth } from '@/lib/session/AuthProvider';
import { useSavedCreators } from '@/lib/saved/SavedCreatorsProvider';

/**
 * Save / bookmark state for creator cards and the public profile.
 *
 * Saved ids come from the shared SavedCreatorsProvider (one request per page, not per card).
 * - guest  → clicking save sends them to /login?next=<this page>
 * - creator → `canSave` is false, the button is hidden
 */
export function useSaveCreator() {
  const router = useRouter();
  const pathname = usePathname();
  const { status, currentUser } = useAuth();
  const isBrand = status === 'authenticated' && currentUser?.role === 'brand';
  const isGuest = status !== 'authenticated';

  const { savedIds, ensureLoaded, setSaved } = useSavedCreators();
  const userId = currentUser?.id;
  useEffect(() => {
    if (isBrand && userId) ensureLoaded(userId);
  }, [isBrand, userId, ensureLoaded]);

  const [busy, setBusy] = useState(false);

  const toggle = async (creatorId: string) => {
    if (!isBrand) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setBusy(true);
    try {
      if (savedIds.has(creatorId)) {
        await publicEndpoints(http).unsaveCreator(creatorId);
        setSaved(creatorId, false);
        message.success('Removed from saved creators');
      } else {
        await publicEndpoints(http).saveCreator(creatorId);
        setSaved(creatorId, true);
        message.success('Creator saved');
      }
      // The Shortlist page is server-rendered: re-fetch it so the removed card disappears.
      if (pathname.startsWith('/brand/saved')) router.refresh();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return {
    /** Show the save button to guests (to prompt login) and brands, not to creators. */
    canSave: isBrand || isGuest,
    isSaved: (creatorId: string) => savedIds.has(creatorId),
    toggle,
    busy,
  };
}
