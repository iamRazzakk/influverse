import React from 'react';
import Image from 'next/image';

/**
 * Drop-in for `<img>` that uses next/image (resized AVIF/WebP + srcset + lazy loading) when the
 * image is on a host next.config.mjs allows, and falls back to a plain `<img>` otherwise
 * (blob:/data: previews, user-typed URLs, unknown hosts) — so an unexpected URL never breaks a page.
 *
 * Layout is unchanged: the same `className` sizes the element (w-full/h-full/object-cover etc.);
 * `width`/`height` only tell next/image which resolutions to generate.
 *
 * Allowed hosts must match next.config.mjs → images.remotePatterns (same env vars):
 *   NEXT_PUBLIC_API_URL (backend /static files) + NEXT_PUBLIC_IMAGE_HOSTS (e.g. the S3/CDN public URL).
 */

const STATIC_HOSTS = ['images.unsplash.com', 'plus.unsplash.com', 'randomuser.me'];

const originOf = (url: string | undefined) => {
  try {
    return url ? new URL(url).host : null;
  } catch {
    return null;
  }
};

const ALLOWED_HOSTS = new Set(
  [
    ...STATIC_HOSTS,
    originOf(process.env.NEXT_PUBLIC_API_URL || 'http://10.10.26.159:9990/api/v1'),
    ...(process.env.NEXT_PUBLIC_IMAGE_HOSTS || '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean)
      .map((h) => (h.includes('://') ? originOf(h) : h)),
  ].filter((h): h is string => Boolean(h)),
);

const canOptimize = (src: string) => {
  // Files from /public (e.g. /images/hero.jpg) need no host config.
  if (src.startsWith('/') && !src.startsWith('//')) return true;
  if (!/^https?:\/\//.test(src)) return false;
  const host = originOf(src);
  return host !== null && ALLOWED_HOSTS.has(host);
};

interface RemoteImageProps {
  /** Missing src renders a plain <img> without src, exactly like `<img src={undefined}>` did. */
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** Largest rendered size in CSS px (srcset upper bound). Default 800. */
  width?: number;
  height?: number;
  /** Responsive hint, e.g. "(min-width: 1024px) 25vw, 50vw". Default: 100vw. */
  sizes?: string;
  /** Above-the-fold / LCP image: load eagerly with high priority. */
  priority?: boolean;
}

export function RemoteImage({ src, alt, className, width = 800, height = 800, sizes, priority = false }: RemoteImageProps) {
  if (!src || !canOptimize(src)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src ?? undefined} alt={alt} className={className} loading={priority ? 'eager' : 'lazy'} decoding="async" />;
  }
  return (
    <Image
      src={src}
      alt={alt}
      className={className}
      width={width}
      height={height}
      sizes={sizes ?? '100vw'}
      priority={priority}
    />
  );
}
