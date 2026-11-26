'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/session/AuthProvider';
import type { PublicBrand } from '@/lib/api/endpoints/public';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { formatLocation, labelize } from '@/components/shared/creatorFormat';
import {
  MapPin,
  Globe,
  ExternalLink,
  Star,
  Users,
  Building2,
  ChevronRight,
  Award,
  MessageSquare,
} from 'lucide-react';
import { message } from 'antd';
import { RemoteImage } from '@/components/shared/RemoteImage';

/** Review cards shown on the brand page. Filled once the reviews API exists (server Phase 5). */
type BrandReview = {
  id: string;
  creatorName: string;
  creatorAvatar: string;
  creatorHandle: string;
  campaignTitle: string;
  rating: number;
  comment: string;
  date: string;
  collaborationType?: string;
};

const formatCompanySize = (size?: string) => (size ? `${size} employees` : 'Company size not set');

/**
 * Public brand page UI. The brand (GET /brands/:slug) is loaded by the server page and passed in;
 * only viewer-specific bits (is this my own brand?) come from the browser session.
 */
export function BrandProfileView({ data }: { data: PublicBrand }) {
  const { currentUser } = useAuth();

  const [reviewTab, setReviewTab] = useState<'received' | 'given'>('received');

  // View model for the existing layout (stats default to 0 until orders / reviews exist).
  const brand = {
    id: data.id,
    companyName: data.companyName || data.contactName,
    contactName: data.contactName,
    logo: data.logo || data.avatar || undefined,
    verified: Boolean(data.verified),
    industry: labelize(data.industry) || 'Brand',
    industryTags: data.industryTags ?? [],
    website: data.website,
    location: formatLocation(data.city, data.country) || '—',
    companySize: data.companySize,
    bio: data.bio || data.tagline || '',
    stats: {
      totalCampaigns: data.stats?.totalCampaigns ?? 0,
      rating: data.stats?.reviewsCount ? (data.stats.rating ?? 0).toFixed(1) : 'New',
      reviewsCount: data.stats?.reviewsCount ?? 0,
    },
  };

  const isCurrentBrandOwner = currentUser?.role === 'brand' && currentUser.id === brand.id;

  const reviewsGivenList: BrandReview[] = [];
  const reviewsReceivedList: BrandReview[] = [];

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#0A0A0A] font-sans pb-24">
      {/* 1. TOP BREADCRUMB & UTILITY NAVIGATION */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <nav className="flex items-center gap-2 text-xs font-semibold text-[#66665E]">
            <Link href="/" className="hover:text-[#0A0A0A] transition-colors">
              Home
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-[#A3A39C]" />
            <Link href="/creator/campaigns" className="hover:text-[#0A0A0A] transition-colors">
              Brands
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-[#A3A39C]" />
            <span className="text-[#0A0A0A] font-bold truncate max-w-[200px]">
              {brand.companyName}
            </span>
          </nav>

          <div className="flex items-center gap-2">
            {isCurrentBrandOwner && (
              <Link
                href="/brand/settings"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white border border-[#E7E7E2] hover:border-[#0A0A0A] text-xs font-bold text-[#0A0A0A] transition-all shadow-2xs"
              >
                <span>Edit Brand Profile</span>
              </Link>
            )}

          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* 2. CLEAN BRAND IDENTITY HEADER (NO COVER BANNER) */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E7E7E2] shadow-2xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              {/* Brand Logo */}
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-[#FAFAF8] border border-[#E7E7E2] flex items-center justify-center p-2 shrink-0 shadow-xs">
                <BrandLogo name={brand.companyName} logoUrl={brand.logo} size="lg" />
              </div>

              {/* Title, Badge & Meta */}
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-black text-[#0A0A0A] tracking-tight">
                    {brand.companyName}
                  </h1>
                  {brand.verified && (
                    <VerifiedBadge size="md" title="Verified" />
                  )}
                  <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#FFF0F5] border border-[#FF2D78]/25 text-[#FF2D78]">
                    {brand.industry.split(',')[0]}
                  </span>
                </div>

                <div className="flex items-center gap-3 sm:gap-4 flex-wrap text-xs sm:text-sm text-[#66665E] font-medium">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#A3A39C]" />
                    <span>{brand.location}</span>
                  </span>
                  {brand.website && (
                    <a
                      href={brand.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[#0A0A0A] font-semibold hover:underline"
                    >
                      <Globe className="w-4 h-4 text-[#A3A39C]" />
                      <span>{brand.website.replace(/^https?:\/\//, '')}</span>
                      <ExternalLink className="w-3 h-3 text-[#A3A39C]" />
                    </a>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-[#A3A39C]" />
                    <span>{formatCompanySize(brand.companySize)}</span>
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* Trust & Performance Track Record Highlights */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="p-3.5 rounded-2xl bg-[#FAFAF8] border border-[#E7E7E2]/80">
              <div className="flex items-center gap-2 text-xs font-bold text-[#66665E] uppercase tracking-wider">
                <Users className="w-3.5 h-3.5 text-[#FF2D78]" />
                <span>Collaborations</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-[#0A0A0A]">
                  {brand.stats.totalCampaigns}+
                </span>
                <span className="text-xs font-bold text-emerald-600">Creators Partnered</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FAFAF8] border border-[#E7E7E2]/80">
              <div className="flex items-center gap-2 text-xs font-bold text-[#66665E] uppercase tracking-wider">
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span>Rating</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-[#0A0A0A]">
                  {brand.stats.rating}
                </span>
                <span className="text-xs text-[#66665E]">/ 5.0</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FAFAF8] border border-[#E7E7E2]/80">
              <div className="flex items-center gap-2 text-xs font-bold text-[#66665E] uppercase tracking-wider">
                <MessageSquare className="w-3.5 h-3.5 text-[#0A0A0A]" />
                <span>Reviews</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl sm:text-2xl font-black text-[#0A0A0A]">
                  {brand.stats.reviewsCount}
                </span>
                <span className="text-xs text-[#66665E]">Creator reviews</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. MAIN CONTENT GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* LEFT 2 COLUMNS: ABOUT & REVIEWS */}
          <div className="lg:col-span-2 space-y-8">
            {/* About the Brand */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E7E7E2] shadow-2xs space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#FAFAF8] border border-[#E7E7E2] flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-[#0A0A0A]" />
                </div>
                <h2 className="text-lg font-extrabold text-[#0A0A0A] tracking-tight">
                  About {brand.companyName}
                </h2>
              </div>

              <p className="text-sm sm:text-base text-[#44443E] leading-relaxed font-normal">
                {brand.bio}
              </p>

              {/* Niche Industry Tags */}
              {brand.industryTags && brand.industryTags.length > 0 && (
                <div className="pt-2 space-y-2">
                  <span className="text-xs font-bold text-[#66665E] uppercase tracking-wider block">
                    Focus Areas &amp; Aesthetic
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {brand.industryTags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 rounded-xl bg-[#FAFAF8] border border-[#E7E7E2] text-xs font-bold text-[#0A0A0A]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* REVIEWS & ENDORSEMENTS SECTION */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E7E7E2] shadow-2xs space-y-6">
              {/* Header: Creators/visitors only see Creator Reviews; Brand owner sees private toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
                <div>
                  <h2 className="text-xl font-black text-[#0A0A0A] tracking-tight">
                    {reviewTab === 'given' ? 'Reviews Given to Creators' : 'Creator Reviews'}
                  </h2>
                  <p className="text-xs text-[#66665E]">
                    {reviewTab === 'given'
                      ? `Private record of reviews ${brand.companyName} left for creators.`
                      : `Verified feedback from creators who collaborated with ${brand.companyName}.`}
                  </p>
                </div>

                {/* Sub-tab switcher: Only visible to the brand owner */}
                {isCurrentBrandOwner ? (
                  <div className="flex items-center bg-[#FAFAF8] p-1 rounded-2xl border border-[#E7E7E2]">
                    <button
                      type="button"
                      onClick={() => setReviewTab('received')}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        reviewTab === 'received'
                          ? 'bg-white text-[#0A0A0A] shadow-xs'
                          : 'text-[#66665E] hover:text-[#0A0A0A]'
                      }`}
                    >
                      <span>Reviews Received ({reviewsReceivedList.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewTab('given')}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        reviewTab === 'given'
                          ? 'bg-white text-[#0A0A0A] shadow-xs'
                          : 'text-[#66665E] hover:text-[#0A0A0A]'
                      }`}
                    >
                      <span>Reviews Given ({reviewsGivenList.length})</span>
                      <span className="text-[10px] ml-1 text-[#FF2D78] font-bold">(Private)</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAFAF8] border border-[#E7E7E2] text-xs font-bold text-[#0A0A0A]">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>{brand.stats.rating}</span>
                    <span className="text-[#66665E] font-medium">({brand.stats.reviewsCount})</span>
                  </div>
                )}
              </div>

              {/* REVIEWS RECEIVED FROM CREATORS (Default & Public View) */}
              {reviewTab === 'received' && (
                <div className="space-y-4">
                  {reviewsReceivedList.length > 0 ? (
                    reviewsReceivedList.map((rev) => (
                      <div
                        key={rev.id}
                        className="rounded-2xl p-5 border border-[#E7E7E2] bg-[#FAFAF8]/60 hover:bg-[#FAFAF8] transition-all space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <RemoteImage
                              src={rev.creatorAvatar}
                              alt={rev.creatorName ?? ''}
                              className="w-11 h-11 rounded-full object-cover border border-[#E7E7E2]"
                              width={88} height={88} sizes="44px"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-extrabold text-[#0A0A0A]">
                                  {rev.creatorName}
                                </h4>
                                <span className="text-xs text-[#66665E] font-medium">
                                  {rev.creatorHandle}
                                </span>
                              </div>
                              <span className="text-xs text-[#FF2D78] font-semibold">
                                {rev.campaignTitle}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="flex items-center gap-0.5 justify-end">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-3.5 h-3.5 ${
                                    i < rev.rating
                                      ? 'fill-amber-400 text-amber-400'
                                      : 'text-[#E7E7E2]'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="text-[11px] text-[#A3A39C] mt-0.5 block">
                              {rev.date}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs sm:text-sm text-[#44443E] leading-relaxed italic bg-white p-3.5 rounded-xl border border-[#E7E7E2]">
                          &ldquo;{rev.comment}&rdquo;
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center border border-[#E7E7E2] rounded-2xl space-y-2">
                      <Star className="w-8 h-8 text-[#A3A39C] mx-auto" />
                      <h4 className="text-sm font-bold text-[#0A0A0A]">No Reviews Received Yet</h4>
                      <p className="text-xs text-[#66665E]">
                        Creator feedback appears here after milestones are completed and signed off.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* REVIEWS GIVEN BY THE BRAND TO CREATORS (Only visible to the Brand Owner privately) */}
              {isCurrentBrandOwner && reviewTab === 'given' && (
                <div className="space-y-4">
                  {reviewsGivenList.length > 0 ? (
                    reviewsGivenList.map((rev) => (
                      <div
                        key={rev.id}
                        className="rounded-2xl p-5 border border-[#E7E7E2] bg-[#FAFAF8]/60 hover:bg-[#FAFAF8] transition-all space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <RemoteImage
                              src={rev.creatorAvatar}
                              alt={rev.creatorName ?? ''}
                              className="w-11 h-11 rounded-full object-cover border border-[#E7E7E2]"
                              width={88} height={88} sizes="44px"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-extrabold text-[#0A0A0A]">
                                  {rev.creatorName}
                                </h4>
                                <span className="text-xs text-[#66665E] font-medium">
                                  {rev.creatorHandle}
                                </span>
                              </div>
                              <span className="text-xs text-[#FF2D78] font-semibold">
                                {rev.collaborationType}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="flex items-center gap-0.5 justify-end">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-3.5 h-3.5 ${
                                    i < rev.rating
                                      ? 'fill-amber-400 text-amber-400'
                                      : 'text-[#E7E7E2]'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="text-[11px] text-[#A3A39C] mt-0.5 block">
                              {rev.date}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs sm:text-sm text-[#44443E] leading-relaxed italic bg-white p-3.5 rounded-xl border border-[#E7E7E2]">
                          &ldquo;{rev.comment}&rdquo;
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center border border-[#E7E7E2] rounded-2xl space-y-2">
                      <Award className="w-8 h-8 text-[#A3A39C] mx-auto" />
                      <h4 className="text-sm font-bold text-[#0A0A0A]">No Reviews Given Yet</h4>
                      <p className="text-xs text-[#66665E]">
                        {brand.companyName} will publish creator endorsements as completed partnerships conclude.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: PARTNERSHIP PITCH & BRAND SPECS */}
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-[#E7E7E2] shadow-2xs space-y-5 sticky top-24">
              {/* Brand Meta Specs */}
              <div className="p-4 rounded-2xl bg-[#FAFAF8] border border-[#E7E7E2] space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-[#66665E]">
                  <span>Total Collaborations:</span>
                  <strong className="text-[#0A0A0A] font-bold">{brand.stats.totalCampaigns}+ Creators</strong>
                </div>
                <div className="flex items-center justify-between text-[#66665E]">
                  <span>Partnerships Lead:</span>
                  <strong className="text-[#0A0A0A]">{brand.contactName}</strong>
                </div>
                <div className="flex items-center justify-between text-[#66665E]">
                  <span>Location:</span>
                  <strong className="text-[#0A0A0A]">{brand.location}</strong>
                </div>
                {brand.website && (
                  <div className="flex items-center justify-between text-[#66665E]">
                    <span>Website:</span>
                    <a
                      href={brand.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0A0A0A] font-bold hover:underline"
                    >
                      {brand.website.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                )}
                <div className="flex items-center justify-between text-[#66665E]">
                  <span>Rating:</span>
                  <div className="flex items-center gap-1 font-bold text-[#0A0A0A]">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>{brand.stats.rating}</span>
                    <span className="text-[#A3A39C] font-normal">
                      ({brand.stats.reviewsCount})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
