import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { publicApi } from '@/lib/api/server';
import { publicEndpoints } from '@/lib/api/endpoints/public';
import { ApiError } from '@/lib/api/core';
import { BrandProfileView } from './BrandProfileView';

type Props = { params: { id: string } };

const slugOf = (raw: string) => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

/**
 * GET /brands/:slug through the cached public client (tag `brand:<slug>`). Called by both
 * generateMetadata and the page; Next dedupes the identical fetch.
 * A 404/400 means "no such brand" (→ notFound()); other failures throw so a cached page isn't replaced by a 404.
 */
const loadBrand = (slug: string) =>
  publicEndpoints(publicApi)
    .brand(slug)
    .catch((error: unknown) => {
      if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null;
      throw error;
    });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const brand = await loadBrand(slugOf(params.id)).catch(() => null);
  if (!brand) return { title: 'Brand not found — Influverse' };

  const name = brand.companyName || brand.contactName;
  const description = (brand.tagline || brand.bio || `${name} on Influverse — collaborate with vetted creators.`).slice(0, 160);
  const image = brand.coverImage || brand.logo || brand.avatar || undefined;

  return {
    title: `${name} — Brand on Influverse`,
    description,
    openGraph: { title: name, description, type: 'profile', images: image ? [image] : undefined },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: name, description, images: image ? [image] : undefined },
  };
}

/** Public brand page — GET /brands/:slug (slug or user id). Static/ISR: no cookies or session here. */
export default async function BrandProfilePage({ params }: Props) {
  const slug = slugOf(params.id);
  const brand = slug ? await loadBrand(slug) : null;
  if (!brand) notFound();

  return <BrandProfileView data={brand} />;
}
