export type AdminRole = 'super_admin' | 'admin' | 'moderator';

/** Matches `toAdminDto` in server/src/app/modules/admin/admin.dto.ts */
export interface AdminUser {
  id: string;
  code?: string;
  name: string;
  email: string;
  avatar: string | null;
  role: AdminRole;
  status: 'invited' | 'active' | 'suspended';
  twoFactorEnabled?: boolean;
  /** ISO date of the last login, null if never logged in */
  lastLogin?: string | null;
  createdAt?: string;
}

/** Account status on the server (`users.status`). */
export type UserStatus = 'active' | 'suspended' | 'deactivation_scheduled' | 'deactivated';

/** Creator onboarding review state (`creator_profiles.approvalStatus`). */
export type CreatorApprovalStatus = 'under_review' | 'approved' | 'action_required';

export type BanActionType = 'warning' | 'temporary' | 'permanent';

export interface UserBan {
  type: BanActionType;
  reason: string;
  escrowDisposition?: 'hold' | 'refund';
  notes?: string;
  until?: string;
  bannedAt?: string;
}

/** Row of GET /admin/users (server `toAdminUserRow`). Money is in integer cents. */
export interface MarketplaceUser {
  id: string;
  code: string;
  name: string;
  email: string;
  avatar: string | null;
  role: 'creator' | 'brand';
  status: UserStatus;
  /** Creators only */
  handle: string | null;
  /** Brands only */
  companyName: string | null;
  /** First creator category, or the brand industry */
  category: string | null;
  /** Creators only; null for brands */
  approvalStatus: CreatorApprovalStatus | null;
  isVerified: boolean;
  rating: number | null;
  /** "City, CC" or empty string */
  location: string;
  totalVolumeCents: number;
  ordersCount: number;
  ban: UserBan | null;
  joinedAt: string;
  lastLoginAt: string | null;
}

/** GET /admin/users/:id — the row plus contact info and the raw brand / creator profile. */
export interface MarketplaceUserDetail extends MarketplaceUser {
  phone: string | null;
  onboardingCompleted: boolean;
  profile: (Record<string, unknown> & { isFeatured?: boolean; approvalNote?: string; bio?: string }) | null;
}

export type VerificationStatus = 'pending' | 'approved' | 'rejected';

