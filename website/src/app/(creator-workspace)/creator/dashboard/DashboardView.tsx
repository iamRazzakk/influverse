'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/session/AuthProvider';
import type { CreatorProfile } from '@/types/api';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import {
  DollarSign,
  ShoppingBag,
  Package,
  Film,
  ChevronRight,
  CreditCard,
  MessageSquare,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { CreatorAnnualAnalytics } from '@/components/shared/CreatorAnnualAnalytics';
import { ProfileCompletionCard } from '@/components/shared/ProfileCompletionCard';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { formatCents } from '@/lib/format';
import type { Order, OrderStats, OrderStatus } from '@/lib/api/endpoints/orders';
import type { Paginated } from '@/lib/api/types';

/** Work in progress for the creator (escrow funded, not yet released). */
const ACTIVE_STATUSES: OrderStatus[] = ['in_production', 'deliverable_submitted', 'disputed'];
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * Creator dashboard UI. The server page loads GET /orders/stats (for the selected `?year=`) and the
 * latest orders; the profile (counts, approval status) comes from the server-filled session.
 */
export function DashboardView({
  stats,
  orderPage,
  selectedYear,
}: {
  stats: OrderStats | null;
  orderPage: Paginated<Order> | null;
  selectedYear: number;
}) {
  const profile = useAuth().profile as CreatorProfile | null;

  // Totals from GET /orders/stats (earned = released from escrow); list = live orders, newest first.
  const activeOrders = (orderPage?.items ?? []).filter((o) => ACTIVE_STATUSES.includes(o.status));
  const totalEarnedCents = stats?.summary.lifetimeCents ?? 0;
  const activeOrdersCount = stats?.summary.activeCount ?? activeOrders.length;

  return (
    <div className="min-h-screen pb-16 font-sans">
      <WorkspaceHeader
        title="Dashboard"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Profile Completion Nudge Card (Dynamic % & Actionable Checklist) */}
        {profile?.approvalStatus === 'under_review' && (
          <div className="p-4 sm:p-5 rounded-lg border border-amber-200 bg-amber-50 flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-[#0A0A0A]">Your profile is under review</div>
              <p className="text-sm text-[#66665E] font-medium">
                Our team is checking your profile. Brands can find and hire you once it is approved.
              </p>
            </div>
          </div>
        )}
        {profile?.approvalStatus === 'action_required' && (
          <Link
            href="/creator/profile"
            className="p-4 sm:p-5 rounded-lg border border-rose-200 bg-rose-50 flex items-start gap-3 hover:border-rose-400 transition-colors"
          >
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-[#0A0A0A]">Your profile needs a few changes</div>
              <p className="text-sm text-[#66665E] font-medium">{profile.approvalNote || 'Please update your profile and resubmit.'}</p>
            </div>
          </Link>
        )}

        {profile && <ProfileCompletionCard creator={profile} />}

        {/* Executive Metric Highlights */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-5">
          {/* Total Earned */}
          <Link
            href="/creator/payments"
            className="min-w-0 bg-white p-3 sm:p-6 rounded-xl border border-[#E7E7E2] hover:border-[#0A0A0A] shadow-2xs space-y-1 sm:space-y-2 transition-all block cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wide leading-tight text-[#66665E]">
                Total Earned
              </span>
              <div className="hidden sm:flex w-8 h-8 rounded-lg bg-[#FAFAF8] text-[#0A0A0A] border border-[#E7E7E2] items-center justify-center group-hover:scale-105 transition-transform">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="truncate text-lg sm:text-3xl font-black tracking-tight text-[#0A0A0A]">
              {formatCents(totalEarnedCents)}
            </div>
          </Link>

          {/* Active Campaigns */}
          <Link
            href="/creator/campaigns"
            className="min-w-0 bg-white p-3 sm:p-6 rounded-xl border border-[#E7E7E2] hover:border-[#0A0A0A] shadow-2xs space-y-1 sm:space-y-2 transition-all block cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wide leading-tight text-[#66665E]">
                Active Campaigns
              </span>
              <div className="hidden sm:flex w-8 h-8 rounded-lg bg-[#FAFAF8] text-[#0A0A0A] border border-[#E7E7E2] items-center justify-center group-hover:scale-105 transition-transform">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="truncate text-lg sm:text-3xl font-black tracking-tight text-[#0A0A0A]">
              {activeOrdersCount}
            </div>
          </Link>

          {/* Portfolio Summary */}
          <Link
            href="/creator/profile"
            className="min-w-0 bg-white p-3 sm:p-6 rounded-xl border border-[#E7E7E2] hover:border-[#0A0A0A] shadow-2xs space-y-1 sm:space-y-2 transition-all block cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wide leading-tight text-[#66665E]">
                Portfolio
              </span>
              <div className="hidden sm:flex w-8 h-8 rounded-lg bg-[#FAFAF8] text-[#0A0A0A] border border-[#E7E7E2] items-center justify-center group-hover:scale-105 transition-transform">
                <Film className="w-4 h-4" />
              </div>
            </div>
            <div className="truncate text-lg sm:text-3xl font-black tracking-tight text-[#0A0A0A]">
              {profile?.portfolioCount ?? 0}
            </div>
          </Link>
        </div>

        {/* 12-Month Annual Performance & Brand Collabs Analytics */}
        <CreatorAnnualAnalytics stats={stats} selectedYear={selectedYear} />

        {/* Active Fulfillment Pipeline */}
        <div className="sm:bg-white sm:rounded-xl sm:p-6 sm:border sm:border-[#E7E7E2] sm:shadow-2xs space-y-4 sm:space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E7E7E2]">
              <div>
                <h2 className="text-2xl font-extrabold text-[#0A0A0A] tracking-tight">
                  Active Deliverables
                </h2>
                <p className="text-sm text-[#66665E] mt-0.5 font-medium">
                  {activeOrdersCount} in progress
                </p>
              </div>
              <Link
                href="/creator/campaigns"
                className="text-sm font-bold text-[#0A0A0A] hover:text-zinc-600 flex items-center gap-1 transition-colors"
              >
                <span>View All</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {activeOrders.length > 0 ? (
              <div className="space-y-3">
                {activeOrders.slice(0, 3).map((order) => (
                  <Link
                    key={order.id}
                    href={`/creator/orders/${order.id}`}
                    className="p-3.5 sm:p-4 rounded-lg bg-white sm:bg-[#FAFAF8] border border-[#E7E7E2] flex items-center justify-between gap-3 hover:border-[#0A0A0A] transition-all group block cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <BrandLogo name={order.counterpart?.name ?? 'Brand'} logoUrl={order.counterpart?.avatar ?? undefined} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-sm text-[#0A0A0A] group-hover:text-[#FF2D78] transition-colors truncate">
                            {order.counterpart?.name ?? 'Brand'}
                          </h4>
                          {order.platforms[0] && (
                            <span className="hidden sm:inline text-xs uppercase font-bold px-2 py-0.5 rounded-md bg-[#EAEAE3] text-[#4A4A45]">
                              {order.platforms[0]}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#66665E] font-medium mt-0.5">
                          {order.dueAt ? `Due: ${shortDate(order.dueAt)} • ` : ''}
                          {formatCents(order.priceCents)}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-md ${
                          order.status === 'deliverable_submitted'
                            ? 'bg-[#FFF0F5] text-[#FF2D78] border border-[#FF2D78]/25'
                            : order.status === 'disputed'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-[#F4F4F0] text-[#0A0A0A] border border-[#E7E7E2]'
                        }`}
                      >
                        {order.status === 'deliverable_submitted' ? 'In Review' : order.status === 'disputed' ? 'On Hold' : 'Producing'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-[#A3A39C] group-hover:text-[#0A0A0A] group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-[#FAFAF8] border border-[#E7E7E2] flex items-center justify-center mx-auto text-[#66665E]">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div className="text-sm font-bold text-[#0A0A0A]">No Active Production Orders</div>
                <p className="text-sm text-[#66665E] max-w-sm mx-auto">
                  Your pipeline is currently clear. Accepted brand proposals will appear here with upload portals.
                </p>
              </div>
            )}
        </div>

        {/* Quick Utility Shortcuts */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/creator/packages"
            className="p-3.5 sm:p-4 rounded-lg bg-white border border-[#E7E7E2] hover:border-[#0A0A0A] transition-all flex flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:gap-3 shadow-2xs group"
          >
            <div className="w-9 h-9 rounded-lg bg-[#FAFAF8] text-[#0A0A0A] flex items-center justify-center group-hover:bg-[#0A0A0A] group-hover:text-white transition-colors">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#0A0A0A]">Rate Card</div>
              <div className="text-xs sm:text-sm text-[#66665E]">Packages & pricing</div>
            </div>
          </Link>

          <Link
            href="/creator/portfolio"
            className="p-3.5 sm:p-4 rounded-lg bg-white border border-[#E7E7E2] hover:border-[#0A0A0A] transition-all flex flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:gap-3 shadow-2xs group"
          >
            <div className="w-9 h-9 rounded-lg bg-[#FAFAF8] text-[#0A0A0A] flex items-center justify-center group-hover:bg-[#0A0A0A] group-hover:text-white transition-colors">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#0A0A0A]">Portfolio Studio</div>
              <div className="text-xs sm:text-sm text-[#66665E]">Campaigns & media</div>
            </div>
          </Link>

          <Link
            href="/creator/payments"
            className="p-3.5 sm:p-4 rounded-lg bg-white border border-[#E7E7E2] hover:border-[#0A0A0A] transition-all flex flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:gap-3 shadow-2xs group"
          >
            <div className="w-9 h-9 rounded-lg bg-[#FAFAF8] text-[#0A0A0A] flex items-center justify-center group-hover:bg-[#0A0A0A] group-hover:text-white transition-colors">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#0A0A0A]">Payouts</div>
              <div className="text-xs sm:text-sm text-[#66665E]">Escrow ledger</div>
            </div>
          </Link>

          <Link
            href="/creator/messages"
            className="p-3.5 sm:p-4 rounded-lg bg-white border border-[#E7E7E2] hover:border-[#0A0A0A] transition-all flex flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:gap-3 shadow-2xs group"
          >
            <div className="w-9 h-9 rounded-lg bg-[#FAFAF8] text-[#0A0A0A] flex items-center justify-center group-hover:bg-[#0A0A0A] group-hover:text-white transition-colors">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#0A0A0A]">Inquiries</div>
              <div className="text-xs sm:text-sm text-[#66665E]">Brand direct chat</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
