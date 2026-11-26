'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/session/AuthProvider';
import { useRealtime } from '@/lib/realtime/RealtimeProvider';
import { useMutation } from '@/lib/hooks/useMutation';
import { http } from '@/lib/api/client';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Inbox, ShieldCheck, ArrowRight, Loader2, MessageSquare } from 'lucide-react';
import { Button, message } from 'antd';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { getErrorMessage } from '@/lib/api/errors';
import { offersEndpoints, type Offer } from '@/lib/api/endpoints/offers';
import type { Paginated } from '@/lib/api/types';
import type { CreatorProfile } from '@/types/api';

const PLATFORM_LABEL: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', ugc: 'UGC' };
const platformLabel = (offer: Offer) =>
  offer.platforms.length >= 4 ? 'All platforms' : offer.platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(' · ');
const eur = (cents: number) => `€${(cents / 100).toLocaleString('en-IE', { maximumFractionDigits: 2 })}`;
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Brand → creator offers waiting for this creator's answer. The server page loads
 * GET /offers?box=received&status=pending; `data === null` means that request failed.
 * Accept / decline → router.refresh() (via useMutation) + the sidebar badge is re-read.
 */
export function OffersView({ data }: { data: Paginated<Offer> | null }) {
  const router = useRouter();
  const { profile } = useAuth();
  const { refreshPendingOffers } = useRealtime();
  const creatorHandle = (profile as CreatorProfile | null)?.handle;
  const isLoading = false;
  const isError = data === null;
  const refetch = () => router.refresh();
  const accept = useMutation((id: string) => offersEndpoints(http).accept(id));
  const decline = useMutation((id: string) => offersEndpoints(http).decline(id));
  // Which offer the running request belongs to (only that card shows a spinner).
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const accepting = accept.loading;
  const declining = decline.loading;
  const incomingOffers = data?.items ?? [];

  const handleAccept = async (id: string) => {
    setAcceptingId(id);
    try {
      await accept.run(id);
      refreshPendingOffers();
      message.success('Offer accepted! You can now access the campaign workspace to submit deliverables.');
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setAcceptingId(null);
    }
  };

  const handleDecline = async (id: string) => {
    setDecliningId(id);
    try {
      await decline.run(id);
      refreshPendingOffers();
      message.info('Offer declined.');
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setDecliningId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <WorkspaceHeader
        title="Offers"
        subtitle="Brand collaboration requests."
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <div className="sm:bg-white sm:rounded-xl sm:p-6 sm:border sm:border-[#E7E7E2] sm:shadow-2xs space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A]">
              Incoming Offers
            </h2>
            <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap px-2.5 py-1 rounded-md bg-white sm:bg-[#F4F4F0] text-[#0A0A0A] text-sm font-bold border border-[#E7E7E2]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#0A0A0A]" />
              <span>Escrow Protected</span>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-[#8E8E85]" />
            </div>
          ) : isError ? (
            <div className="py-12 text-center text-sm text-[#66665E]">
              Couldn’t load your offers.{' '}
              <button type="button" onClick={() => refetch()} className="font-bold text-[#0A0A0A] underline cursor-pointer">
                Try again
              </button>
            </div>
          ) : incomingOffers.length > 0 ? (
            <div className="space-y-3 sm:space-y-4">
              {incomingOffers.map((offer) => {
                const brand = offer.counterpart;
                const brandHref = `/brands/${brand?.handle || offer.brandId}`;
                const busy = (accepting && acceptingId === offer.id) || (declining && decliningId === offer.id);
                return (
                  <div
                    key={offer.id}
                    className="p-4 sm:p-6 rounded-lg bg-white sm:bg-[#FAFAF8] border border-[#E7E7E2] space-y-4 hover:border-[#0A0A0A] transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3 sm:gap-5 min-w-0">
                        <Link
                          href={brandHref}
                          className="hover:opacity-85 transition-opacity shrink-0"
                          title="View Brand Profile"
                        >
                          <BrandLogo
                            name={brand?.name ?? 'Brand'}
                            logoUrl={brand?.avatar ?? undefined}
                            size="lg"
                          />
                        </Link>
                        <div className="flex flex-col gap-1.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={brandHref}
                              className="font-bold text-base text-[#0A0A0A] hover:text-[#FF2D78] transition-colors leading-tight flex items-center gap-1.5 min-w-0"
                            >
                              <span className="break-words">{brand?.name ?? 'Brand'}</span>
                              <ArrowRight className="w-3.5 h-3.5 shrink-0 text-[#A3A39C]" />
                            </Link>
                            <span className="text-xs uppercase tracking-wider font-bold px-2 py-1 rounded-md bg-[#EAEAE3] text-[#4A4A45] leading-none">
                              {platformLabel(offer)}
                            </span>
                          </div>
                          <div className="text-sm font-semibold text-[#0A0A0A] leading-snug break-words">{offer.title}</div>
                        </div>
                      </div>

                      <div className="text-left sm:text-right sm:shrink-0">
                        <span className="text-sm font-semibold text-[#66665E] uppercase tracking-wider">Net Payout</span>
                        <div className="text-2xl font-extrabold text-[#0A0A0A] tracking-tight">
                          {eur(offer.priceCents)}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-[#FAFAF8] sm:bg-white rounded-lg border border-[#E7E7E2] space-y-1.5">
                      <div className="text-sm font-semibold uppercase tracking-wider text-[#66665E]">Brief</div>
                      <p className="text-sm text-[#44443E] leading-relaxed whitespace-pre-line break-words">
                        {offer.brief}
                      </p>
                    </div>

                    {offer.deliverables.length > 0 && (
                      <div>
                        <div className="text-sm font-semibold uppercase tracking-wider text-[#66665E] mb-2">Requirements</div>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-[#0A0A0A]">
                          {offer.deliverables.map((req, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#0A0A0A] shrink-0 mt-2" />
                              <span>{req}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="pt-3 border-t border-[#E7E7E2] flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <span className="text-sm text-[#66665E]">
                        Delivery: <strong className="text-[#0A0A0A]">{offer.deliveryDays} days</strong>
                        <span className="mx-2">•</span>
                        Respond by <strong className="text-[#0A0A0A] whitespace-nowrap">{formatDate(offer.expiresAt)}</strong>
                      </span>

                      <div className="flex items-center gap-3 w-full md:w-auto">
                        <Button
                          type="primary"
                          onClick={() => handleAccept(offer.id)}
                          disabled={busy}
                          loading={accepting && acceptingId === offer.id}
                          className="flex-1 md:flex-initial min-w-0 h-11 sm:h-10 px-4 sm:px-6 rounded-lg font-semibold text-sm bg-[#0A0A0A] hover:!bg-[#FF2D78] !text-white hover:!text-white border-none cursor-pointer shadow-xs"
                        >
                          Accept Offer ({eur(offer.priceCents)})
                        </Button>
                        <Button
                          type="default"
                          onClick={() => handleDecline(offer.id)}
                          disabled={busy}
                          className="h-11 sm:h-10 px-4 sm:px-5 rounded-lg font-semibold text-sm border-[#D2D2CA] text-[#66665E] cursor-pointer"
                        >
                          Decline
                        </Button>
                        <Link
                          href={`/creator/messages?conv=${offer.conversationId}`}
                          title="Message brand"
                          className="h-11 w-11 sm:h-10 sm:w-10 shrink-0 rounded-lg border border-[#D2D2CA] text-[#66665E] hover:text-[#0A0A0A] hover:border-[#0A0A0A] flex items-center justify-center transition-all"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              color="neutral"
              icon={<Inbox className="w-8 h-8" />}
              badge="Inbox Zero"
              title="No Pending Campaign Offers"
              description="Brands discover your verified rate card and send custom brief proposals directly to this inbox. Make sure your packages and portfolio are up to date."
              primaryAction={{
                label: 'Update Rate Card Packages',
                href: '/creator/packages',
              }}
              secondaryAction={
                creatorHandle
                  ? {
                      label: 'View Public Profile',
                      href: `/creators/${creatorHandle}`,
                    }
                  : undefined
              }
              variant="plain"
            />
          )}
        </div>
      </div>
    </div>
  );
}