/** Verification request (server verification.model.ts). */
export interface VerificationRequest {
  id: string;
  code: string;
  creatorId: string;
  /** Copy of the creator profile taken when the request was made */
  creatorSnapshot?: {
    name?: string;
    handle?: string;
    avatar?: string;
    country?: string;
    categories?: string[];
  };
  platforms?: {
    instagram?: string;
    tiktok?: string;
    youtube?: string;
  };
  primaryPlatform?: 'instagram' | 'tiktok' | 'youtube';
  followersTotal?: number;
  avgViews?: number;
  sampleWork?: {
    title?: string;
    url?: string;
    views?: number;
    /** Uploaded sample (private file — open via GET /admin/files/:id/url) */
    file?: { fileId: string; url: string; name: string; mime: string; size: number };
  };
  note?: string;
  status: VerificationStatus;
  rejectionReason?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EscrowDispute {
  id: string;
  orderId: string;
  brandName: string;
  brandAvatar: string;
  creatorName: string;
  creatorAvatar: string;
  campaignTitle: string;
  amountEur: number;
  feeEur: number;
  disputeReason: string;
  status: 'open' | 'resolved_creator' | 'resolved_brand' | 'resolved_split';
  splitRatio?: string;
  submittedDate: string;
  briefSummary: string;
  deliverableLink: string;
}

export interface CmsLegalDoc {
  id: string;
  slug: string;
  title: string;
  version: string;
  lastModified: string;
  contentMarkdown: string;
  isPublished: boolean;
}

export interface CmsFaqItem {
  id: string;
  category?: string;
  question: string;
  answer: string;
  order: number;
  isPublished: boolean;
}

export interface SocialMediaItem {
  id: string;
  platform: string;
  url: string;
}

export interface CmsBrandAssets {
  logoLightUrl: string;
  logoDarkUrl: string;
  faviconUrl: string;
  heroHeadline: string;
  heroSubtitle: string;
  supportEmail: string;
  socialLinks: {
    facebook?: string;
    instagram: string;
    twitter: string;
    linkedin: string;
    youtube?: string;
  };
  socialList?: SocialMediaItem[];
}

export interface PartnerBrandLogo {
  id: string;
  name: string;
  logoUrl: string;
  order: number;
  isActive?: boolean;
  websiteUrl?: string;
  category?: string;
  createdAt?: string;
}

export interface BrandTickerSettings {
  headline: string;
  speedSeconds: number;
  pauseOnHover: boolean;
  direction: 'left' | 'right';
  isEnabled: boolean;
}

export type TransactionType =
  | 'escrow_deposit'
  | 'creator_payout'
  | 'platform_fee'
  | 'brand_refund'
  | 'arbitration_split';

export type TransactionStatus =
  | 'completed'
  | 'escrow_locked'
  | 'pending'
  | 'failed'
  | 'refunded';

export interface MarketplaceTransaction {
  id: string;
  orderId: string;
  brandName: string;
  brandAvatar: string;
  creatorName: string;
  creatorAvatar: string;
  campaignTitle: string;
  type: TransactionType;
  grossAmountEur: number;
  platformFeeEur: number;
  netAmountEur: number;
  paymentMethod: 'stripe_connect' | 'sepa_transfer' | 'wise' | 'credit_card';
  status: TransactionStatus;
  createdAt: string;
  stripePaymentIntentId: string;
  invoiceNumber: string;
}

export type PackageTier = 'starter' | 'standard' | 'premium' | 'enterprise';

export interface MarketplacePackage {
  id: string;
  title: string;
  description: string;
  category: string;
  tier: PackageTier;
  priceEur: number;
  deliveryDays: number;
  revisionsCount: number;
  adRightsMonths: number;
  deliverables: string[];
  isFeatured: boolean;
  isPublished: boolean;
  ordersCount: number;
  creatorCount: number;
  createdAt: string;
}

export type OrderStatus =
  | 'escrow_funded'
  | 'in_progress'
  | 'deliverable_submitted'
  | 'revision_requested'
  | 'completed'
  | 'disputed'
  | 'cancelled';

export interface OrderMilestone {
  title: string;
  status: 'completed' | 'current' | 'pending';
  timestamp?: string;
  notes?: string;
}

export interface MarketplaceOrder {
  id: string; // e.g. "ORD-84920"
  packageTitle: string;
  packageTier: PackageTier;
  category: string;
  brandName: string;
  brandAvatar: string;
  brandEmail: string;
  creatorName: string;
  creatorAvatar: string;
  creatorHandle: string;
  grossAmountEur: number;
  platformFeeEur: number; // 15%
  creatorNetEur: number;
  status: OrderStatus;
  progressPercent: number; // 0 to 100
  deliveryDaysTotal: number;
  daysRemaining: number; // positive = days left, negative = overdue, 0 = due today
  dueDate: string;
  revisionCurrent: number;
  revisionMax: number;
  deliverablesSummary: string[];
  deliverableLink?: string;
  escrowDepositId: string;
  milestones: OrderMilestone[];
  createdAt: string;
  lastActivity: string;
  brandNotes?: string;
  slaWarning?: boolean;
}

export type TicketType = 'support' | 'user_report';
export type TicketPriority = 'urgent' | 'high' | 'normal' | 'low';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface TicketMessage {
  id: string;
  senderName: string;
  senderRole: 'brand' | 'creator' | 'admin';
  senderAvatar: string;
  message: string;
  timestamp: string;
  isAdminReply?: boolean;
}

export interface SupportTicket {
  id: string; // e.g. "TCK-4019"
  type: TicketType;
  subject: string;
  category: 'billing_escrow' | 'account_access' | 'order_delivery' | 'fraud_scam' | 'copyright_ip' | 'general';
  userName: string;
  userEmail: string;
  userRole: 'brand' | 'creator';
  userAvatar: string;
  priority: TicketPriority;
  status: TicketStatus;
  assignedAdmin?: string;
  reportedUser?: {
    name: string;
    handle?: string;
    role: 'brand' | 'creator';
    avatar: string;
    reason: string;
  };
  messages: TicketMessage[];
  createdAt: string;
  lastUpdated: string;
}





// ---------------------------------------------------------------------------
// API shapes (server/src/app/modules/cms, admin/team, audit)
// ---------------------------------------------------------------------------

export type CmsPageSlug = 'terms' | 'privacy' | 'about';
export type FaqCategory = 'brands' | 'creators';

/** GET/PUT /admin/cms/pages/:slug */
export interface CmsPageDoc {
  id: string;
  slug: CmsPageSlug;
  title: string;
  contentMarkdown: string;
  version: string;
  isPublished: boolean;
  lastModified?: string;
}

/** /admin/cms/faqs */
export interface CmsFaq {
  id: string;
  code?: string;
  category: FaqCategory;
  question: string;
  answer: string;
  order: number;
  isPublished: boolean;
}

/** /admin/cms/partner-brands — "Trusted by" logo strip */
export interface CmsPartnerBrand {
  id: string;
  code?: string;
  name: string;
  logoUrl: string;
  websiteUrl?: string;
  category?: string;
  order: number;
  isActive: boolean;
  createdAt?: string;
}

export type SiteSocialPlatform = 'facebook' | 'instagram' | 'x' | 'linkedin' | 'youtube' | 'tiktok';

export interface SiteTicker {
  headline: string;
  speedSeconds: number;
  pauseOnHover: boolean;
  direction: 'left' | 'right';
  isEnabled: boolean;
}

/** /admin/cms/site — single document. Empty object until first save. */
export interface SiteSettings {
  logoLightUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  heroHeadline?: string;
  heroSubtitle?: string;
  supportEmail?: string;
  socialLinks?: { platform: SiteSocialPlatform; url: string }[];
  ticker?: Partial<SiteTicker>;
  updatedAt?: string;
}

/** /admin/audit-logs */
export interface AuditLogEntry {
  id: string;
  adminId: string;
  adminSnapshot?: { name?: string; email?: string; role?: string };
  action: string;
  targetType: string;
  targetId?: string;
  targetCode?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  ip?: string;
  createdAt: string;
}
