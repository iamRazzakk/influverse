'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/session/AuthProvider';
import type { Paginated } from '@/lib/api/types';
import type { SavedCreatorCard } from '@/types/public';
import type { BrandProfile } from '@/types/api';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { CreatorCard } from '@/components/shared/CreatorCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { AccountAvatar } from '@/components/auth/AccountAvatar';
import { formatCents } from '@/lib/format';
import type { Order, OrderStats, OrderStatus } from '@/lib/api/endpoints/orders';
import {
  ShoppingBag,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  PlusCircle,
  Bookmark,
} from 'lucide-react';
import { BrandAnnualAnalytics } from '@/components/shared/BrandAnnualAnalytics';

/** Orders still running (paid or waiting for payment, not yet released / cancelled). */
const ACTIVE_STATUSES: OrderStatus[] = ['awaiting_payment', 'in_production', 'deliverable_submitted', 'disputed'];

const STATUS_COLORS: Record<string, string> = {
  awaiting_payment: 'bg-[#F4F4F0] text-[#66665E] border border-[#E7E7E2]',
  in_production: 'bg-[#F4F4F0] text-[#0A0A0A] border border-[#E7E7E2]',
  deliverable_submitted: 'bg-[#FFF0F5] text-[#FF2D78] border border-[#FF2D78]/25 font-bold',
  disputed: 'bg-amber-50 text-amber-700 border border-amber-200',
};

const STATUS_LABELS: Record<string, string> = {
  awaiting_payment: 'Payment Required',
  in_production: 'In Production',
  deliverable_submitted: 'In Review',
  disputed: 'On Hold',
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  ugc: 'UGC Video',
};

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

interface DashboardViewProps {
  /** GET /orders/stats?year= (summary + the chart's year). */
  stats: OrderStats | null;
  year: number;
  orderPage: Paginated<Order> | null;
  saved: Paginated<SavedCreatorCard> | null;
}

