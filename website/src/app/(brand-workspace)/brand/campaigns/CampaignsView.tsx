'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { AccountAvatar } from '@/components/auth/AccountAvatar';
import { tabOf, useCampaignRows, type CampaignSources, type CampaignTab } from '@/components/shared/useCampaignRows';
import {
  Layers,
  PlusCircle,
  ArrowRight,
  Search,
  Loader2,
} from 'lucide-react';
import { Input, message } from 'antd';
import { usePaymentReturn } from '@/components/shared/usePaymentReturn';
import { useRouter } from 'next/navigation';
import { http } from '@/lib/api/client';
import { offersEndpoints } from '@/lib/api/endpoints/offers';
import { ordersEndpoints } from '@/lib/api/endpoints/orders';
import { getErrorMessage } from '@/lib/api/errors';
import { Button as AppButton } from '@/components/ui';

const eur = (cents: number) => `€${(cents / 100).toLocaleString('en-IE', { maximumFractionDigits: 2 })}`;

const statusColors: Record<string, string> = {
  offer_unpaid: 'bg-[#FFF0F5] text-[#FF2D78] border border-[#FF2D78]/25 font-bold',
  offer_pending: 'bg-[#F4F4F0] text-[#66665E] border border-[#E7E7E2]',
  awaiting_payment: 'bg-[#FFF0F5] text-[#FF2D78] border border-[#FF2D78]/25 font-bold',
  in_production: 'bg-[#F4F4F0] text-[#0A0A0A] border border-[#E7E7E2]',
  deliverable_submitted: 'bg-[#FFF0F5] text-[#FF2D78] border border-[#FF2D78]/25 font-bold',
  disputed: 'bg-[#FFF0F5] text-[#FF2D78] border border-[#FF2D78]/35 font-extrabold',
  approved: 'bg-[#F4F4F0] text-[#0A0A0A] border border-[#E7E7E2]',
  completed: 'bg-[#F4F4F0] text-[#66665E] border border-[#E7E7E2]',
};

const statusLabels: Record<string, string> = {
  offer_unpaid: 'Payment Required',
  offer_pending: 'Pending',
  awaiting_payment: 'Awaiting Payment',
  in_production: 'In Production',
  deliverable_submitted: 'In Review',
  disputed: 'Dispute Open',
  approved: 'Completed',
  completed: 'Completed',
};

