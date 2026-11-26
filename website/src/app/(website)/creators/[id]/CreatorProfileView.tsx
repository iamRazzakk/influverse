'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/session/AuthProvider';
import { useOfferModal } from '@/lib/offer/OfferModalProvider';
import type { PublicCreatorDetail } from '@/lib/api/endpoints/public';
import { useSaveCreator } from '@/components/shared/useSaveCreator';
import { toLegacyCreator } from '@/components/shared/creatorAdapter';
import { labelize } from '@/components/shared/creatorFormat';
import { PackageCard } from '@/components/shared/PackageCard';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { InstagramLogo, TikTokLogo, YouTubeLogo } from '@/components/shared/SocialLogos';
import dynamic from 'next/dynamic';
import type { PortfolioVideoModal as PortfolioVideoModalType } from '@/components/shared/PortfolioVideoModal';

// Modals are only needed after a click: load their code lazily so the profile's first load is lighter.
const PortfolioVideoModal = dynamic(
  () => import('@/components/shared/PortfolioVideoModal').then((m) => m.PortfolioVideoModal),
  { ssr: false },
) as typeof PortfolioVideoModalType;
const CreatorPhotoLightbox = dynamic(
  () => import('@/components/shared/CreatorPhotoLightbox').then((m) => m.CreatorPhotoLightbox),
  { ssr: false },
);
const ShareProfileModal = dynamic(
  () => import('@/components/shared/ShareProfileModal').then((m) => m.ShareProfileModal),
  { ssr: false },
);
import { SaveButton } from '@/components/shared/SaveButton';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { EmptyState } from '@/components/shared/EmptyState';
import { CategoryIcon } from '@/components/shared/CategoryIcon';
import { CreatorPackage, PlatformType, PortfolioItem, CreatorPhoto } from '@/types';
import {
  MapPin,
  Instagram,
  Youtube,
  MessageSquare,
  Share2,
  ArrowRight,
  Star,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Film,
  Play,
  Heart,
  ZoomIn,
  Package,
  ExternalLink,
  Venus,
  Mars,
  Globe,
} from 'lucide-react';
import { Button, message } from 'antd';
import { Button as AppButton, Badge as AppBadge } from '@/components/ui';
import { RemoteImage } from '@/components/shared/RemoteImage';

function platformLabel(platform: string) {
  if (platform === 'all' || platform === 'multi') return 'All platforms';
  if (platform === 'ugc') return 'UGC Ads';
  if (platform === 'instagram') return 'Instagram';
  if (platform === 'tiktok') return 'TikTok';
  if (platform === 'youtube') return 'YouTube';
  return platform;
}

function genderLabel(gender?: string) {
  if (gender === 'female') return 'Female';
  if (gender === 'male') return 'Male';
  if (gender === 'other') return 'Other';
  return null;
}

const ALL_COLLAB_PREFS = [
  {
    id: 'sponsored',
    label: 'Sponsored Posts',
    desc: 'Dedicated Reels, TikToks, YouTube integrations & feed posts',
  },
  {
    id: 'ugc',
    label: 'UGC Content',
    desc: 'High-converting ad creatives & organic assets without posting to personal feed',
  },
  {
    id: 'reviews',
    label: 'Product Reviews',
    desc: 'In-depth unboxings, honest product testing, and feature demonstrations',
  },
  {
    id: 'events',
    label: 'Events & Brand Trips',
    desc: 'In-person event attendance, runway appearances, launches, and summits',
  },
  {
    id: 'ambassador',
    label: 'Brand Ambassadorship',
    desc: 'Long-term representation and multi-month brand ambassador partnerships',
  },
  {
    id: 'affiliate',
    label: 'Affiliate & Gifting',
    desc: 'Trackable affiliate links, commission codes, and PR gifting seeding',
  },
];

/**
 * Public creator profile UI. `detail` (GET /creators/:idOrHandle) comes from the server page, so the
 * profile is in the first HTML. Viewer-specific bits (own profile, saved state, offer / message buttons)
 * use the browser session via useAuth() / useSaveCreator() / useOfferModal().
 *
 * `creatorId` is the handle (preferred) or user id from the URL — the API accepts both.
 */
