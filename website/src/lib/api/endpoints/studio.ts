import type { ApiClient } from '../types';
import { idempotencyKey } from '../core';

/**
 * Creator studio: own packages, portfolio, lookbook (gallery) and verification badge requests.
 * Server: server/src/app/modules/{package,portfolio,verification}. Money is integer cents.
 */

export type PackagePlatform = 'instagram' | 'tiktok' | 'youtube' | 'ugc';
export type UsageRights = 'organic_30d' | 'commercial_60d' | 'commercial_90d' | 'whitelisting_60d' | 'perpetual';

/** Server-side package limits (package.constant.ts). Max count comes from platform settings (default 3). */
export const PACKAGE_LIMITS = {
  maxPackages: 3,
  minPriceCents: 5_000,
  maxPriceCents: 5_000_000,
  minDeliveryDays: 1,
  maxDeliveryDays: 60,
  maxRevisions: 10,
  maxInclusions: 15,
} as const;

export const PORTFOLIO_LIMIT = 30;
export const GALLERY_LIMIT = 60;

export interface CreatorPackage {
  id: string;
  code: string;
  title: string;
  description?: string;
  platforms: PackagePlatform[];
  /** Derived by the server from the platforms. */
  type: string;
  priceCents: number;
  deliveryDays: number;
  revisions: number;
  inclusions: string[];
  usageRights: UsageRights;
  popular: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PackageInput {
  title: string;
  description?: string;
  platforms: PackagePlatform[];
  priceCents: number;
  deliveryDays: number;
  revisions?: number;
  inclusions?: string[];
  usageRights?: UsageRights;
  popular?: boolean;
  isActive?: boolean;
}

export interface FileRef {
  fileId?: string;
  url: string;
  name?: string;
  mime?: string;
  size?: number;
}

export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5';

export interface PortfolioItem {
  id: string;
  title: string;
  brandName?: string;
  brandLogo?: string;
  description?: string;
  mediaType: 'image' | 'video';
  media: FileRef;
  thumbnailUrl?: string;
  durationSec?: number;
  aspectRatio?: AspectRatio;
  platforms: string[];
  deliverableType?: string;
  soundTrack?: string;
  metrics?: { views?: number; likes?: number; comments?: number; shares?: number; engagementRate?: number };
  completedDate?: string;
  packagePriceCents?: number;
  sortOrder: number;
  createdAt: string;
}

/** Body for POST/PATCH /me/portfolio. `fileId` comes from useUploadFile(…, 'portfolio'). */
export type PortfolioInput = {
  fileId: string;
  title: string;
  brandName?: string;
  brandLogo?: string;
  description?: string;
  mediaType?: 'image' | 'video';
  thumbnailUrl?: string;
  durationSec?: number;
  aspectRatio?: AspectRatio;
  platforms?: string[];
  deliverableType?: string;
  soundTrack?: string;
  metrics?: PortfolioItem['metrics'];
  /** ISO date, not in the future */
  completedDate?: string;
  packagePriceCents?: number;
};

export const GALLERY_CATEGORIES = [
  'headshot',
  'lifestyle',
  'modeling',
  'bts',
  'outdoors',
  'studio',
  'editorial',
  'action',
  'photo',
] as const;
export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number];

export interface GalleryPhoto {
  id: string;
  photo: FileRef;
  caption?: string;
  category: GalleryCategory;
  aspectRatio?: 'portrait' | 'landscape' | 'square';
  takenAt?: string;
  location?: string;
  cameraGear?: string;
  tags: string[];
  sortOrder: number;
  createdAt: string;
}

export type GalleryInput = {
  fileId: string;
  caption?: string;
  category?: GalleryCategory;
  aspectRatio?: 'portrait' | 'landscape' | 'square';
  takenAt?: string;
  location?: string;
  cameraGear?: string;
  tags?: string[];
};

export interface VerificationRequest {
  id: string;
  code: string;
  platforms: { instagram?: string; tiktok?: string; youtube?: string };
  primaryPlatform?: 'instagram' | 'tiktok' | 'youtube';
  followersTotal?: number;
  avgViews?: number;
  sampleWork?: { title?: string; url?: string; views?: number; file?: FileRef };
  note?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface VerificationApplyInput {
  platforms: { instagram?: string; tiktok?: string; youtube?: string };
  primaryPlatform?: 'instagram' | 'tiktok' | 'youtube';
  followersTotal?: number;
  avgViews?: number;
  sampleWork?: { title?: string; url?: string; views?: number; fileId?: string };
  note?: string;
}

const idem = () => ({ headers: { 'Idempotency-Key': idempotencyKey() } });

/** Creator studio: own packages, portfolio, lookbook (gallery) and verification badge requests. */
export const studioEndpoints = (c: ApiClient) => ({
  // ---- packages (/me/packages) ----
  packages: () => c.get<CreatorPackage[]>('/me/packages'),
  createPackage: (body: PackageInput) => c.post<CreatorPackage>('/me/packages', body, idem()),
  /** Also used for the active/inactive toggle: `{ id, isActive: false }`. */
  updatePackage: ({ id, ...body }: { id: string } & Partial<PackageInput>) => c.patch<CreatorPackage>(`/me/packages/${id}`, body),
  deletePackage: (id: string) => c.delete(`/me/packages/${id}`),
  duplicatePackage: (id: string) => c.post<CreatorPackage>(`/me/packages/${id}/duplicate`),
  reorderPackages: (ids: string[]) => c.patch<CreatorPackage[]>('/me/packages/reorder', { ids }),

  // ---- portfolio (/me/portfolio) ----
  portfolio: () => c.get<PortfolioItem[]>('/me/portfolio'),
  createPortfolioItem: (body: PortfolioInput) => c.post<PortfolioItem>('/me/portfolio', body, idem()),
  updatePortfolioItem: ({ id, ...body }: { id: string } & Partial<PortfolioInput>) => c.patch<PortfolioItem>(`/me/portfolio/${id}`, body),
  deletePortfolioItem: (id: string) => c.delete(`/me/portfolio/${id}`),
  reorderPortfolio: (ids: string[]) => c.patch<PortfolioItem[]>('/me/portfolio/reorder', { ids }),

  // ---- lookbook (/me/gallery) ----
  gallery: () => c.get<GalleryPhoto[]>('/me/gallery'),
  createGalleryPhoto: (body: GalleryInput) => c.post<GalleryPhoto>('/me/gallery', body, idem()),
  updateGalleryPhoto: ({ id, ...body }: { id: string } & Partial<GalleryInput>) => c.patch<GalleryPhoto>(`/me/gallery/${id}`, body),
  deleteGalleryPhoto: (id: string) => c.delete(`/me/gallery/${id}`),
  reorderGallery: (ids: string[]) => c.patch<GalleryPhoto[]>('/me/gallery/reorder', { ids }),

  // ---- verified badge (/me/verification-requests) ----
  latestVerification: () => c.get<VerificationRequest | null>('/me/verification-requests/latest'),
  applyForVerification: (body: VerificationApplyInput) => c.post<VerificationRequest>('/me/verification-requests', body, idem()),
});