/** Brand campaigns: pending offers + orders (server: GET /offers, GET /orders). */
export function CampaignsView({ sources }: { sources: CampaignSources }) {
  const router = useRouter();
  const { rows, isLoading, isError } = useCampaignRows('brand', sources);
  const refetch = () => router.refresh();
  const [activeFilter, setActiveFilter] = useState<CampaignTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [payingId, setPayingId] = useState<string | null>(null);
  usePaymentReturn();

  /** Escrow deposit on Stripe's secure page (unfinished offer deposit, or an order accepted before payments existed). */
  const handlePay = async (row: { id: string; kind: 'offer' | 'order' }) => {
    setPayingId(row.id);
    try {
      const { checkoutUrl } = row.kind === 'offer' ? await offersEndpoints(http).resumeCheckout(row.id) : await ordersEndpoints(http).pay(row.id);
      message.loading('Redirecting to secure escrow payment…', 0);
      window.location.assign(checkoutUrl);
    } catch (error) {
      message.error(getErrorMessage(error));
      setPayingId(null);
    }
  };


  const count = (tab: CampaignTab) => rows.filter((r) => tabOf(r.status) === tab).length;

  const filteredRows = rows
    .filter((r) => activeFilter === 'all' || tabOf(r.status) === activeFilter)
    .filter((r) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (r.counterpart?.name?.toLowerCase().includes(q) ?? false) ||
        (r.counterpart?.handle?.toLowerCase().includes(q) ?? false) ||
        r.title.toLowerCase().includes(q) ||
        r.platformLabel.toLowerCase().includes(q)
      );
    });

  return (
    <div className="min-h-screen pb-16 font-sans">
      <WorkspaceHeader
        title="Campaigns"
        subtitle="Creator hires and deliverables."
        action={
          <AppButton
            href="/brand/hire/new"
            size="md"
            variant="primary"
            className="!rounded-lg"
            icon={<PlusCircle className="w-4 h-4" />}
          >
            New Campaign
          </AppButton>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Search & Status Filter Controls */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 xl:gap-4">
          {/* Status Tabs */}
          <div className="flex xl:inline-flex items-center self-start p-1 rounded-lg bg-white border border-[#E7E7E2] shadow-2xs overflow-x-auto no-scrollbar max-w-full min-w-0">
            {[
              { key: 'all', label: 'All', count: rows.length },
              { key: 'pending', label: 'Pending', count: count('pending') },
              { key: 'active', label: 'In Production', count: count('active') },
              { key: 'review', label: 'In Review', count: count('review') },
              { key: 'disputed', label: 'Disputed', count: count('disputed') },
              { key: 'completed', label: 'Completed', count: count('completed') },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key as CampaignTab)}
                className={`h-9 px-3 sm:px-3.5 rounded-md text-xs sm:text-sm font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  activeFilter === tab.key
                    ? 'bg-[#0A0A0A] text-white shadow-2xs'
                    : 'text-[#66665E] hover:text-[#0A0A0A]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-xs px-1.5 py-0.5 leading-none rounded-full font-extrabold ${
                    activeFilter === tab.key ? 'bg-white/20 text-white' : 'bg-[#EAEAE3] text-[#0A0A0A]'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Filter Input */}
          <div className="w-full sm:max-w-sm xl:w-64 shrink-0">
            <Input
              prefix={<Search className="w-3.5 h-3.5 text-[#66665E]" />}
              placeholder="Search creator or campaign..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-lg h-10 text-base sm:text-sm font-semibold"
              allowClear
            />
          </div>
        </div>

        {/* Campaigns List Container */}
        <div className="sm:bg-white sm:rounded-xl sm:p-6 lg:p-8 sm:border sm:border-[#E7E7E2] sm:shadow-2xs space-y-4">
          <div className="pb-3 border-b border-[#E7E7E2] flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">
              Campaign Orders
            </h2>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-[#8E8E85]" />
            </div>
          ) : isError ? (
            <div className="py-12 text-center text-sm text-[#66665E]">
              Couldn’t load your campaigns.{' '}
              <button type="button" onClick={refetch} className="font-bold text-[#0A0A0A] underline cursor-pointer">
                Try again
              </button>
            </div>
          ) : filteredRows.length > 0 ? (
            <div className="space-y-3 sm:space-y-4">
              {filteredRows.map((row) => {
                const creatorHref = `/creators/${row.counterpart?.handle || row.counterpart?.id || ''}`;
                const isReviewReady = row.status === 'deliverable_submitted';
                const isDisputed = row.status === 'disputed';
                // Orders open their detail page; offers still waiting for an answer open the chat thread.
                const manageHref = row.kind === 'order' ? `/brand/orders/${row.id}` : `/brand/messages?conv=${row.conversationId}`;

                return (
                  <div
                    key={row.key}
                    className="p-4 sm:p-5 rounded-lg bg-white border border-[#E7E7E2] hover:border-[#0A0A0A] transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 shadow-2xs"
                  >
                    {/* Creator Details & Deliverable */}
                    <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                      <Link href={creatorHref} className="group/avatar shrink-0 block">
                        <AccountAvatar
                          src={row.counterpart?.avatar}
                          name={row.counterpart?.name}
                          className="w-11 h-11 rounded-full group-hover/avatar:scale-105 transition-transform"
                        />
                      </Link>
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={creatorHref}
                            className="min-w-0 max-w-full truncate font-extrabold text-base text-[#0A0A0A] hover:text-[#FF2D78] transition-colors leading-tight"
                          >
                            {row.counterpart?.name ?? 'Creator'}
                          </Link>
                          {row.counterpart?.verified && <VerifiedBadge size="xs" />}
                          <span className="text-xs uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-md bg-[#EAEAE3] text-[#4A4A45] leading-none">
                            {row.platformLabel}
                          </span>
                        </div>

                        {/* Financial & Deadline Telemetry */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-[#66665E] font-medium">
                          <span className="font-extrabold text-[#0A0A0A] text-sm">
                            {eur(row.totalCents)}
                          </span>
                          <span className="text-[#D2D2CA]">•</span>
                          <span>{row.dueLabel}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status & Direct Action Buttons */}
                    <div className="flex w-full items-center justify-between gap-2 sm:gap-3 border-t border-[#E7E7E2] pt-3 md:w-auto md:justify-end md:border-0 md:pt-0 shrink-0">
                      <span
                        className={`text-[11px] sm:text-sm font-bold px-2 sm:px-3 py-1.5 rounded-md leading-none inline-block min-w-0 truncate ${
                          statusColors[row.status] || 'bg-[#F4F4F0] text-[#0A0A0A] border border-[#E7E7E2]'
                        }`}
                      >
                        {row.awaitingMyAnswer ? 'Needs Your Answer' : statusLabels[row.status] || row.status}
                      </span>

                      {row.status === 'offer_unpaid' || row.status === 'awaiting_payment' ? (
                        <AppButton
                          size="md"
                          variant="pink"
                          className="!rounded-lg !px-3.5 sm:!px-5 shrink-0"
                          loading={payingId === row.id}
                          onClick={() => handlePay(row)}
                          iconRight={<ArrowRight className="w-3.5 h-3.5" />}
                        >
                          {row.status === 'offer_unpaid' ? 'Complete Payment' : 'Pay Now'}
                        </AppButton>
                      ) : (
                      <AppButton
                        href={manageHref}
                        size="md"
                        className="!rounded-lg !px-3.5 sm:!px-5 shrink-0"
                        variant={isDisputed || isReviewReady || row.awaitingMyAnswer ? 'pink' : 'primary'}
                        iconRight={<ArrowRight className="w-3.5 h-3.5" />}
                      >
                        {isDisputed ? 'Support Review' : isReviewReady ? 'Review' : row.awaitingMyAnswer ? 'Review Offer' : 'Manage'}
                      </AppButton>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              color="neutral"
              icon={<Layers className="w-8 h-8" />}
              badge="Campaigns"
              title="No Campaigns in This Filter"
              description="Browse top verified creators to initiate campaign offers or explore active proposals."
              primaryAction={{
                label: 'Discover Creators',
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
