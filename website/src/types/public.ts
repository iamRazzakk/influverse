/**
 * Shapes of public API data (server creator.mapper.ts, creator.search.service.ts, cms.service.ts,
 * brand.service.ts, saved.service.ts). Kept free of client code so Server Components can import it.
 * Money is integer cents.
 */
import type { SocialPlatform } from './api';

export interface CreatorCardPlatform {
  platform: SocialPlatform;
  handle: string;
  url: string | null;
  followers: number;
  followersFormatted: string;
  engagementRate: number;
  avgViews: number;
}

/** Compact creator card used by search, featured and saved lists. `id` is the creator's user id. */
export interface CreatorCardData {
  id: string;
  handle: string;
  name: string;
  avatar: string | null;
  coverImage: string | null;
  country?: string;
  city?: string;
  categories: string[];
  platforms: CreatorCardPlatform[];
  followersTotal: number;
  followersFormatted: string;
  startingPriceCents: number;
  rating: number;
  reviewsCount: number;
  totalCollaborations: number;
  verified: boolean;
}

export interface SavedCreatorCard extends CreatorCardData {
  savedAt: string;
  /** false when the creator was suspended / deactivated after being saved */
  available: boolean;
}

export interface CreatorSuggestion {
  id: string;
  handle: string;
  name: string;
  avatar: string | null;
  verified: boolean;
  category: string | null;
}

export interface FileRef {
  fileId?: string;
  url: string;
  name?: string;
  mime?: string;
  size?: number;
}

export interface PublicPackage {
  id: string;
  code: string;
  title: string;
  description?: string;
  platforms: string[];
  type: string;
  priceCents: number;
  deliveryDays: number;
  revisions: number;
  inclusions: string[];
  usageRights: string;
  popular: boolean;
  isActive: boolean;
}

export interface PublicPortfolioItem {
  id: string;
  title: string;
  brandName?: string;
  brandLogo?: string;
  description?: string;
  mediaType: 'image' | 'video';
  media: FileRef;
  thumbnailUrl?: string;
  durationSec?: number;
  /** server ASPECT_RATIOS */
  aspectRatio?: '9:16' | '16:9' | '1:1' | '4:5';
  platforms: string[];
  deliverableType?: string;
  soundTrack?: string;
  metrics?: { views: number; likes: number; comments: number; shares: number; engagementRate: number };
  completedDate?: string;
}

export interface PublicGalleryPhoto {
  id: string;
  photo: FileRef;
  caption?: string;
  category?: string;
  aspectRatio?: 'portrait' | 'landscape' | 'square';
  location?: string;
  tags: string[];
}

/** GET /creators/:idOrHandle */
export interface PublicCreatorDetail {
  profile: CreatorCardData & {
    bio?: string;
    gender?: string;
    languages?: string[];
    tags?: string[];
    collaborationPreferences?: string[];
    aestheticVibe?: string;
    ugc?: { enabled: boolean; avgDeliveryDays?: number };
    audience?: {
      topCountries?: { country: string; percentage: number }[];
      genderSplit?: { female?: number; male?: number };
      topAgeGroup?: string;
    };
    createdAt?: string;
  };
  isSearchable: boolean;
  packages: PublicPackage[];
  portfolio: PublicPortfolioItem[];
  gallery: PublicGalleryPhoto[];
  /** Latest brand reviews from completed orders (newest first, up to 50). */
  reviews?: PublicCreatorReview[];
}

export interface PublicCreatorReview {
  id: string;
  brandName: string;
  brandLogo: string | null;
  rating: number;
  comment: string;
  campaignName: string;
  createdAt: string;
}

/** GET /brands/:slug */
export interface PublicBrand {
  id: string;
  slug: string;
  companyName?: string;
  contactName: string;
  avatar: string | null;
  logo?: string;
  coverImage?: string;
  tagline?: string;
  bio?: string;
  website?: string;
  country?: string;
  city?: string;
  companySize?: string;
  foundedYear?: number;
  industry?: string;
  industryTags?: string[];
  targetPlatforms?: string[];
  verified?: boolean;
  stats?: {
    rating?: number;
    reviewsCount?: number;
    totalCampaigns?: number;
    escrowFundedRate?: number;
    avgResponseHours?: number;
    avgPayoutCents?: number;
    lifetimeSpendCents?: number;
  };
  createdAt?: string;
}

export interface CmsPage {
  id: string;
  slug: string;
  title: string;
  contentMarkdown: string;
  version?: string;
  updatedAt?: string;
}

export interface CmsFaq {
  id: string;
  category: 'brands' | 'creators';
  question: string;
  answer: string;
  order: number;
  translations?: { de?: { question?: string; answer?: string } };
}

export interface PartnerBrand {
  id: string;
  name: string;
  logoUrl: string;
  websiteUrl?: string;
  order: number;
}

export interface SiteSettings {
  logoLightUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  heroHeadline?: string;
  heroSubtitle?: string;
  supportEmail?: string;
  socialLinks?: { platform: 'facebook' | 'instagram' | 'x' | 'linkedin' | 'youtube' | 'tiktok'; url: string }[];
  ticker?: { headline?: string; speedSeconds?: number; pauseOnHover?: boolean; direction?: 'left' | 'right'; isEnabled?: boolean };
}

export type CreatorSort = 'relevance' | 'price_asc' | 'price_desc' | 'followers' | 'rating' | 'newest';

export interface CreatorSearchParams {
  q?: string;
  category?: string;
  platform?: string;
  /** ISO-2 */
  country?: string;
  gender?: string;
  followerRange?: 'nano' | 'micro' | 'macro' | 'mega' | string;
  /** cents */
  minPrice?: number;
  /** cents */
  maxPrice?: number;
  verified?: boolean;
  sort?: CreatorSort;
  page?: number;
  /** max 48 */
  limit?: number;
}