export function DashboardView({ stats, year, orderPage, saved }: DashboardViewProps) {
  const { currentUser, profile } = useAuth();
  const companyName = (profile as BrandProfile | null)?.companyName || currentUser?.name || '';

  // Totals from GET /orders/stats; the list shows live orders (newest first).
  const activeOrders = (orderPage?.items ?? []).filter((o) => ACTIVE_STATUSES.includes(o.status));
  const activeCampaigns = stats?.summary.activeCount ?? activeOrders.length;
  const lifetimeSpendCents = stats?.summary.lifetimeCents ?? 0;

  // Shortlist preview: GET /me/saved-creators (first 4).
  const savedCreators = saved?.items ?? [];
  const savedTotal = saved?.meta.total ?? 0;

  return (
    <div className="min-h-screen">
      <WorkspaceHeader
        title="Dashboard"
        subtitle={companyName}
        action={
          <Link
            href="/brand/hire/new"
            className="h-10 px-4 sm:px-5 rounded-lg font-bold text-xs sm:text-sm bg-[#0A0A0A] hover:bg-black text-white flex items-center gap-2 cursor-pointer transition-all shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Campaign</span>
          </Link>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 font-sans">
        <div className="grid grid-cols-2 gap-4 sm:gap-6">
          <Link
            href="/brand/campaigns"
            className="min-w-0 bg-white p-4 sm:p-6 rounded-xl border border-[#E7E7E2] hover:border-[#0A0A0A] shadow-2xs space-y-2 transition-all block cursor-pointer group"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[#66665E]">
                Active Campaigns
              </span>
              <div className="hidden sm:flex w-8 h-8 rounded-lg bg-[#FAFAF8] text-[#0A0A0A] border border-[#E7E7E2] items-center justify-center group-hover:scale-105 transition-transform">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#0A0A0A] tracking-tight">
              {activeCampaigns}
            </div>
          </Link>

          <Link
            href="/brand/payments"
            className="min-w-0 bg-white p-4 sm:p-6 rounded-xl border border-[#E7E7E2] hover:border-[#0A0A0A] shadow-2xs space-y-2 transition-all block cursor-pointer group"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[#66665E]">
                Lifetime Spend
              </span>
              <div className="hidden sm:flex w-8 h-8 rounded-lg bg-[#FAFAF8] text-[#0A0A0A] border border-[#E7E7E2] items-center justify-center group-hover:scale-105 transition-transform">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#0A0A0A] tracking-tight">
              {formatCents(lifetimeSpendCents)}
            </div>
          </Link>
        </div>

        {/* 12-Month Annual Campaign Spend & Creator Hires Analytics */}
        <BrandAnnualAnalytics stats={stats} year={year} />

        {/* Active Campaigns Table / List */}
        <div className="sm:bg-white sm:rounded-xl sm:p-6 sm:border sm:border-[#E7E7E2] sm:shadow-2xs space-y-4 sm:space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#E7E7E2]">
            <div>
              <h2 className="text-2xl font-extrabold text-[#0A0A0A] tracking-tight">
                Active Campaigns
              </h2>
              <p className="text-sm text-[#66665E] mt-0.5 font-medium">
                {activeCampaigns} in progress
              </p>
            </div>
            <Link
              href="/brand/campaigns"
              className="text-sm font-bold text-[#0A0A0A] hover:text-zinc-600 flex items-center gap-1 transition-colors"
            >
              <span>View All</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {activeOrders.length > 0 ? (
            <div className="space-y-3">
              {activeOrders.slice(0, 5).map((order) => {
                const creator = order.counterpart;
                const platform = order.platforms[0];
                return (
                  <div
                    key={order.id}
                    className="p-4 rounded-lg bg-white sm:bg-[#FAFAF8] border border-[#E7E7E2] flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 hover:border-[#0A0A0A] transition-all"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <AccountAvatar src={creator?.avatar} name={creator?.name} className="w-11 h-11 rounded-full border border-[#E7E7E2] shrink-0" />
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-base text-[#0A0A0A] leading-tight">{creator?.name ?? 'Creator'}</h3>
                          {creator?.verified && <VerifiedBadge size="xs" />}
                          {platform && (
                            <span className="text-xs uppercase tracking-wider font-bold px-2.5 py-0.5 rounded-md bg-[#EAEAE3] text-[#4A4A45] leading-none">
                              {PLATFORM_LABELS[platform] || platform}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-[#66665E] font-medium">
                          <span className="font-extrabold text-[#0A0A0A]">{formatCents(order.totalCents)}</span>
                          <span className="text-[#D2D2CA]">•</span>
                          <span>{order.dueAt ? `Due ${shortDate(order.dueAt)}` : 'Awaiting payment'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex w-full items-center justify-between gap-3 border-t border-[#E7E7E2] pt-3 md:w-auto md:justify-end md:border-0 md:pt-0 shrink-0">
                      <span
                        className={`text-sm font-semibold px-3.5 py-1.5 rounded-md leading-none inline-flex items-center ${
                          STATUS_COLORS[order.status] || 'bg-[#F4F4F0] text-[#0A0A0A]'
                        }`}
                      >
                        {STATUS_LABELS[order.status] || order.status}
                      </span>

                      <Link href={`/brand/orders/${order.id}`}>
                        <button className="h-8 px-3 rounded-lg text-sm font-bold bg-[#0A0A0A] text-white hover:bg-[#FF2D78] transition-all cursor-pointer">
                          Manage
                        </button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              color="neutral"
              icon={<ShieldCheck className="w-8 h-8" />}
              title="No active campaigns yet"
              description="Find a creator, pick a package and send an offer. Your campaigns will show up here."
              primaryAction={{ label: 'Find Creators', href: '/creators' }}
              variant="plain"
            />
          )}
        </div>

        {/* Shortlisted Creators Grid */}
        <div className="sm:bg-white sm:rounded-xl sm:p-6 sm:border sm:border-[#E7E7E2] sm:shadow-2xs space-y-4 sm:space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#E7E7E2]">
            <div>
              <h2 className="text-2xl font-extrabold text-[#0A0A0A] tracking-tight">
                Shortlist
              </h2>
              <p className="text-sm text-[#66665E] mt-0.5 font-medium">
                {savedTotal} saved
              </p>
            </div>
            <Link
              href="/brand/saved"
              className="text-sm font-bold text-[#0A0A0A] hover:text-zinc-600 flex items-center gap-1 transition-colors"
            >
              <span>View All</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {savedCreators.length > 0 ? (
            <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4">
              {savedCreators.map((creator) => (
                <div key={creator.id} className="w-[72%] max-w-[280px] shrink-0 snap-start sm:w-auto sm:max-w-none">
                  <CreatorCard creator={creator} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              color="neutral"
              icon={<Bookmark className="w-8 h-8" />}
              badge="Shortlist"
              title="No Saved Creators Yet"
              description="Bookmark creators while browsing the marketplace to quickly compare rates and issue bulk campaign briefs."
              primaryAction={{
                label: 'Explore Verified Creators',
                href: '/creators',
              }}
              variant="plain"
            />
          )}
        </div>
      </div>
    </div>
  );
}
