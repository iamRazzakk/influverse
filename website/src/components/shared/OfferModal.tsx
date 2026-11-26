'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useOfferModal } from '@/lib/offer/OfferModalProvider';
import { http } from '@/lib/api/client';
import { offersEndpoints, type OfferPlatform } from '@/lib/api/endpoints/offers';
import { metaEndpoints } from '@/lib/api/endpoints/meta';
import { getErrorMessage } from '@/lib/api/errors';
import { useMutation } from '@/lib/hooks/useMutation';
import { useRequest } from '@/lib/hooks/useRequest';
import { Modal, Input, message, Button } from 'antd';
import {
  Send,
  Package,
  X,
  ChevronDown,
  Clock,
  Check,
  ShieldCheck,
  Film,
} from 'lucide-react';
import type { PublicPackage } from '@/types/public';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { AccountAvatar } from '@/components/auth/AccountAvatar';
import { InstagramLogo, TikTokLogo, YouTubeLogo } from '@/components/shared/SocialLogos';

function platformDisplayLabel(p: string) {
  switch (p) {
    case 'instagram':
      return 'Instagram';
    case 'tiktok':
      return 'TikTok';
    case 'youtube':
      return 'YouTube';
    case 'ugc':
      return 'UGC Video';
    case 'multi':
      return 'Multi-Platform';
    case 'all':
      return 'Cross-Platform';
    default:
      return p ? p.charAt(0).toUpperCase() + p.slice(1) : 'Platform';
  }
}

/** A package's channels as one label, like the original single `platform` field. */
const packagePlatformLabel = (pkg: PublicPackage) =>
  platformDisplayLabel(pkg.platforms.length >= 4 ? 'all' : pkg.platforms.length > 1 ? 'multi' : pkg.platforms[0]);

const USAGE_RIGHTS_LABEL: Record<string, string> = {
  organic_30d: '30-day organic',
  commercial_60d: '60-day commercial',
  commercial_90d: '90-day commercial',
  whitelisting_60d: '60-day whitelisting',
  perpetual: 'Perpetual usage',
};

const DEFAULT_REQUIREMENTS =
  'Submit video draft for review before publishing\nTag official brand account\nProvide 24h performance screenshot';
const DEFAULT_BRIEF = 'Highlight product features with authentic voiceover and a clear call-to-action link.';

const euros = (cents: number) => Math.round(cents / 100);

/**
 * "Send Collaboration Offer" — brand → creator (server: POST /offers).
 * Opened from a creator profile / package card via `openOfferModal`. A creator package locks the
 * rate and turnaround (the server enforces it too); "Custom Milestone Brief" lets the brand set them.
 */
