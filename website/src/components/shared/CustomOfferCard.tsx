'use client';

import React from 'react';
import { message } from 'antd';
import { Button, Badge } from '@/components/ui';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/client';
import { offersEndpoints, type Offer, type OfferPlatform } from '@/lib/api/endpoints/offers';
import { useMutation } from '@/lib/hooks/useMutation';
import { useRealtime } from '@/lib/realtime/RealtimeProvider';

function platformLabel(platform: OfferPlatform | string) {
  if (platform === 'ugc') return 'UGC Ads';
  if (platform === 'instagram') return 'Instagram';
  if (platform === 'tiktok') return 'TikTok';
  if (platform === 'youtube') return 'YouTube';
  return platform;
}

function offerPlatformsLabel(offer: Offer) {
  if (offer.platforms.length >= 4) return 'All platforms';
  return offer.platforms.map(platformLabel).join(' · ');
}

/** Whole euros like the original card ("€1,250"), cents when needed. */
const eur = (cents: number) => `€${(cents / 100).toLocaleString('en-IE', { maximumFractionDigits: 2 })}`;

interface CustomOfferCardProps {
  offer: Offer;
  viewer: 'brand' | 'creator';
  /** Called with the updated offer after accept / decline, so the chat can show the new status at once. */
  onOfferChange?: (offer: Offer) => void;
}

/**
 * A creator's custom offer inside the chat. The brand accepts or declines it here
 * (server: POST /offers/:id/accept | decline); both sides see the new status live.
 */
export function CustomOfferCard({ offer, viewer, onOfferChange }: CustomOfferCardProps) {
  const { refreshPendingOffers } = useRealtime();
  // The chat keeps its own state (no server page data to refresh).
  const { run: acceptOffer, loading: accepting } = useMutation((id: string) => offersEndpoints(http).accept(id), { refresh: false });
  const { run: declineOffer, loading: declining } = useMutation((id: string) => offersEndpoints(http).decline(id), { refresh: false });

  const creatorPayout = offer.priceCents;
  const platformFee = offer.feeCents;
  const total = offer.totalCents;

  const statusLabel =
    offer.status === 'accepted'
      ? 'Accepted'
      : offer.status === 'declined'
      ? 'Declined'
      : offer.status === 'expired'
      ? 'Expired'
      : offer.status === 'withdrawn'
      ? 'Withdrawn'
      : 'Pending';

  const handleAccept = async () => {
    try {
      const result = await acceptOffer(offer.id);
      if (result.checkoutUrl) {
        // Brand pays the escrow on Stripe's secure page; the offer is accepted once the payment succeeds.
        message.loading('Redirecting to secure escrow payment…', 0);
        window.location.assign(result.checkoutUrl);
        return;
      }
      const { checkoutUrl: _url, ...accepted } = result;
      onOfferChange?.(accepted);
      refreshPendingOffers();
      message.success('Offer accepted!');
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const handleDecline = async () => {
    try {
      const declined = await declineOffer(offer.id);
      onOfferChange?.(declined);
      refreshPendingOffers();
      message.info('Offer declined.');
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const orderHref = offer.orderId
    ? viewer === 'brand'
      ? `/brand/orders/${offer.orderId}`
      : `/creator/orders/${offer.orderId}`
    : null;

  return (
    <div className="w-[300px] max-w-full sm:w-[320px] rounded-xl border border-[#E7E7E2] bg-white text-left shadow-sm overflow-hidden">
      <div className="px-3.5 sm:px-4 py-3 border-b border-[#E7E7E2] flex items-center justify-between gap-2">
        <span className="type-caption text-[#66665E] truncate">Custom offer</span>
        <Badge
          variant={
            offer.status === 'accepted'
              ? 'dark'
              : offer.status === 'declined'
              ? 'blush'
              : 'neutral'
          }
          size="sm"
          className="!rounded-md shrink-0"
        >
          {statusLabel}
        </Badge>
      </div>

      <div className="p-3.5 sm:p-4 space-y-3">
        <div>
          <div className="text-sm font-bold text-[#0A0A0A] break-words">{offer.title}</div>
          <div className="text-xs font-semibold text-[#66665E] mt-0.5">{offerPlatformsLabel(offer)}</div>
        </div>

        <ul className="space-y-1">
          {offer.deliverables.map((item, index) => (
            <li key={`${index}-${item}`} className="text-sm text-[#0A0A0A] leading-snug break-words">
              {item}
            </li>
          ))}
        </ul>

        <div className="pt-2 border-t border-[#E7E7E2] space-y-1">
          {viewer === 'brand' ? (
            <>
              <div className="flex justify-between items-center gap-3 text-xs text-[#66665E]">
                <span>Creator Payout</span>
                <span className="shrink-0 font-bold text-[#0A0A0A]">{eur(creatorPayout)}</span>
              </div>
              <div className="flex justify-between items-center gap-3 text-xs text-[#66665E]">
                <span>Platform Escrow Fee ({offer.platformFeePercent}%)</span>
                <span className="shrink-0 font-bold text-[#0A0A0A]">{eur(platformFee)}</span>
              </div>
              <div className="flex justify-between items-baseline pt-1 border-t border-[#F0F0EA]">
                <span className="text-xs font-black text-[#0A0A0A]">Total Escrow</span>
                <span className="text-base font-black text-[#0A0A0A]">{eur(total)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-medium text-[#66665E]">Your Payout</span>
              <span className="text-lg font-black text-[#0A0A0A]">{eur(creatorPayout)}</span>
            </div>
          )}
        </div>

        {viewer === 'brand' && offer.status === 'pending' && (
          <div className="grid grid-cols-[auto_1fr] items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleDecline}
              disabled={accepting || declining}
              fullWidth
              className="!rounded-lg"
            >
              Decline
            </Button>
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={handleAccept}
              disabled={accepting || declining}
              fullWidth
              className="!rounded-lg"
            >
              Accept ({eur(total)})
            </Button>
          </div>
        )}

        {offer.status === 'accepted' && orderHref && (
          <Button
            href={orderHref}
            size="sm"
            variant="secondary"
            fullWidth
            className="!rounded-lg"
          >
            Open campaign
          </Button>
        )}
      </div>
    </div>
  );
}
