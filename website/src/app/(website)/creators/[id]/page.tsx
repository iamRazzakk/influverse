import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { publicApi } from '@/lib/api/server';
import { publicEndpoints } from '@/lib/api/endpoints/public';
import { ApiError } from '@/lib/api/core';
import { labelize } from '@/components/shared/creatorFormat';
import { CreatorProfileView } from './CreatorProfileView';

type Props = { params: { id: string } };

/** `id` in the URL is a handle (preferred) or the creator's user id — the API accepts both. */
const idOf = (raw: string) => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

/**
 * GET /creators/:idOrHandle through the cached public client (tags `creators`, `creator:<id>`).
 * Shared by generateMetadata and the page; Next dedupes the identical fetch.
 * 404/400 → null (notFound()); other failures throw, so a cached page isn't replaced by a 404.
 */
const loadCreator = (idOrHandle: string) =>
  publicEndpoints(publicApi)
    .creator(idOrHandle)
    .catch((error: unknown) => {
      if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null;
      throw error;
    });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const detail = await loadCreator(idOf(params.id)).catch(() => null);
  if (!detail) return { title: 'Creator not found — Influverse' };

  const p = detail.profile;
  const category = labelize(p.categories?.[0]);
  const title = `${p.name} (@${p.handle})${category ? ` — ${category} Creator` : ''} | Influverse`;
  const description = (
    p.bio ||
    `Hire ${p.name} on Influverse. ${p.followersFormatted ? `${p.followersFormatted} followers. ` : ''}Book packages with 100% escrow protection.`
  ).slice(0, 160);
  const image = p.coverImage || p.avatar || undefined;

  return {
    title,
    description,
    alternates: { canonical: `/creators/${encodeURIComponent(p.handle || p.id)}` },
    openGraph: { title, description, type: 'profile', images: image ? [image] : undefined },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, images: image ? [image] : undefined },
    robots: detail.isSearchable === false ? { index: false } : undefined,
  };
}

/**
 * Public creator profile. Static/ISR: loaded with the token-less public client; no cookies / session.
 * A missing or unapproved creator → not-found.tsx (which still lets a creator preview their own profile).
 */
export default async function CreatorProfilePage({ params }: Props) {
  const creatorId = idOf(params.id);
  const detail = creatorId ? await loadCreator(creatorId) : null;
  if (!detail) notFound();

  return <CreatorProfileView detail={detail} creatorId={creatorId} />;
}
