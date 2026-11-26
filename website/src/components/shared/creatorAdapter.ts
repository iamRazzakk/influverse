import type { Creator, CreatorPackage, CreatorPhoto, CreatorPlatformInfo, PlatformType, PortfolioItem } from '@/types';
import type { PublicCreatorDetail, PublicGalleryPhoto, PublicPackage, PublicPortfolioItem } from '@/types/public';
import { avatarFallback, formatCount, formatLocation } from './creatorFormat';

/**
 * Maps GET /creators/:idOrHandle into the `Creator` view shape the profile / hire screens were
 * built with, so those screens render API data without rewriting their markup.
 * Money: server cents → euros. Reviews come from completed orders (server: creator.search.service).
 */

const seconds = (total?: number) => {
  if (!total) return undefined;
  const m = Math.floor(total / 60);
  const s = Math.round(total % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const monthYear = (iso?: string) =>
  iso ? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(iso)) : undefined;

export const toLegacyPackage = (pkg: PublicPackage): CreatorPackage => {
  const platforms = (pkg.platforms ?? []) as PlatformType[];
  return {
    id: pkg.id,
    platform: platforms.length > 1 ? 'multi' : platforms[0] ?? 'instagram',
    platforms,
    title: pkg.title,
    type: pkg.type as CreatorPackage['type'],
    description: pkg.description ?? '',
    priceEur: pkg.priceCents / 100,
    deliveryDays: pkg.deliveryDays,
    revisions: pkg.revisions,
    inclusions: pkg.inclusions ?? [],
    popular: pkg.popular,
    usageRights: pkg.usageRights,
  };
};

export const toLegacyPortfolioItem = (item: PublicPortfolioItem): PortfolioItem => {
  const isVideo = item.mediaType === 'video';
  const platforms = (item.platforms ?? []) as PlatformType[];
  const metrics = item.metrics;
  return {
    id: item.id,
    brandName: item.brandName || 'Personal Work',
    brandLogo: item.brandLogo,
    campaignTitle: item.title,
    mediaType: item.mediaType,
    // Videos show their thumbnail in the grid and play `videoPreviewUrl` in the modal.
    mediaUrl: isVideo ? item.thumbnailUrl || item.media.url : item.media.url,
    videoPreviewUrl: isVideo ? item.media.url : undefined,
    views: metrics?.views ? formatCount(metrics.views) : undefined,
    likes: metrics?.likes ? formatCount(metrics.likes) : undefined,
    comments: metrics?.comments ? formatCount(metrics.comments) : undefined,
    shares: metrics?.shares ? formatCount(metrics.shares) : undefined,
    engagementRate: metrics?.engagementRate ? `${metrics.engagementRate}%` : undefined,
    duration: seconds(item.durationSec),
    aspectRatio: (['9:16', '16:9', '1:1'].includes(item.aspectRatio ?? '') ? item.aspectRatio : undefined) as PortfolioItem['aspectRatio'],
    platform: platforms[0] ?? 'ugc',
    platforms,
    deliverableType: item.deliverableType,
    description: item.description,
    completedDate: monthYear(item.completedDate),
  };
};

export const toLegacyPhoto = (photo: PublicGalleryPhoto): CreatorPhoto => ({
  id: photo.id,
  url: photo.photo.url,
  caption: photo.caption ?? '',
  category: photo.category,
  aspectRatio: photo.aspectRatio,
  location: photo.location,
  tags: photo.tags,
});

export const toLegacyCreator = (detail: PublicCreatorDetail): Creator => {
  const p = detail.profile;
  const platforms: Creator['platforms'] = {};
  for (const stats of p.platforms ?? []) {
    const info: CreatorPlatformInfo = {
      followers: stats.followers,
      followersFormatted: stats.followersFormatted,
      handle: stats.handle,
      engagementRate: `${stats.engagementRate ?? 0}%`,
      avgViews: formatCount(stats.avgViews),
      url: stats.url ?? undefined,
    };
    platforms[stats.platform] = info;
  }
  if (p.ugc?.enabled) {
    const days = p.ugc.avgDeliveryDays ? `${p.ugc.avgDeliveryDays} days` : '—';
    platforms.ugc = { avgDelivery: days, turnaround: days };
  }

  return {
    id: p.id,
    name: p.name,
    handle: p.handle,
    avatar: p.avatar || avatarFallback(p.name),
    coverImage: p.coverImage ?? undefined,
    bio: p.bio ?? '',
    location: formatLocation(p.city, p.country),
    verified: p.verified,
    categories: p.categories ?? [],
    tags: p.tags ?? [],
    gender: p.gender,
    platforms,
    startingPriceEur: (p.startingPriceCents ?? 0) / 100,
    rating: p.rating ?? 0,
    reviewsCount: p.reviewsCount ?? 0,
    totalCollaborations: p.totalCollaborations ?? 0,
    packages: detail.packages.map(toLegacyPackage),
    portfolio: detail.portfolio.map(toLegacyPortfolioItem),
    photos: detail.gallery.map(toLegacyPhoto),
    aestheticVibe: p.aestheticVibe,
    languages: p.languages ?? [],
    collaborationPreferences: p.collaborationPreferences ?? [],
    city: p.city,
    country: p.country,
    audience: {
      topCountries: p.audience?.topCountries ?? [],
      genderSplit: { female: p.audience?.genderSplit?.female ?? 0, male: p.audience?.genderSplit?.male ?? 0 },
      topAgeGroup: p.audience?.topAgeGroup ?? '',
    },
    reviews: (detail.reviews ?? []).map((r) => ({
      id: r.id,
      brandName: r.brandName,
      brandLogo: r.brandLogo ?? '',
      rating: r.rating,
      comment: r.comment,
      campaignName: r.campaignName,
      date: new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    })),
  };
};
