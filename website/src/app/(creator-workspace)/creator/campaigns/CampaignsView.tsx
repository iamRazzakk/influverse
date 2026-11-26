'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { EmptyState } from '@/components/shared/EmptyState';
import { tabOf, useCampaignRows, type CampaignSources, type CampaignTab } from '@/components/shared/useCampaignRows';
import { http } from '@/lib/api/client';
import { offersEndpoints } from '@/lib/api/endpoints/offers';
import { useMutation } from '@/lib/hooks/useMutation';
import { useRealtime } from '@/lib/realtime/RealtimeProvider';
import { getErrorMessage } from '@/lib/api/errors';
import {
  Layers,
  Search,
  ChevronRight,
  LifeBuoy,
  Loader2,
} from 'lucide-react';
import { Button, Input, message } from 'antd';

const eur = (cents: number) => `€${(cents / 100).toLocaleString('en-IE', { maximumFractionDigits: 2 })}`;

/** Creator campaigns: pending brand offers (accept / decline inline) + orders (server: GET /offers, GET /orders). */
export function CampaignsView({ sources }: { sources: CampaignSources }) {
  const router = useRouter();
  const { rows, isLoading, isError } = useCampaignRows('creator', sources);
  const refetch = () => router.refresh();
  const { refreshPendingOffers } = useRealtime();
  const { run: acceptOffer } = useMutation((id: string) => offersEndpoints(http).accept(id), { onSuccess: refreshPendingOffers });
  const { run: declineOffer } = useMutation((id: string) => offersEndpoints(http).decline(id), { onSuccess: refreshPendingOffers });
  const [busyId, setBusyId] = useState<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<CampaignTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const count = (tab: CampaignTab) => rows.filter((r) => tabOf(r.status) === tab).length;

  const handleAcceptOffer = async (offerId: string) => {
    setBusyId(offerId);
    try {
      await acceptOffer(offerId);
      message.success('Offer accepted! Escrow funds locked. Campaign moved to production.');
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeclineOffer = async (offerId: string) => {
    setBusyId(offerId);
    try {
      await declineOffer(offerId);
      message.info('Campaign proposal declined.');
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const filteredRows = rows
    .filter((r) => activeFilter === 'all' || tabOf(r.status) === activeFilter)
    .filter((r) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (r.counterpart?.name?.toLowerCase().includes(q) ?? false) ||
        r.title.toLowerCase().includes(q) ||
        r.platformLabel.toLowerCase().includes(q)
      );
    });

  return (
    <div className="min-h-screen pb-16 font-sans">
      <WorkspaceHeader
        title="Campaigns"
        subtitle="Active brand partnerships."
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
              { key: 'review', label: 'Under Review', count: count('review') },
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
              placeholder="Search brand or package..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-lg h-10 text-base sm:text-sm font-semibold"
              allowClear
            />
          </div>
        </div>

        {/* Campaigns Deals Container */}
        <div className="sm:bg-white sm:rounded-xl sm:p-6 lg:p-8 sm:border sm:border-[#E7E7E2] sm:shadow-2xs space-y-4 sm:space-y-5">
          <div className="pb-3 border-b border-[#E7E7E2]">
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">
              Contracts
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
            <div className="space-y-3 sm:space-y-3.5">
              {filteredRows.map((row) => {
                const isOffer = row.kind === 'offer' && row.awaitingMyAnswer;
                const isUnderReview = row.status === 'deliverable_submitted';
                const brandHref = `/brands/${row.counterpart?.handle || row.counterpart?.id || ''}`;
                // Orders open their fulfilment page; offers still waiting for an answer open the chat thread.
                const rowHref = row.kind === 'order' ? `/creator/orders/${row.id}` : `/creator/messages?conv=${row.conversationId}`;
                const busy = busyId === row.id;

                return (
                  <Link
                    key={row.key}
                    href={rowHref}
                    className="block group cursor-pointer"
                  >
                    <div className="p-4 sm:p-5 rounded-lg bg-white border border-[#E7E7E2] group-hover:border-[#0A0A0A] transition-all shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
                      {/* Brand Details & Deliverable Title */}
                      <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            router.push(brandHref);
                          }}
                          className="hover:opacity-85 transition-opacity shrink-0 cursor-pointer text-left"
                          title={`View ${row.counterpart?.name ?? 'brand'} Profile`}
                        >
                          <BrandLogo
                            name={row.counterpart?.name ?? 'Brand'}
                            logoUrl={row.counterpart?.avatar ?? undefined}
                            size="lg"
                          />
                        </button>
                        <div className="flex flex-col gap-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                router.push(brandHref);
                              }}
                              className="min-w-0 max-w-full truncate font-bold text-sm sm:text-base text-[#0A0A0A] hover:text-[#FF2D78] hover:underline transition-colors leading-tight cursor-pointer text-left"
                              title={`View ${row.counterpart?.name ?? 'brand'} Profile`}
                            >
                              {row.counterpart?.name ?? 'Brand'}
                            </button>
                            <span className="text-xs uppercase tracking-wider font-extrabold px-2 py-1 rounded-md bg-[#FAFAF8] border border-[#E7E7E2] text-[#66665E] leading-none">
                              {row.platformLabel}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-[#66665E] font-medium">
                            <span className="font-extrabold text-[#0A0A0A] text-sm">
                              {eur(row.priceCents)}
                            </span>
                            <span className="text-[#D2D2CA]">•</span>
                            <span>{row.dueLabel}</span>
                          </div>
                        </div>
                      </div>

                      {/* Action Controls & Status */}
                      <div className="flex w-full items-center justify-end gap-3 border-t border-[#E7E7E2] pt-3 md:w-auto md:border-0 md:pt-0 shrink-0">
                        {isOffer ? (
                          <div className="flex w-full items-center gap-2 md:w-auto">
                            <Button
                              type="primary"
                              loading={busy}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleAcceptOffer(row.id);
                              }}
                              className="flex-1 md:flex-none h-10 px-4 sm:px-5 rounded-lg font-bold text-xs bg-[#0A0A0A] hover:!bg-[#FF2D78] !text-white border-none cursor-pointer shadow-2xs"
                            >
                              Accept ({eur(row.priceCents)})
                            </Button>
                            <Button
                              type="default"
                              disabled={busy}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleDeclineOffer(row.id);
                              }}
                              className="h-10 px-3.5 rounded-lg font-bold text-xs border-[#E7E7E2] text-[#66665E] hover:text-[#0A0A0A] cursor-pointer"
                            >
                              Decline
                            </Button>
                          </div>
                        ) : (
                          <div className="flex w-full items-center justify-between gap-3 md:w-auto md:justify-end">
                            {row.status === 'disputed' ? (
                              <span className="text-sm font-bold px-3 py-1 rounded-md bg-[#FAF8F5] text-[#0A0A0A] border border-[#E7E7E2] flex items-center gap-1.5">
                                <LifeBuoy className="w-3.5 h-3.5 text-amber-600" />
                                <span>Support Review</span>
                              </span>
                            ) : isUnderReview ? (
                              <span className="text-sm font-bold px-3 py-1 rounded-md bg-[#FFF0F5] text-[#FF2D78] border border-[#FF2D78]/25">
                                Under Review
                              </span>
                            ) : row.status === 'completed' || row.status === 'approved' ? (
                              <span className="text-sm font-bold px-3 py-1 rounded-md bg-[#F4F4F0] text-[#0A0A0A] border border-[#E7E7E2]">
                                Completed
                              </span>
                            ) : row.status === 'awaiting_payment' ? (
                              <span className="text-sm font-bold px-3 py-1 rounded-md bg-[#FFF0F5] text-[#FF2D78] border border-[#FF2D78]/25">
                                Awaiting Payment
                              </span>
                            ) : row.status === 'offer_pending' ? (
                              <span className="text-sm font-bold px-3 py-1 rounded-md bg-[#F4F4F0] text-[#66665E] border border-[#E7E7E2]">
                                Offer Sent
                              </span>
                            ) : (
                              <span className="text-sm font-bold px-3 py-1 rounded-md bg-[#F4F4F0] text-[#0A0A0A] border border-[#E7E7E2]">
                                In Production
                              </span>
                            )}

                            <div className="w-8 h-8 shrink-0 rounded-lg bg-[#FAFAF8] group-hover:bg-[#0A0A0A] group-hover:text-white text-[#66665E] flex items-center justify-center transition-all border border-[#E7E7E2] group-hover:border-[#0A0A0A]">
                              <ChevronRight className="w-4 h-4 translate-x-0.5" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              color="neutral"
              icon={<Layers className="w-8 h-8" />}
              title="No Campaigns Found in This Filter"
              description="When brands book your packages or issue custom proposals, they will appear here with escrow payout milestones."
              primaryAction={{
                label: 'View Packages',
                href: '/creator/packages',
              }}
              variant="plain"
            />
          )}
        </div>
      </div>
    </div>
  );
}
