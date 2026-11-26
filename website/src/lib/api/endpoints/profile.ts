import type { ApiClient } from '../types';
import { idempotencyKey } from '../core';
import type { BrandProfile, CreatorProfile, SocialPlatform, SocialPlatformStats } from '@/types/api';

/** Fields a brand can PATCH (server brand.validation.ts). `null` clears a field. */
export type BrandProfileUpdate = Partial<{
  companyName: string;
  logo: string | null;
  coverImage: string | null;
  jobTitle: string | null;
  tagline: string | null;
  bio: string | null;
  website: string | null;
  /** ISO-2, e.g. "FR" */
  country: string;
  city: string;
  companySize: string;
  foundedYear: number;
  industry: string;
  industryTags: string[];
  targetPlatforms: string[];
  campaignGoals: string[];
  monthlyBudget: string;
  creatorTiers: string[];
  vatNumber: string | null;
  billingAddress: { line1: string; line2?: string; city: string; postalCode: string; country: string };
  onboardingStep: number;
}>;

/** Fields a creator can PATCH (server creator.validation.ts). Name/avatar go through PATCH /me. */
export type CreatorProfileUpdate = Partial<{
  handle: string;
  bio: string;
  coverImage: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  gender: string;
  country: string;
  city: string;
  languages: string[];
  /** 1–3 */
  categories: string[];
  tags: string[];
  collaborationPreferences: string[];
  aestheticVibe: string;
  ugc: { enabled: boolean; avgDeliveryDays?: number };
  audience: CreatorProfile['audience'];
  onboardingStep: number;
}>;

export interface PlatformInput {
  handle: string;
  url?: string;
  followers?: number;
  engagementRate?: number;
  avgViews?: number;
}

/** `/me/brand-profile` and `/me/creator-profile` — own profile, onboarding and social channels. */
export const profileEndpoints = (c: ApiClient) => ({
  // ---- brand ----
  getBrand: () => c.get<BrandProfile>('/me/brand-profile'),
  updateBrand: (body: BrandProfileUpdate) => c.patch<BrandProfile>('/me/brand-profile', body),
  /** Server checks required fields and sets `onboardingCompleted`. Reload the session afterwards. */
  completeBrandOnboarding: () => c.post<BrandProfile>('/me/brand-profile/complete-onboarding'),

  // ---- creator ----
  getCreator: () => c.get<CreatorProfile>('/me/creator-profile'),
  updateCreator: (body: CreatorProfileUpdate) => c.patch<CreatorProfile>('/me/creator-profile', body),
  upsertPlatform: ({ platform, ...body }: { platform: SocialPlatform } & PlatformInput) =>
    c.put<{ platforms: Partial<Record<SocialPlatform, SocialPlatformStats>>; platformKeys: SocialPlatform[]; followersTotal: number }>(
      `/me/creator-profile/platforms/${platform}`,
      body,
    ),
  removePlatform: (platform: SocialPlatform) => c.delete<unknown>(`/me/creator-profile/platforms/${platform}`),
  /** Submits for admin review (also creates a default package if the creator has none). */
  completeCreatorOnboarding: () => c.post<CreatorProfile>('/me/creator-profile/complete-onboarding'),
  /** Debounce this while the creator types a handle. */
  checkHandle: (handle: string, signal?: AbortSignal) =>
    c.get<{ handle: string; available: boolean }>('/creators/handle-available', { params: { handle }, signal }),
  /** Onboarding step 5: one portfolio sample. */
  addOnboardingPortfolioItem: (body: { fileId: string; title: string; mediaType?: 'image' | 'video'; deliverableType?: string }) =>
    c.post<{ id: string }>('/me/portfolio', body, { headers: { 'Idempotency-Key': idempotencyKey() } }),
});
