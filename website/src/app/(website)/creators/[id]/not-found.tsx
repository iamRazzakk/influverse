'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { http } from '@/lib/api/client';
import { publicEndpoints } from '@/lib/api/endpoints/public';
import { useRequest } from '@/lib/hooks/useRequest';
import { useAuth } from '@/lib/session/AuthProvider';
import { CreatorProfileSkeleton } from '@/components/shared/Skeleton';
import { CreatorProfileView } from './CreatorProfileView';
import { CreatorUnavailable } from './CreatorUnavailable';

/**
 * The public (cached, token-less) request found no approved creator → 404.
 *
 * One exception kept from the old client page: a creator previewing their OWN profile before approval.
 * The API returns it to its owner, so for a logged-in creator we retry once in the browser (with the
 * session cookie). Everyone else sees the "Profile Unavailable" screen.
 */
export default function CreatorNotFound() {
  const params = useParams();
  const raw = (params?.id as string) ?? '';
  let creatorId = raw;
  try {
    creatorId = decodeURIComponent(raw);
  } catch {
    // keep the raw value
  }

  const { status, currentUser } = useAuth();
  const isCreator = status === 'authenticated' && currentUser?.role === 'creator';

  const { data: detail, error } = useRequest(
    () => publicEndpoints(http).creator(creatorId),
    [creatorId],
    { skip: !isCreator || !creatorId },
  );

  // Skeleton while the session loads, and while a creator's own-profile retry is in flight.
  if (status === 'checking' || (isCreator && !detail && !error)) {
    return <CreatorProfileSkeleton />;
  }
  if (detail) return <CreatorProfileView detail={detail} creatorId={creatorId} />;
  return <CreatorUnavailable creatorId={creatorId} />;
}