export function OfferModal() {
  const router = useRouter();
  const { isOpen: isOfferModalOpen, creator: selectedCreatorForOffer, closeOfferModal } = useOfferModal();
  // No refresh: on success the browser leaves for Stripe checkout.
  const createBrandOffer = useMutation(offersEndpoints(http).createBrandOffer, { refresh: false });
  const { data: publicSettings } = useRequest(() => metaEndpoints(http).publicSettings(), [], {
    skip: !isOfferModalOpen,
  });
  const feePercent = Number(publicSettings?.platformFeePercent ?? 15);

  const availablePackages: PublicPackage[] = selectedCreatorForOffer?.packages ?? [];
  const creatorStartingPrice = euros(
    selectedCreatorForOffer?.startingPriceCents ||
      (availablePackages.length ? Math.min(...availablePackages.map((p) => p.priceCents)) : 50_000),
  );

  // Form states
  const [selectedPackageId, setSelectedPackageId] = useState<string>('custom');
  const [campaignTitle, setCampaignTitle] = useState('New Product Launch Campaign');
  const [packageTitle, setPackageTitle] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<OfferPlatform[]>(['instagram']);
  const [basePrice, setBasePrice] = useState<number>(500);
  const [brief, setBrief] = useState('');
  const [requirements, setRequirements] = useState(DEFAULT_REQUIREMENTS);
  const [deadlineDays, setDeadlineDays] = useState<number>(7);
  const [isCustomDeadline, setIsCustomDeadline] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const applyPackage = (pkg: PublicPackage) => {
    setSelectedPackageId(pkg.id);
    setPackageTitle(pkg.title);
    setSelectedPlatforms((pkg.platforms.length ? pkg.platforms : ['instagram']) as OfferPlatform[]);
    setBasePrice(euros(pkg.priceCents));
    setDeadlineDays(pkg.deliveryDays || 5);
    setCampaignTitle(`${pkg.title} Collab`);
    setRequirements(pkg.inclusions && pkg.inclusions.length > 0 ? pkg.inclusions.join('\n') : DEFAULT_REQUIREMENTS);
    setBrief(pkg.description || DEFAULT_BRIEF);
  };

  // Synchronize whenever the selected creator / package changes
  useEffect(() => {
    if (!selectedCreatorForOffer) return;
    const pkgs = selectedCreatorForOffer.packages;

    // 1. Opened with a specific package, 2. generic "Send Offer" → the creator's first package
    const matchedPkg = selectedCreatorForOffer.packageId ? pkgs.find((p) => p.id === selectedCreatorForOffer.packageId) : null;
    const pkg = matchedPkg || pkgs[0];
    if (pkg) {
      applyPackage(pkg);
    } else {
      // 3. Fallback to custom brief
      setSelectedPackageId('custom');
      setPackageTitle('Custom Milestone Brief');
      setSelectedPlatforms(['instagram']);
      setBasePrice(creatorStartingPrice);
      setDeadlineDays(7);
      setCampaignTitle('Custom Campaign Collab');
      setRequirements(DEFAULT_REQUIREMENTS);
      setBrief(DEFAULT_BRIEF);
    }
    setIsCustomDeadline(false);
  }, [selectedCreatorForOffer]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selectedCreatorForOffer) return null;

  // Handle multi-platform selection toggle
  const togglePlatform = (pId: OfferPlatform) => {
    setSelectedPlatforms((prev) => {
      if (prev.includes(pId)) {
        if (prev.length === 1) {
          message.warning('Please keep at least one target platform selected.');
          return prev;
        }
        return prev.filter((p) => p !== pId);
      } else {
        return [...prev, pId];
      }
    });
  };

  // Handle dropdown package switch
  const handlePackageSelectChange = (newPkgId: string) => {
    if (newPkgId === 'custom') {
      setSelectedPackageId('custom');
      setPackageTitle('Custom Milestone Brief');
      setBasePrice(creatorStartingPrice);
      setDeadlineDays(7);
      setCampaignTitle('Custom Campaign Collab');
      setRequirements(DEFAULT_REQUIREMENTS);
      setBrief(DEFAULT_BRIEF);
    } else {
      const found = availablePackages.find((p) => p.id === newPkgId);
      if (found) applyPackage(found);
    }
  };

  const currentPkgDetails =
    selectedPackageId !== 'custom'
      ? availablePackages.find((p) => p.id === selectedPackageId)
      : null;

  // Transparent Influverse fee: platform fee paid by the brand into escrow (percent from platform settings)
  const platformFeeEur = Math.round((basePrice * feePercent) / 100);
  const totalInvoiceEur = basePrice + platformFeeEur;

  const handleSendOffer = async () => {
    if (!campaignTitle.trim() || !brief.trim() || !basePrice || basePrice <= 0) {
      message.error('Please complete campaign title, brief, and valid offer amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { checkoutUrl } = await createBrandOffer.run({
        creatorId: selectedCreatorForOffer.id,
        packageId: currentPkgDetails ? currentPkgDetails.id : undefined,
        title: campaignTitle.trim(),
        brief: brief.trim(),
        deliverables: requirements
          .split('\n')
          .map((r) => r.trim())
          .filter((r) => r.length > 0),
        platforms: selectedPlatforms,
        priceCents: Math.round(basePrice * 100),
        deliveryDays: deadlineDays || 7,
      });

      // Escrow deposit on Stripe's secure page: the card is held (not charged) until the creator accepts.
      // The offer reaches the creator once the hold succeeds; Stripe brings the brand back to Campaigns.
      message.loading('Redirecting to secure escrow payment…', 0);
      window.location.assign(checkoutUrl);
    } catch (error) {
      message.error(getErrorMessage(error));
      // Only on error: on success the button stays busy while the browser leaves for Stripe.
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={isOfferModalOpen}
      onCancel={() => closeOfferModal()}
      footer={null}
      width={640}
      style={{ maxWidth: 'calc(100vw - 24px)', margin: '16px auto' }}
      centered
      destroyOnClose
      closeIcon={
        <span className="w-8 h-8 rounded-full bg-[#FAFAF8] hover:bg-[#EAEAE3] border border-[#E7E7E2] flex items-center justify-center text-[#66665E] hover:text-[#0A0A0A] transition-all cursor-pointer shadow-2xs">
          <X className="w-4 h-4" />
        </span>
      }
      className="rounded-3xl"
    >
      <div className="pt-1 pb-1 space-y-4 font-sans max-h-[82vh] overflow-y-auto pr-0.5">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between pr-10 pb-3 border-b border-[#E7E7E2]">
          <div>
            <h2 className="text-base font-extrabold text-[#0A0A0A] tracking-tight">
              Send Collaboration Offer
            </h2>
            <p className="text-xs text-[#66665E] font-medium mt-0.5">
              Select package or define custom deliverables
            </p>
          </div>
        </div>

        {/* Creator Profile Summary Bar */}
        <div className="p-3.5 rounded-2xl bg-[#FAFAF8] border border-[#E7E7E2] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <AccountAvatar
                src={selectedCreatorForOffer.avatar}
                name={selectedCreatorForOffer.name}
                className="w-11 h-11 rounded-full"
              />
              {selectedCreatorForOffer.verified && <VerifiedBadge className="absolute -bottom-0.5 -right-0.5 w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-[#0A0A0A] text-sm leading-tight truncate">
                {selectedCreatorForOffer.name}
              </h3>
              <p className="text-xs text-[#66665E] font-medium truncate">
                {selectedCreatorForOffer.handle ? `@${selectedCreatorForOffer.handle.replace(/^@/, '')}` : ''}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#66665E]">
              Starting From
            </div>
            <div className="text-lg font-black text-[#0A0A0A]">
              €{creatorStartingPrice.toLocaleString()}
            </div>
          </div>
        </div>

        {/* 1. DELIVERABLE PACKAGE SELECTOR */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
              Deliverable Package
            </label>
            {selectedPackageId !== 'custom' && currentPkgDetails && (
              <span className="text-[11px] font-bold text-[#66665E] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {currentPkgDetails.deliveryDays}d turnaround
              </span>
            )}
          </div>

          <div className="relative">
            <select
              value={selectedPackageId}
              onChange={(e) => handlePackageSelectChange(e.target.value)}
              className="w-full h-11 px-3.5 pr-10 rounded-xl text-sm font-bold text-[#0A0A0A] bg-white border border-[#D2D2CA] hover:border-[#0A0A0A] focus:border-[#0A0A0A] focus:outline-none transition-all appearance-none cursor-pointer shadow-2xs"
            >
              {availablePackages.length > 0 && (
                <optgroup label="Creator Defined Packages">
                  {availablePackages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.title} — €{euros(pkg.priceCents).toLocaleString()} ({packagePlatformLabel(pkg)})
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Custom Negotiation">
                <option value="custom">Custom Milestone Brief (Define platform & budget)</option>
              </optgroup>
            </select>
            <ChevronDown className="w-4 h-4 text-[#66665E] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* 2. PACKAGE PREVIEW OR CUSTOM PLATFORM SELECTOR */}
        {selectedPackageId !== 'custom' && currentPkgDetails ? (
          /* Selected Package Overview Card */
          <div className="p-3.5 rounded-2xl bg-white border border-[#E7E7E2] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] flex items-center justify-center shrink-0">
                  <Package className="w-3.5 h-3.5 text-[#0A0A0A]" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#0A0A0A] truncate">
                    {currentPkgDetails.title}
                  </div>
                  <div className="text-[11px] text-[#66665E] flex items-center gap-2 mt-0.5">
                    <span>{currentPkgDetails.revisions || 1} revision included</span>
                    <span>•</span>
                    <span>{USAGE_RIGHTS_LABEL[currentPkgDetails.usageRights] || 'Organic posting'}</span>
                  </div>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-1.5">
                <span className="text-[11px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-[#FAFAF8] border border-[#E7E7E2] text-[#0A0A0A]">
                  {packagePlatformLabel(currentPkgDetails)}
                </span>
              </div>
            </div>

            {/* Inclusions pill tags */}
            {currentPkgDetails.inclusions && currentPkgDetails.inclusions.length > 0 && (
              <div className="pt-2 border-t border-[#F0F0EB] flex flex-wrap gap-1.5">
                {currentPkgDetails.inclusions.slice(0, 3).map((inc, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#66665E] bg-[#FAFAF8] px-2 py-0.5 rounded-md border border-[#EAEAE3]"
                  >
                    <Check className="w-2.5 h-2.5 text-[#0A0A0A]" />
                    <span className="truncate max-w-[200px]">{inc}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Custom Brief Platform & Budget Selector */
          <div className="space-y-4 p-4 rounded-2xl bg-[#FAFAF8] border border-[#E7E7E2]">
            {/* Target Platform Multi-Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                  Select Target Platform{selectedPlatforms.length > 1 ? 's' : ''}
                </label>
                <span className="text-[11px] font-semibold text-[#66665E]">
                  {selectedPlatforms.length > 1
                    ? `${selectedPlatforms.length} channels selected (Multi-channel)`
                    : 'Choose one or multiple channels'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  {
                    id: 'instagram' as OfferPlatform,
                    label: 'Instagram',
                    icon: <InstagramLogo className="w-4 h-4 shrink-0" />,
                  },
                  {
                    id: 'tiktok' as OfferPlatform,
                    label: 'TikTok',
                    icon: <TikTokLogo className="w-4 h-4 shrink-0" />,
                  },
                  {
                    id: 'youtube' as OfferPlatform,
                    label: 'YouTube',
                    icon: <YouTubeLogo className="w-4 h-4 shrink-0" />,
                  },
                  {
                    id: 'ugc' as OfferPlatform,
                    label: 'UGC Video',
                    icon: <Film className="w-4 h-4 text-inherit shrink-0" />,
                  },
                ].map((item) => {
                  const isSelected = selectedPlatforms.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => togglePlatform(item.id)}
                      className={`h-11 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border select-none whitespace-nowrap ${
                        isSelected
                          ? 'bg-[#0A0A0A] text-white border-[#0A0A0A] shadow-xs'
                          : 'bg-white text-[#44443E] border-[#D2D2CA] hover:border-[#0A0A0A] hover:bg-[#FAFAF8]'
                      }`}
                    >
                      {item.icon}
                      <span className="whitespace-nowrap">{item.label}</span>
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedPlatforms.length > 1 && (
                <div className="flex items-center gap-1.5 text-xs text-[#66665E] font-medium pt-2">
                  <span className="font-bold text-[#0A0A0A]">Multi-Rollout:</span>
                  <span>{selectedPlatforms.map((p) => platformDisplayLabel(p)).join(' + ')}</span>
                </div>
              )}
            </div>

            {/* Custom Budget & Delivery Days Inputs */}
            <div className="pt-3 border-t border-[#EAEAE3] grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#0A0A0A]">
                  Custom Budget (€)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[#66665E]">
                    €
                  </span>
                  <Input
                    type="number"
                    min={50}
                    step={25}
                    value={basePrice}
                    onChange={(e) => setBasePrice(Number(e.target.value) || 0)}
                    className="rounded-xl h-10 pl-7 text-sm font-bold text-[#0A0A0A] border-[#D2D2CA] hover:border-[#0A0A0A] focus:border-[#0A0A0A]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#0A0A0A]">
                  Delivery Turnaround
                </label>
                {isCustomDeadline ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={1}
                      max={180}
                      value={deadlineDays}
                      onChange={(e) => setDeadlineDays(Number(e.target.value) || 1)}
                      className="rounded-xl h-10 text-xs font-bold text-[#0A0A0A] border-[#D2D2CA] hover:border-[#0A0A0A] focus:border-[#0A0A0A] flex-1"
                      placeholder="e.g. 12"
                      suffix={<span className="text-[11px] text-[#66665E] font-semibold">Days</span>}
                    />
                    <button
                      type="button"
                      onClick={() => setIsCustomDeadline(false)}
                      className="h-10 px-2.5 rounded-xl border border-[#D2D2CA] text-[11px] font-bold text-[#66665E] hover:text-[#0A0A0A] bg-white cursor-pointer shrink-0"
                    >
                      Presets
                    </button>
                  </div>
                ) : (
                  <select
                    value={[3, 5, 7].includes(deadlineDays) ? deadlineDays : 7}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setIsCustomDeadline(true);
                      } else {
                        setIsCustomDeadline(false);
                        setDeadlineDays(Number(e.target.value));
                      }
                    }}
                    className="w-full h-10 px-3 rounded-xl text-xs font-bold text-[#0A0A0A] bg-white border border-[#D2D2CA] hover:border-[#0A0A0A] focus:border-[#0A0A0A] focus:outline-none transition-all cursor-pointer"
                  >
                    <option value={3}>3 Days (Fast Turnaround)</option>
                    <option value={5}>5 Days (Standard)</option>
                    <option value={7}>7 Days (1 Week)</option>
                    <option value="custom">Custom (Type days)...</option>
                  </select>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 3. CAMPAIGN DETAILS */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
              Campaign Name
            </label>
            <Input
              value={campaignTitle}
              onChange={(e) => setCampaignTitle(e.target.value)}
              className="rounded-xl h-10 text-sm font-semibold text-[#0A0A0A] placeholder:text-[#8E8E85] border-[#D2D2CA] hover:border-[#0A0A0A] focus:border-[#0A0A0A]"
              placeholder="e.g. Summer Skincare Drop Collab"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
              Campaign Brief & Instructions
            </label>
            <Input.TextArea
              rows={3}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              className="rounded-xl text-sm font-medium leading-relaxed p-3 text-[#0A0A0A] placeholder:text-[#8E8E85] border-[#D2D2CA] hover:border-[#0A0A0A] focus:border-[#0A0A0A]"
              placeholder="Outline talking points, visual aesthetic guidelines, mandatory tags, and CTA..."
              required
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                Deliverables & Requirements
              </label>
              <span className="text-[11px] text-[#66665E] font-medium">One item per line</span>
            </div>
            <Input.TextArea
              rows={3}
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              className="rounded-xl text-sm font-medium leading-relaxed p-3 text-[#0A0A0A] placeholder:text-[#8E8E85] border-[#D2D2CA] hover:border-[#0A0A0A] focus:border-[#0A0A0A]"
              placeholder="Submit video draft for review before publishing&#10;Tag official brand account&#10;Provide 24h performance screenshot"
              required
            />
          </div>
        </div>

        {/* 4. ESCROW BREAKDOWN (platform fee transparently shown) */}
        <div className="p-3.5 rounded-2xl bg-[#FAFAF8] border border-[#E7E7E2] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#66665E]">
            <span>Creator Payout (100% to creator)</span>
            <span className="font-bold text-[#0A0A0A]">€{basePrice.toLocaleString()}</span>
          </div>

          <div className="flex items-center justify-between text-xs text-[#66665E]">
            <span className="flex items-center gap-1.5">
              <span>Influverse Platform Fee ({feePercent}%)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#EAEAE3] text-[#0A0A0A] font-bold">
                Escrow
              </span>
            </span>
            <span className="font-bold text-[#0A0A0A]">€{platformFeeEur.toLocaleString()}</span>
          </div>

          <div className="pt-2 border-t border-[#E7E7E2] flex items-center justify-between">
            <div>
              <div className="text-xs font-black text-[#0A0A0A]">Total Escrow Deposit</div>
              <div className="text-[11px] text-[#66665E] flex items-center gap-1 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#0A0A0A]" />
                <span>Held securely until you approve final deliverables</span>
              </div>
            </div>
            <div className="text-2xl font-black text-[#0A0A0A]">
              €{totalInvoiceEur.toLocaleString()}
            </div>
          </div>
        </div>

        {/* 5. MODAL ACTIONS */}
        <div className="pt-2 flex items-center justify-end gap-2.5">
          <Button
            onClick={() => closeOfferModal()}
            className="btn-base btn-md btn-secondary !h-10 !px-5 !text-xs !font-bold"
          >
            Cancel
          </Button>

          <Button
            type="primary"
            loading={isSubmitting}
            onClick={handleSendOffer}
            className="btn-base btn-md btn-primary !h-10 !px-6 !text-sm !font-bold flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Offer (€{totalInvoiceEur.toLocaleString()})</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default OfferModal;