export function CreatorProfileView({ detail, creatorId }: { detail: PublicCreatorDetail; creatorId: string }) {
  const router = useRouter();
  const { openOfferModal } = useOfferModal();
  const { currentUser, profile: myProfile } = useAuth();

  const creator = useMemo(() => toLegacyCreator(detail), [detail]);
  const save = useSaveCreator();

  const [activeTab, setActiveTab] = useState<'overview' | 'packages' | 'portfolio' | 'photos' | 'audience' | 'reviews'>('overview');
  const [portfolioFilter, setPortfolioFilter] = useState<'all' | PlatformType>('all');
  const [reviewFilter, setReviewFilter] = useState<'all' | number>('all');
  const [reviewPage, setReviewPage] = useState(1);
  const [selectedPortfolioItem, setSelectedPortfolioItem] = useState<PortfolioItem | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<CreatorPhoto | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const isSaved = save.isSaved(creator.id);

  const isCreatorUser = currentUser?.role === 'creator';

  // A creator previewing their own page (the API returns it to them even before approval).
  const isSelfProfile = isCreatorUser && (currentUser.id === creator.id || myProfile?.userId === creator.id);

  const isOtherCreator = isCreatorUser && !isSelfProfile;

  /**
   * "Send Offer" / package cards open the Send Collaboration Offer modal (POST /offers).
   * Guests log in first and come back to this profile.
   */
  const handleOpenOffer = (pkg?: { id: string }) => {
    if (isSelfProfile) {
      router.push('/creator/packages');
      return;
    }
    if (isOtherCreator) {
      message.info('You are logged in as a creator. Collaboration offers are sent by brand accounts.');
      return;
    }
    if (!currentUser) {
      router.push(`/login?next=${encodeURIComponent(`/creators/${creatorId}`)}`);
      return;
    }
    if (currentUser.role !== 'brand') {
      message.info('Collaboration offers are sent by brand accounts.');
      return;
    }
    openOfferModal({
      id: creator.id,
      name: creator.name,
      handle: creator.handle,
      avatar: creator.avatar,
      verified: Boolean(detail?.profile.verified),
      startingPriceCents: detail?.profile.startingPriceCents ?? 0,
      packages: publicPackages,
      packageId: pkg?.id,
    });
  };

  /**
   * Chat is brand ↔ creator only. Guests log in first and land straight in the thread
   * (the login page honours `next` for the account's own `/brand/...` pages).
   */
  const handleMessage = () => {
    const chatUrl = `/brand/messages?creatorId=${encodeURIComponent(creator.id)}`;
    if (!currentUser) {
      router.push(`/login?next=${encodeURIComponent(chatUrl)}`);
      return;
    }
    if (currentUser.role !== 'brand') {
      message.info('Messaging creators needs a brand account.');
      return;
    }
    router.push(chatUrl);
  };

  const handleBookFromPortfolio = (item: { platforms: string[] }) => {
    setSelectedPortfolioItem(null);
    if (isOtherCreator) {
      message.info('You are logged in as a creator. Collaboration offers are sent by brand accounts.');
      return;
    }
    const matchingPkg =
      publicPackages.find((p) => p.platforms.some((pl) => item.platforms.includes(pl))) || publicPackages[0];
    handleOpenOffer(matchingPkg);
  };

  // The portfolio modal takes the raw API item (it plays the uploaded video file).
  const selectedPublicPortfolioItem = selectedPortfolioItem
    ? detail?.portfolio.find((i) => i.id === selectedPortfolioItem.id) ?? null
    : null;

  // PackageCard takes the API package shape (price in cents).
  const publicPackages = detail?.packages ?? [];
  const filteredPackages = publicPackages;

  const filteredPortfolio = portfolioFilter === 'all'
    ? creator.portfolio
    : creator.portfolio.filter((item) => (item.platforms ?? [item.platform]).includes(portfolioFilter));

  const creatorPhotos: CreatorPhoto[] = creator.photos ?? [];

  return (
    <div className="bg-[#FAFAF8] min-h-screen py-8 sm:py-10 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Breadcrumb & Profile Actions */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2 overflow-hidden text-sm font-bold text-[#66665E]">
            <Link href="/creators" className="shrink-0 hover:text-[#0A0A0A] transition-colors">
              Discover
            </Link>
            <ChevronRight className="w-4 h-4 shrink-0 text-[#A3A39C]" />
            <span className="hidden sm:inline truncate text-[#66665E]">{labelize(creator.categories[0])}</span>
            <ChevronRight className="hidden sm:block w-4 h-4 shrink-0 text-[#A3A39C]" />
            <span className="truncate text-[#0A0A0A] font-extrabold">{creator.name}</span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!isSelfProfile && save.canSave && (
              <SaveButton saved={isSaved} onClick={() => void save.toggle(creator.id)} />
            )}

            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              title="Share Profile"
              className="w-9 h-9 rounded-full bg-white hover:bg-[#FAFAF8] border border-[#E7E7E2] text-[#66665E] hover:text-[#0A0A0A] hover:border-[#0A0A0A] flex items-center justify-center transition-all cursor-pointer shadow-2xs"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Profile Header Area */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-8 lg:p-10 border border-[#E7E7E2] shadow-sm relative">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 sm:gap-8">
            {/* Left: Avatar & Info */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 w-full lg:w-auto">
              {/* Circular Avatar */}
              <div className="relative shrink-0">
                <div className="w-20 h-20 min-[380px]:w-24 min-[380px]:h-24 sm:w-36 sm:h-36 rounded-full overflow-hidden border-4 border-[#FAFAF8] shadow-md bg-[#F4F4F0] group">
                  <RemoteImage
                    src={creator.avatar}
                    alt={creator.name ?? ''}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    width={800} height={800} sizes="(min-width: 1024px) 33vw, 100vw" priority
                  />
                </div>
              </div>

              {/* Identity & Bio */}
              <div className="space-y-2.5 sm:space-y-3 max-w-xl min-w-0">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl min-[380px]:text-3xl sm:text-4xl lg:text-[40px] font-black text-[#0A0A0A] tracking-tight leading-tight font-sans">
                      {creator.name}
                    </h1>
                    {creator.verified && (
                      <VerifiedBadge className="w-6 h-6 sm:w-7 sm:h-7" />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm font-semibold text-[#66665E]">
                    {creator.handle && (
                      <span className="text-sm sm:text-base font-semibold text-[#66665E]">
                        @{creator.handle.replace(/^@+/, '')}
                      </span>
                    )}
                    {creator.gender && (creator.gender === 'female' || creator.gender === 'male') && (
                      <span
                        className="inline-flex items-center gap-1"
                        title={creator.gender === 'female' ? 'Female' : 'Male'}
                      >
                        {creator.gender === 'female' ? (
                          <Venus className="w-3.5 h-3.5 text-[#FF2D78] shrink-0" />
                        ) : (
                          <Mars className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                        )}
                        <span>{creator.gender === 'female' ? 'Female' : 'Male'}</span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[#0A0A0A] font-bold">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                      <span>{creator.rating} ({creator.reviewsCount} reviews)</span>
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs sm:text-sm font-semibold text-[#66665E]">
                  <span className="text-[#0A0A0A] font-bold">{creator.categories.map(labelize).join(' & ')}</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#A3A39C] shrink-0" />
                    <span>{creator.location}</span>
                  </span>
                  {creator.languages && creator.languages.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[#0A0A0A] font-semibold">
                      <Globe className="w-3.5 h-3.5 text-[#66665E] shrink-0" />
                      <span>{creator.languages.join(', ')}</span>
                    </span>
                  )}
                </div>

                <p className="text-sm sm:text-base text-[#555550] leading-[26px] font-medium">
                  {creator.bio}
                </p>

                {/* Category Pills matching pastel tags in reference */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {creator.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs font-bold px-3.5 py-1 rounded-full bg-[#F4F4F0] text-[#0A0A0A] border border-[#E7E7E2]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Social Platform Counts & Action Buttons */}
            <div className="w-full lg:w-80 xl:w-[340px] shrink-0 flex flex-col gap-4 pt-4 lg:pt-0 lg:border-l border-[#E7E7E2] lg:pl-8">
              {/* Follower Stats Columns */}
              <div className="grid grid-cols-3 gap-1.5 min-[380px]:gap-2 sm:gap-2.5 text-center">
                {creator.platforms.instagram && (
                  <a
                    href={
                      creator.platforms.instagram.url ||
                      `https://instagram.com/${creator.platforms.instagram.handle.replace('@', '')}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 sm:py-3 px-1 sm:px-2.5 rounded-xl sm:rounded-2xl bg-[#FAFAF8] border border-[#E7E7E2] hover:border-[#E1306C] hover:bg-rose-50/20 transition-all group/item flex flex-col items-center justify-center text-center relative cursor-pointer"
                    title={`Visit ${creator.name}'s Instagram (@${creator.platforms.instagram.handle.replace('@', '')})`}
                  >
                    <InstagramLogo circle className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1 shrink-0 shadow-2xs group-hover/item:scale-110 transition-transform" />
                    <div className="w-full text-center text-xs min-[380px]:text-sm font-black text-[#0A0A0A] leading-tight truncate">
                      {creator.platforms.instagram.followersFormatted}
                    </div>
                    <div className="w-full text-center text-[10px] min-[380px]:text-xs sm:text-sm font-bold text-[#66665E] tracking-tight leading-tight mt-0.5 truncate">
                      Followers
                    </div>
                  </a>
                )}

                {creator.platforms.tiktok && (
                  <a
                    href={
                      creator.platforms.tiktok.url ||
                      `https://tiktok.com/@${creator.platforms.tiktok.handle.replace('@', '')}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 sm:py-3 px-1 sm:px-2.5 rounded-xl sm:rounded-2xl bg-[#FAFAF8] border border-[#E7E7E2] hover:border-[#0A0A0A] hover:bg-zinc-100/40 transition-all group/item flex flex-col items-center justify-center text-center relative cursor-pointer"
                    title={`Visit ${creator.name}'s TikTok (@${creator.platforms.tiktok.handle.replace('@', '')})`}
                  >
                    <TikTokLogo circle className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1 shrink-0 shadow-2xs group-hover/item:scale-110 transition-transform" />
                    <div className="w-full text-center text-xs min-[380px]:text-sm font-black text-[#0A0A0A] leading-tight truncate">
                      {creator.platforms.tiktok.followersFormatted}
                    </div>
                    <div className="w-full text-center text-[10px] min-[380px]:text-xs sm:text-sm font-bold text-[#66665E] tracking-tight leading-tight mt-0.5 truncate">
                      Followers
                    </div>
                  </a>
                )}

                {creator.platforms.youtube && (
                  <a
                    href={
                      creator.platforms.youtube.url ||
                      `https://youtube.com/@${creator.platforms.youtube.handle.replace(/[\s@]/g, '').toLowerCase()}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 sm:py-3 px-1 sm:px-2.5 rounded-xl sm:rounded-2xl bg-[#FAFAF8] border border-[#E7E7E2] hover:border-[#FF0000] hover:bg-red-50/20 transition-all group/item flex flex-col items-center justify-center text-center relative cursor-pointer"
                    title={`Visit ${creator.name}'s YouTube (${creator.platforms.youtube.handle})`}
                  >
                    <YouTubeLogo circle className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1 shrink-0 shadow-2xs group-hover/item:scale-110 transition-transform" />
                    <div className="w-full text-center text-xs min-[380px]:text-sm font-black text-[#0A0A0A] leading-tight truncate">
                      {creator.platforms.youtube.followersFormatted}
                    </div>
                    <div className="w-full text-center text-[10px] min-[380px]:text-xs sm:text-sm font-bold text-[#66665E] tracking-tight leading-tight mt-0.5 truncate">
                      Subscribers
                    </div>
                  </a>
                )}
              </div>

              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-bold text-[#66665E]">Starting rate</span>
                <span className="text-lg font-black text-[#0A0A0A]">€{creator.startingPriceEur}</span>
              </div>

              {/* Action Buttons */}
              {isSelfProfile ? (
                <div className="space-y-2.5">
                  <AppButton
                    href="/creator/profile"
                    size="md"
                    variant="primary"
                    fullWidth
                  >
                    Edit Profile & Bio
                  </AppButton>
                  <AppButton
                    href="/creator/packages"
                    size="md"
                    variant="secondary"
                    fullWidth
                  >
                    Manage Packages
                  </AppButton>
                </div>
              ) : isOtherCreator ? (
                /* Logged-in creator viewing another creator: chat and offers are brand ↔ creator only. */
                <p className="rounded-2xl bg-[#F4F4F0] px-4 py-3 text-xs font-semibold leading-relaxed text-[#66665E]">
                  Messages and offers are between brands and creators. Switch to a brand account to work with this creator.
                </p>
              ) : (
                /* Brand or Visitor view */
                <div className="space-y-2.5">
                  <AppButton
                    type="button"
                    size="md"
                    variant="primary"
                    fullWidth
                    onClick={() => handleOpenOffer()}
                  >
                    Send Offer
                  </AppButton>

                  <AppButton
                    type="button"
                    size="md"
                    variant="secondary"
                    fullWidth
                    onClick={handleMessage}
                    icon={<MessageSquare className="w-4 h-4 text-[#66665E]" />}
                  >
                    Message
                  </AppButton>
                </div>
              )}
            </div>
          </div>

          {/* Profile Navigation Tabs */}
          <div className="flex items-center gap-4 sm:gap-8 border-b border-[#E7E7E2] mt-6 sm:mt-10 text-xs sm:text-sm font-bold overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'packages', label: 'Packages' },
              { key: 'portfolio', label: 'Portfolio' },
              { key: 'photos', label: 'Gallery' },
              { key: 'reviews', label: 'Reviews' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={(e) => {
                  setActiveTab(tab.key as any);
                  e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
                }}
                className={`pb-3.5 whitespace-nowrap transition-colors relative cursor-pointer ${
                  activeTab === tab.key
                    ? 'text-[#0A0A0A] font-black'
                    : 'text-[#66665E] hover:text-[#0A0A0A]'
                }`}
              >
                <span>{tab.label}</span>
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0A0A0A] rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-5 sm:space-y-8">
            {/* Collaboration Packages Section */}
            <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-8 border border-[#E7E7E2] shadow-2xs space-y-4 sm:space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-extrabold text-[#0A0A0A] tracking-tight">
                    Collaboration Packages
                  </h2>
                  <p className="text-sm text-[#66665E] mt-1 font-medium">
                    Pre-set deliverables and turnaround.
                  </p>
                </div>
              </div>

              {/* Packages Cards Row (Curated 3 Packages) */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                {filteredPackages.length > 0 ? (
                  filteredPackages.slice(0, 3).map((pkg) => (
                    <PackageCard
                      key={pkg.id}
                      packageItem={pkg}
                      creator={{
                        id: creator.id,
                        name: creator.name,
                        handle: creator.handle,
                        avatar: creator.avatar,
                      }}
                      onSelect={!isOtherCreator ? (p) => handleOpenOffer(p) : undefined}
                    />
                  ))
                ) : (
                  <div className="col-span-1 md:col-span-2 lg:col-span-3">
                    <EmptyState
                      color="neutral"
                      icon={<Package className="w-8 h-8 text-[#66665E]" />}
                      title="No Deals In This Category"
                      description="This creator currently accepts custom collaboration offers and multi-deliverable briefs for this format."
                      primaryAction={
                        isOtherCreator
                          ? undefined
                          : {
                              label: 'Request Custom Proposal',
                              onClick: () => handleOpenOffer(),
                            }
                      }
                      variant="plain"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Collaboration Preferences (Matching Onboarding Step 6) */}
            {(() => {
              const activeCollabIds =
                creator.collaborationPreferences && creator.collaborationPreferences.length > 0
                  ? creator.collaborationPreferences
                  : ['sponsored', 'ugc', 'reviews'];
              const collabPrefsList = ALL_COLLAB_PREFS.filter((p) => activeCollabIds.includes(p.id));

              return (
                <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-8 border border-[#E7E7E2] shadow-2xs space-y-3 sm:space-y-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">
                        Collaboration Preferences
                      </h2>
                      <p className="text-xs sm:text-sm text-[#66665E] mt-0.5 font-medium">
                        Partnership types and content formats {creator.name} is open to working on.
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] sm:text-xs font-bold px-2 py-1 sm:px-3 rounded-full bg-[#FAFAF8] text-[#0A0A0A] border border-[#E7E7E2]">
                      {collabPrefsList.length} active
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:gap-3.5 lg:grid-cols-3">
                    {collabPrefsList.map((pref) => (
                      <div
                        key={pref.id}
                        className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-[#E7E7E2] bg-[#FAFAF8] flex items-start gap-2 sm:gap-3 hover:border-[#0A0A0A] transition-all"
                      >
                        <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-white border border-[#E7E7E2] flex items-center justify-center shrink-0 text-[#0A0A0A]">
                          <CategoryIcon name={pref.id} size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs sm:text-sm font-bold text-[#0A0A0A] leading-snug">
                            {pref.label}
                          </h4>
                          <p className="text-[11px] sm:text-xs text-[#66665E] mt-0.5 leading-snug line-clamp-3">
                            {pref.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Portfolio Showcase */}
            <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-8 border border-[#E7E7E2] shadow-2xs space-y-3 sm:space-y-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">Featured Portfolio</h2>
                  <p className="text-xs sm:text-sm text-[#66665E] mt-0.5 sm:mt-1 font-medium">
                    Brand collaborations and creative content samples.
                  </p>
                </div>

                <button
                  onClick={() => setActiveTab('portfolio')}
                  className="shrink-0 whitespace-nowrap text-xs sm:text-sm font-bold text-[#0A0A0A] hover:text-[#FF2D78] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span className="sm:hidden">View all</span>
                  <span className="hidden sm:inline">View All Campaigns</span>
                  <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>

              {/* 4 Items Portfolio Grid */}
              <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
                {creator.portfolio.length === 0 && (
                  <p className="col-span-full py-6 text-center text-sm font-medium text-[#66665E]">No portfolio items yet.</p>
                )}
                {creator.portfolio.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedPortfolioItem(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedPortfolioItem(item)}
                    className="relative rounded-xl sm:rounded-2xl overflow-hidden group bg-[#F4F4F0] h-36 sm:h-52 lg:h-64 border border-[#E7E7E2] hover:border-[#0A0A0A] hover:shadow-lg transition-all cursor-pointer"
                  >
                    <RemoteImage
                      src={item.mediaUrl}
                      alt={item.campaignTitle ?? ''}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      width={600} height={600} sizes="(min-width: 1024px) 33vw, 50vw"
                    />

                    {/* Floating Play Indicator Icon */}
                    <div className="absolute top-1.5 right-1.5 sm:top-3 sm:right-3 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center group-hover:bg-[#FF2D78] group-hover:scale-110 transition-all shadow-sm">
                      <Play className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 fill-white translate-x-0.5" />
                    </div>

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-85 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 sm:p-4 text-white">
                      <div className="min-w-0">
                        <div className="font-extrabold text-[11px] sm:text-sm text-white tracking-tight truncate">
                          {item.brandName}
                        </div>
                        <div className="text-[10px] sm:text-xs text-white/80 font-medium truncate mt-0.5">
                          {item.deliverableType || item.campaignTitle}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Gallery Preview */}
            <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-8 border border-[#E7E7E2] shadow-2xs space-y-3 sm:space-y-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">
                    Gallery
                  </h2>
                  <p className="text-xs sm:text-sm text-[#66665E] mt-0.5 sm:mt-1 font-medium">
                    Photos and visual showcase of {creator.name}.
                  </p>
                </div>

                <button
                  onClick={() => setActiveTab('photos')}
                  className="shrink-0 whitespace-nowrap text-xs sm:text-sm font-bold text-[#0A0A0A] hover:text-[#FF2D78] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span className="sm:hidden">View all</span>
                  <span className="hidden sm:inline">View All Photos</span>
                  <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>

              {/* 4-Card Photo Grid */}
              <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
                {creatorPhotos.length === 0 && (
                  <p className="col-span-full py-6 text-center text-sm font-medium text-[#66665E]">No photos yet.</p>
                )}
                {creatorPhotos.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedPhoto(item)}
                    className="relative rounded-xl sm:rounded-2xl overflow-hidden group bg-[#FAFAF8] h-36 sm:h-56 lg:h-72 border border-[#E7E7E2] hover:border-[#0A0A0A] hover:shadow-lg transition-all cursor-pointer"
                  >
                    <RemoteImage
                      src={item.url}
                      alt={item.caption ?? ''}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      width={600} height={600} sizes="(min-width: 1024px) 33vw, 50vw"
                    />

                    {/* Minimal Zoom Icon on hover */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-all flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-white/95 text-[#0A0A0A] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md group-hover:scale-110">
                        <ZoomIn className="w-4.5 h-4.5 text-[#0A0A0A]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
    
          </div>

            {/* Verified Brand Reviews Preview */}
            <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-8 border border-[#E7E7E2] shadow-2xs space-y-3 sm:space-y-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">Client Reviews</h2>
                  <p className="text-xs sm:text-sm text-[#66665E] mt-0.5 sm:mt-1 font-medium">
                    Ratings from completed collaborations.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('reviews')}
                  className="shrink-0 text-xs sm:text-sm font-bold text-[#0A0A0A] hover:text-[#FF2D78] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>All {creator.reviewsCount}</span>
                  <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
                {creator.reviews.slice(0, 4).map((rev) => (
                  <div key={rev.id} className="p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-[#FAFAF8] border border-[#E7E7E2] space-y-2 sm:space-y-3 flex flex-col justify-between shadow-2xs">
                    <div className="space-y-2 sm:space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                          <BrandLogo name={rev.brandName} logoUrl={rev.brandLogo} size="sm" className="sm:!w-10 sm:!h-10" />
                          <div className="min-w-0">
                            <div className="font-bold text-[13px] sm:text-sm text-[#0A0A0A] truncate">{rev.brandName}</div>
                            <div className="text-[11px] sm:text-sm text-[#66665E] truncate">{rev.date}</div>
                          </div>
                        </div>
                        <div className="flex text-amber-500 shrink-0">
                          {[...Array(rev.rating)].map((_, i) => (
                            <Star key={i} className="w-3 h-3 sm:w-4 sm:h-4 fill-amber-500" />
                          ))}
                        </div>
                      </div>
                      <p className="text-[13px] sm:text-sm text-[#555550] leading-snug sm:leading-[24px] italic line-clamp-3 sm:line-clamp-none">
                        &ldquo;{rev.comment}&rdquo;
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: PACKAGES */}
        {activeTab === 'packages' && (
          <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-8 border border-[#E7E7E2] space-y-4 sm:space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E7E7E2]/60">
              <div>
                <h2 className="text-2xl font-extrabold text-[#0A0A0A]">Collaboration Packages</h2>
                <p className="text-xs sm:text-sm text-[#66665E] mt-1 font-medium">
                  Pre-set deliverables and turnaround.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
              {filteredPackages.slice(0, 3).map((pkg) => (
                <PackageCard
                  key={pkg.id}
                  packageItem={pkg}
                  creator={{
                    id: creator.id,
                    name: creator.name,
                    handle: creator.handle,
                    avatar: creator.avatar,
                  }}
                  onSelect={!isOtherCreator ? (p) => handleOpenOffer(p) : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: FULL PORTFOLIO */}
        {activeTab === 'portfolio' && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E7E7E2] space-y-6">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-extrabold text-[#0A0A0A]">
                  Work Gallery & Portfolio
                </h2>
                <p className="text-sm text-[#66665E] mt-1 font-medium max-w-xl">
                  {portfolioFilter === 'all'
                    ? 'Browse previous brand campaigns, engagement reach, and visual deliverables across all platforms.'
                    : `Filtered by ${platformLabel(portfolioFilter)} campaigns and deliverables produced by ${creator.name}.`}
                </p>
              </div>

              {/* Interactive Platform Filter Pills - Strict 1 Line */}
              <div className="inline-flex items-center p-1 rounded-full bg-[#FAFAF8] border border-[#E7E7E2] whitespace-nowrap overflow-x-auto shrink-0 max-w-full">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'instagram', label: 'Instagram' },
                  { key: 'tiktok', label: 'TikTok' },
                  { key: 'youtube', label: 'YouTube' },
                  { key: 'ugc', label: 'UGC Ads' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setPortfolioFilter(tab.key as any)}
                    className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold capitalize transition-all cursor-pointer shrink-0 ${
                      portfolioFilter === tab.key
                        ? 'bg-[#0A0A0A] text-white shadow-2xs'
                        : 'text-[#66665E] hover:text-[#0A0A0A]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredPortfolio.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 lg:gap-6">
                {filteredPortfolio.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedPortfolioItem(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedPortfolioItem(item)}
                    className="rounded-2xl sm:rounded-3xl overflow-hidden border border-[#E7E7E2] bg-[#FAFAF8] hover:border-[#0A0A0A] hover:shadow-xl lg:hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group cursor-pointer font-sans"
                  >
                    {/* Media Thumbnail Container */}
                    <div className="h-28 sm:h-44 lg:h-60 overflow-hidden relative bg-[#0A0A0A]">
                      <RemoteImage
                        src={item.mediaUrl}
                        alt={item.campaignTitle ?? ''}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        width={600} height={600} sizes="(min-width: 1024px) 33vw, 50vw"
                      />

                      {/* Top Badges: Platform & Duration */}
                      <div className="absolute top-1.5 inset-x-1.5 sm:top-3 sm:inset-x-3 flex items-center justify-between z-10 gap-1">
                        <span className="min-w-0 truncate text-[10px] sm:text-xs font-black uppercase tracking-wider bg-black/75 backdrop-blur-md text-white px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full border border-white/15 flex items-center gap-1 shadow-sm">
                          {item.platform === 'instagram' && <Instagram className="w-3 h-3 text-[#FF2D78]" />}
                          {item.platform === 'tiktok' && <Film className="w-3 h-3 text-white" />}
                          {item.platform === 'youtube' && <Youtube className="w-3 h-3 text-red-500" />}
                          {item.platform === 'ugc' && <CategoryIcon name="ugc" size={12} className="text-purple-400" />}
                          <span>{platformLabel(item.platform)}</span>
                        </span>

                        {item.duration && (
                          <span className="shrink-0 text-[10px] sm:text-xs font-extrabold uppercase tracking-wider bg-black/70 backdrop-blur-md text-white px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full border border-white/10">
                            {item.duration}
                          </span>
                        )}
                      </div>

                      {/* Hover Center Play Overlay Button */}
                      <div className="absolute inset-0 bg-black/25 group-hover:bg-black/45 transition-colors flex items-center justify-center">
                        <div className="w-8 h-8 sm:w-14 sm:h-14 rounded-full bg-white/95 group-hover:bg-[#FF2D78] group-hover:text-white text-[#0A0A0A] flex items-center justify-center shadow-xl transition-all duration-300 group-hover:scale-110">
                          <Play className="w-3 h-3 sm:w-5 sm:h-5 fill-current translate-x-0.5" />
                        </div>
                      </div>
                    </div>

                    {/* Card Content Body */}
                    <div className="p-2.5 sm:p-5 flex-1 flex flex-col justify-between space-y-2 sm:space-y-3">
                      <div className="space-y-1 sm:space-y-1.5">
                        <div className="flex items-center justify-between gap-1">
                          <h3 className="min-w-0 truncate font-extrabold text-xs sm:text-base text-[#0A0A0A] group-hover:text-[#FF2D78] transition-colors">
                            {item.brandName}
                          </h3>
                          <span className="shrink-0 text-[10px] sm:text-xs font-extrabold text-[#0A0A0A] bg-[#F4F4F0] px-1.5 sm:px-2.5 py-0.5 rounded-md border border-[#E7E7E2]">
                            {item.views}
                          </span>
                        </div>

                        <p className="text-[11px] sm:text-sm font-semibold text-[#0A0A0A] line-clamp-1">
                          {item.campaignTitle}
                        </p>

                        {item.deliverableType && (
                          <p className="hidden sm:block text-sm text-[#66665E] font-medium line-clamp-1">
                            {item.deliverableType}
                          </p>
                        )}
                      </div>

                      {/* Footer Metrics */}
                      <div className="pt-2 sm:pt-3 border-t border-[#E7E7E2] flex items-center justify-between text-[11px] sm:text-sm font-bold text-[#66665E]">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1 text-[#0A0A0A]">
                            <Heart className="w-3.5 h-3.5 text-[#FF2D78]" />
                            {item.likes}
                          </span>
                          {item.engagementRate && (
                            <span className="flex items-center gap-1 text-[#0A0A0A]">
                              <TrendingUp className="w-3.5 h-3.5 text-[#FF2D78]" />
                              {item.engagementRate}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                color="purple"
                icon={<Film className="w-8 h-8" />}
                badge="Portfolio Filter"
                title={`No Works Found for ${portfolioFilter.toUpperCase()}`}
                description="This creator has not tagged portfolio items specifically for this platform yet. Switch to 'All Works' to preview their full portfolio."
                primaryAction={{
                  label: 'View All Works',
                  onClick: () => setPortfolioFilter('all'),
                }}
                variant="dashed"
              />
            )}
          </div>
        )}

        {/* TAB 4: GALLERY */}
        {activeTab === 'photos' && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E7E7E2] space-y-8">
            <div className="pb-6 border-b border-[#E7E7E2]">
              <h2 className="text-2xl font-extrabold text-[#0A0A0A]">
                Gallery
              </h2>
              <p className="text-sm text-[#66665E] mt-1 font-medium">
                Photos and visual profile of {creator.name}.
              </p>
            </div>

            {/* Clean Photo Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
              {creatorPhotos.length === 0 && (
                <p className="col-span-full py-6 text-center text-sm font-medium text-[#66665E]">No photos yet.</p>
              )}
              {creatorPhotos.map((photo) => (
                <div
                  key={photo.id}
                  onClick={() => setSelectedPhoto(photo)}
                  className="rounded-2xl overflow-hidden border border-[#E7E7E2] bg-[#FAFAF8] hover:border-[#0A0A0A] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 group cursor-pointer aspect-square relative"
                >
                  <RemoteImage
                    src={photo.url}
                    alt={photo.caption || 'Creator editorial photo'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    width={600} height={600} sizes="(min-width: 1024px) 33vw, 50vw"
                  />

                  {/* Gradient & Minimal Zoom Icon on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/20 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-white/95 text-[#0A0A0A] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform mb-2">
                      <ZoomIn className="w-5 h-5 text-[#FF2D78]" />
                    </div>
                    <span className="text-white font-extrabold text-xs tracking-wide">
                      Preview Full Resolution
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: REVIEWS */}
        {activeTab === 'reviews' && (() => {
          const filteredReviews = creator.reviews.filter((rev) => {
            if (reviewFilter !== 'all') return Math.round(rev.rating) === reviewFilter;
            return true;
          });
          const reviewsPerPage = 6;
          const reviewPageCount = Math.ceil(filteredReviews.length / reviewsPerPage);
          const currentReviewPage = Math.min(reviewPage, Math.max(reviewPageCount, 1));
          const reviewPageStart = (currentReviewPage - 1) * reviewsPerPage;
          const displayedReviews = filteredReviews.slice(
            reviewPageStart,
            reviewPageStart + reviewsPerPage,
          );

          return (
            <div className="space-y-3 sm:space-y-6">
              {/* Rating Summary & Trust Breakdown Header Card */}
              <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-8 border border-[#E7E7E2] shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">
                      Brand Reviews
                    </h2>
                    <p className="text-xs sm:text-sm text-[#66665E] mt-0.5 sm:mt-1 font-medium">
                      Reviews from completed collaborations.
                    </p>
                  </div>

                  <div className="shrink-0 p-2 sm:p-4 rounded-xl sm:rounded-2xl bg-[#FAFAF8] border border-[#E7E7E2] flex items-center gap-2 sm:gap-3.5">
                    <div className="text-[1.35rem] sm:text-3xl font-black text-[#0A0A0A] font-sans tracking-tight leading-none">
                      {creator.rating.toFixed(2)}
                    </div>
                    <div>
                      <div className="flex text-amber-500">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3 h-3 sm:w-4 sm:h-4 ${i < Math.round(creator.rating) ? 'fill-amber-500' : 'fill-transparent text-[#D2D2CA]'}`}
                          />
                        ))}
                      </div>
                      <div className="text-[11px] sm:text-sm font-bold text-[#66665E] mt-0.5">
                        {creator.reviewsCount} reviews
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Reviews List & Filter Card */}
              <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-8 border border-[#E7E7E2] shadow-sm space-y-3 sm:space-y-6">
                {/* 1-Line Filter Tabs */}
                <div className="flex items-center justify-between gap-3 pb-2 border-b border-[#E7E7E2] overflow-x-auto min-w-0">
                  <div className="inline-flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0">
                    <button
                      onClick={() => {
                        setReviewFilter('all');
                        setReviewPage(1);
                      }}
                      className={`h-8 sm:h-9 px-3 sm:px-4 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                        reviewFilter === 'all'
                          ? 'bg-[#0A0A0A] text-white shadow-xs'
                          : 'bg-[#FAFAF8] text-[#555550] hover:bg-[#F4F4F0] border border-[#E7E7E2]'
                      }`}
                    >
                      All Reviews
                    </button>
                    {/* One tab per star level that actually has reviews (5 → 1), built from the data. */}
                    {[5, 4, 3, 2, 1].map((stars) => {
                      const count = creator.reviews.filter((r) => Math.round(r.rating) === stars).length;
                      if (count === 0) return null;
                      return (
                        <button
                          key={stars}
                          onClick={() => {
                            setReviewFilter(stars);
                            setReviewPage(1);
                          }}
                          className={`h-8 sm:h-9 px-3 sm:px-4 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1 ${
                            reviewFilter === stars
                              ? 'bg-[#0A0A0A] text-white shadow-xs'
                              : 'bg-[#FAFAF8] text-[#555550] hover:bg-[#F4F4F0] border border-[#E7E7E2]'
                          }`}
                        >
                          <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-amber-400 text-amber-400" />
                          <span>
                            {stars} {stars === 1 ? 'Star' : 'Stars'} ({count})
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <span className="text-sm font-bold text-[#66665E] whitespace-nowrap shrink-0 hidden sm:inline">
                    Showing {filteredReviews.length === 0 ? 0 : reviewPageStart + 1}–{Math.min(reviewPageStart + reviewsPerPage, filteredReviews.length)} of {filteredReviews.length} reviews
                  </span>
                </div>

                {/* Reviews Cards List */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
                  {displayedReviews.map((rev) => (
                    <div key={rev.id} className="p-3 sm:p-6 rounded-xl sm:rounded-2xl bg-[#FAFAF8] border border-[#E7E7E2] hover:border-[#0A0A0A]/30 transition-all space-y-2 sm:space-y-4 flex flex-col justify-between group shadow-2xs">
                      <div className="space-y-2 sm:space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <BrandLogo name={rev.brandName} logoUrl={rev.brandLogo} size="sm" className="sm:!w-10 sm:!h-10" />
                            <div className="min-w-0">
                              <div className="font-extrabold text-[13px] sm:text-sm text-[#0A0A0A] truncate">{rev.brandName}</div>
                              <div className="text-[11px] sm:text-sm text-[#66665E] truncate">{rev.date}</div>
                            </div>
                          </div>
                          <div className="flex text-amber-500 shrink-0">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-3 h-3 sm:w-4 sm:h-4 ${i < Math.round(rev.rating) ? 'fill-amber-500' : 'fill-transparent text-[#D2D2CA]'}`}
                              />
                            ))}
                          </div>
                        </div>

                        <p className="text-[13px] sm:text-[15px] text-[#44443E] leading-snug sm:leading-[24px] italic font-normal line-clamp-3 sm:line-clamp-none">
                          &ldquo;{rev.comment}&rdquo;
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {reviewPageCount > 1 && (
                  <nav
                    aria-label="Review pagination"
                    className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-5 border-t border-[#E7E7E2]"
                  >
                    <p className="text-sm font-semibold text-[#66665E]">
                      Page {currentReviewPage} of {reviewPageCount}
                    </p>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setReviewPage((page) => Math.max(1, page - 1))}
                        disabled={currentReviewPage === 1}
                        aria-label="Previous reviews page"
                        className="w-9 h-9 rounded-full border border-[#E7E7E2] bg-white text-[#0A0A0A] flex items-center justify-center transition-colors hover:border-[#0A0A0A] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:border-[#E7E7E2]"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      {Array.from({ length: reviewPageCount }, (_, index) => index + 1).map((page) => (
                        <button
                          key={page}
                          type="button"
                          onClick={() => setReviewPage(page)}
                          aria-current={page === currentReviewPage ? 'page' : undefined}
                          className={`w-9 h-9 rounded-full text-sm font-bold transition-colors ${
                            page === currentReviewPage
                              ? 'bg-[#0A0A0A] text-white'
                              : 'bg-white border border-[#E7E7E2] text-[#555550] hover:border-[#0A0A0A] hover:text-[#0A0A0A]'
                          }`}
                        >
                          {page}
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={() => setReviewPage((page) => Math.min(reviewPageCount, page + 1))}
                        disabled={currentReviewPage === reviewPageCount}
                        aria-label="Next reviews page"
                        className="w-9 h-9 rounded-full border border-[#E7E7E2] bg-white text-[#0A0A0A] flex items-center justify-center transition-colors hover:border-[#0A0A0A] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:border-[#E7E7E2]"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </nav>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Interactive Video Showcase & Portfolio Modal */}
      <PortfolioVideoModal
        item={selectedPublicPortfolioItem}
        creator={creator}
        onClose={() => setSelectedPortfolioItem(null)}
        onBookCampaign={!isOtherCreator ? handleBookFromPortfolio : undefined}
      />

      {/* Interactive High-Res Lookbook & Photo Lightbox */}
      <CreatorPhotoLightbox
        photo={selectedPhoto}
        photos={creatorPhotos}
        creator={creator}
        onClose={() => setSelectedPhoto(null)}
        onSelectPhoto={(p) => setSelectedPhoto(p)}
        onBookCampaign={!isOtherCreator ? () => {
          setSelectedPhoto(null);
          handleOpenOffer();
        } : undefined}
      />

      {/* Share Profile Modal */}
      <ShareProfileModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        title={creator.name}
        subtitle={`@${creator.handle} • ${creator.categories.map(labelize).join(' • ')}`}
        shareUrl={`/creators/${creator.handle || creator.id}`}
        avatar={creator.avatar}
        role="creator"
      />

    </div>
  );
}
