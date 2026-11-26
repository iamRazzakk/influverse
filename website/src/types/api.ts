/**
 * Types for data that comes from the INFLUVERSE server (server/src/app/modules/*).
 * Money from the server is always in integer cents (`...Cents`); format with `formatCents`.
 */

export type UserRole = 'brand' | 'creator';
export type AccountStatus = 'active' | 'suspended' | 'deactivation_scheduled' | 'deactivated';

export interface NotificationPrefs {
  offers: boolean;
  messages: boolean;
  deliverables: boolean;
  payouts: boolean;
  marketing: boolean;
}

/** Logged-in account (server `USER_SELF_PROJECTION`). */
export interface AuthUser {
  id: string;
  code: string;
  email: string;
  role: UserRole;
  name: string;
  phone?: string;
  avatar?: string;
  status: AccountStatus;
  emailVerified: boolean;
  onboardingCompleted: boolean;
  onboardingStep: number;
  preferredLanguage: 'en' | 'de';
  notificationPrefs: NotificationPrefs;
  deactivation?: { requestedAt?: string; scheduledFor?: string; reason?: string };
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SocialPlatformStats {
  handle?: string;
  url?: string;
  followers: number;
  engagementRate: number;
  avgViews: number;
  connected: boolean;
  lastSyncedAt?: string;
}

export type SocialPlatform = 'instagram' | 'tiktok' | 'youtube';
export type ApprovalStatus = 'under_review' | 'approved' | 'action_required' | string;

/** Brand's own profile (server brand.model.ts). */
export interface BrandProfile {
  id: string;
  userId: string;
  slug: string;
  companyName?: string;
  logo?: string;
  coverImage?: string;
  jobTitle?: string;
  tagline?: string;
  bio?: string;
  website?: string;
  country?: string;
  city?: string;
  companySize?: string;
  foundedYear?: number;
  industry?: string;
  industryTags: string[];
  targetPlatforms: string[];
  campaignGoals: string[];
  monthlyBudget?: string;
  creatorTiers: string[];
  vatNumber?: string;
  billingAddress?: { line1?: string; line2?: string; city?: string; postalCode?: string; country?: string };
  verified: boolean;
  stats?: Record<string, number>;
}

/** Creator's own profile (server creator.model.ts). */
export interface CreatorProfile {
  id: string;
  userId: string;
  handle?: string;
  name?: string;
  avatar?: string;
  bio?: string;
  coverImage?: string;
  contactEmail?: string;
  contactPhone?: string;
  gender?: string;
  country?: string;
  city?: string;
  languages: string[];
  categories: string[];
  tags: string[];
  collaborationPreferences: string[];
  aestheticVibe?: string;
  platforms: Partial<Record<SocialPlatform, SocialPlatformStats>>;
  platformKeys: SocialPlatform[];
  followersTotal: number;
  ugc?: { enabled: boolean; avgDeliveryDays?: number };
  audience?: {
    topCountries?: { country: string; percentage: number }[];
    genderSplit?: { female?: number; male?: number };
    topAgeGroup?: string;
  };
  approvalStatus: ApprovalStatus;
  approvalNote?: string;
  verified: boolean;
  startingPriceCents: number;
  packageCount: number;
  portfolioCount: number;
  galleryCount: number;
  rating: number;
  reviewsCount: number;
  totalCollaborations: number;
  profileCompletion: number;
  isSearchable: boolean;
  isFeatured: boolean;
}

/** GET /me */
export interface MeResponse {
  user: AuthUser;
  profile: BrandProfile | CreatorProfile | null;
}

/** GET /meta/options — dropdown values, single source of truth on the server. */
export interface MetaOptions {
  creatorCategories: string[];
  collaborationPreferences: string[];
  genders: string[];
  socialPlatforms: string[];
  followerRanges: string[];
  brandIndustries: string[];
  companySizes: string[];
  targetPlatforms: string[];
  campaignGoals: string[];
  monthlyBudgets: string[];
  creatorTiers: string[];
  packagePlatforms: string[];
  packageTypes: string[];
  usageRights: string[];
  usageRightsLabels: Record<string, string>;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  data?: Record<string, unknown>;
  readAt?: string | null;
  createdAt: string;
}
