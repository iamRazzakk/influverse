'use client';

import React, { useState, useEffect, useMemo, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { http } from '@/lib/api/client';
import { publicEndpoints } from '@/lib/api/endpoints/public';
import { useRequest } from '@/lib/hooks/useRequest';
import type { PublicCreatorDetail } from '@/types/public';
import { offersEndpoints, type OfferPlatform } from '@/lib/api/endpoints/offers';
import { getErrorMessage } from '@/lib/api/errors';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { toLegacyCreator } from '@/components/shared/creatorAdapter';
import { avatarFallback } from '@/components/shared/creatorFormat';
import { useDebouncedValue } from '@/components/shared/useDebouncedValue';
import { PlatformType, CreatorPackage } from '@/types';
import {
  ShieldCheck,
  Send,
  Clock,
  Check,
  Film,
} from 'lucide-react';
import { InstagramLogo, TikTokLogo, YouTubeLogo } from '@/components/shared/SocialLogos';
import { Input, Select, Button, message, Slider, InputNumber } from 'antd';
import { RemoteImage } from '@/components/shared/RemoteImage';

const PLATFORM_ITEMS: { id: PlatformType; label: string; icon: React.ReactNode }[] = [
  { id: 'instagram', label: 'Instagram', icon: <InstagramLogo className="w-4 h-4" /> },
  { id: 'tiktok', label: 'TikTok', icon: <TikTokLogo className="w-4 h-4" /> },
  { id: 'youtube', label: 'YouTube', icon: <YouTubeLogo className="w-4 h-4" /> },
  { id: 'ugc', label: 'UGC Video', icon: <Film className="w-4 h-4" /> },
];

interface HireNewViewProps {
  /** `?creator=<handle or id>` (or legacy `?creatorId=`) from the URL. */
  creatorParam: string;
  /** `?package=<id>` (or legacy `?packageId=`). */
  packageParam: string | null;
  /** Loaded by the server page for `creatorParam` (null = none chosen / not found). */
  creatorDetail: PublicCreatorDetail | null;
}

/**
 * New campaign form. The chosen creator comes from the server page; picking another creator changes
 * `?creator=` so the server loads that creator's packages. The typeahead is a browser read.
 */
export function HireNewView({ creatorParam, packageParam, creatorDetail }: HireNewViewProps) {
  const router = useRouter();
  const pathname = usePathname();

  // True while the server loads a newly picked creator.
  const [creatorLoading, startCreatorTransition] = useTransition();
  const currentCreator = useMemo(() => (creatorDetail ? toLegacyCreator(creatorDetail) : null), [creatorDetail]);
  const selectedCreatorId = currentCreator?.handle ?? (creatorParam || undefined);

  // Creator picker: typeahead from GET /creators/suggest.
  const [creatorSearch, setCreatorSearch] = useState('');
  const debouncedCreatorSearch = useDebouncedValue(creatorSearch.trim(), 250);
  const { data: suggestionData } = useRequest(
    (signal) => publicEndpoints(http).suggestCreators(debouncedCreatorSearch, signal),
    [debouncedCreatorSearch],
    { skip: !debouncedCreatorSearch },
  );
  const suggestions = useMemo(() => (debouncedCreatorSearch ? suggestionData ?? [] : []), [debouncedCreatorSearch, suggestionData]);
  const creators = useMemo(() => {
    const list = suggestions.map((c) => ({ id: c.handle, name: c.name, handle: c.handle, avatar: c.avatar || avatarFallback(c.name) }));
    if (currentCreator && !list.some((c) => c.id === currentCreator.handle)) {
      list.unshift({ id: currentCreator.handle, name: currentCreator.name, handle: currentCreator.handle, avatar: currentCreator.avatar });
    }
    return list;
  }, [suggestions, currentCreator]);

  const [selectedPackageId, setSelectedPackageId] = useState<string>('custom');
  const [collabType, setCollabType] = useState<'content_creation' | 'sponsored_post'>('sponsored_post');
  const [platforms, setPlatforms] = useState<PlatformType[]>(['instagram']);
  const [campaignTitle, setCampaignTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [requirements, setRequirements] = useState('');
  const [basePriceEur, setBasePriceEur] = useState<number>(0);
  const [deadlineDays, setDeadlineDays] = useState<number>(7);
  const [isCustomDeadline, setIsCustomDeadline] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!currentCreator) return;

    if (packageParam) {
      const foundPkg = currentCreator.packages?.find((p) => p.id === packageParam);
      if (foundPkg) {
        handleSelectPackage(foundPkg);
        return;
      }
    }

    if (currentCreator.packages && currentCreator.packages.length > 0) {
      handleSelectPackage(currentCreator.packages[0]);
    } else {
      handleSelectCustom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCreator, packageParam]);

  /** Picking another creator just changes the URL; the page reloads that creator's packages. */
  const handleSelectCreator = (handle: string) => {
    startCreatorTransition(() => router.replace(`${pathname}?creator=${encodeURIComponent(handle)}`));
  };

  const handleSelectPackage = (pkg: CreatorPackage) => {
    setSelectedPackageId(pkg.id);
    setCampaignTitle(`${pkg.title} Collab`);
    if (pkg.platforms && pkg.platforms.length > 0) {
      setPlatforms(pkg.platforms);
    } else if (pkg.platform === 'all' || pkg.platform === 'multi') {
      setPlatforms(['instagram', 'tiktok', 'youtube']);
    } else {
      setPlatforms([pkg.platform || 'instagram']);
    }
    setBasePriceEur(pkg.priceEur);
    setDeadlineDays(pkg.deliveryDays || 5);
    setIsCustomDeadline(false);
    if (pkg.platform === 'ugc') {
      setCollabType('content_creation');
    } else {
      setCollabType('sponsored_post');
    }
    if (pkg.description) {
      setBrief(pkg.description);
    }
    if (pkg.inclusions && pkg.inclusions.length > 0) {
      setRequirements(pkg.inclusions.join('\n'));
    } else {
      setRequirements(
        'Submit video draft for review before publishing\nTag official brand account\nProvide 24h performance screenshot'
      );
    }
  };

  const handleSelectCustom = () => {
    setSelectedPackageId('custom');
    setCampaignTitle('Custom Campaign Collab');
    if (platforms.length === 0) {
      setPlatforms(['instagram']);
    }
    setBasePriceEur(currentCreator?.startingPriceEur || 500);
    setDeadlineDays(7);
    setIsCustomDeadline(false);
    setCollabType('sponsored_post');
    setBrief('Highlight product features with authentic voiceover and a clear call-to-action link.');
    setRequirements(
      'Submit video draft for review before publishing\nTag official brand account\nProvide 24h performance screenshot'
    );
  };

  const togglePlatform = (pId: PlatformType) => {
    setPlatforms((prev) => {
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

  // 15% Platform Escrow Fee calculation matching OfferModal and site pricing rules
  const platformFeeEur = Math.round(basePriceEur * 0.15);
  const totalEscrowEur = basePriceEur + platformFeeEur;

  // Deadline calculation
  const deadlineDate = new Date();
  deadlineDate.setDate(deadlineDate.getDate() + (deadlineDays || 7));
  const formattedDeadline = deadlineDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  /**
   * Sends the offer to the creator (POST /offers). A selected package locks price / turnaround on the
   * server. The creator answers on their Offers page; escrow payment follows acceptance (Phase C).
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCreator) {
      message.error('Please choose a creator.');
      return;
    }
    if (!campaignTitle.trim()) {
      message.error('Please enter a campaign name.');
      return;
    }
    if (!brief.trim()) {
      message.error('Please provide a campaign brief.');
      return;
    }
    if (!basePriceEur || basePriceEur <= 0) {
      message.error('Please specify a valid offer budget.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { checkoutUrl } = await offersEndpoints(http).createBrandOffer({
        creatorId: currentCreator.id,
        packageId: selectedPackageId !== 'custom' ? selectedPackageId : undefined,
        title: campaignTitle.trim(),
        brief: brief.trim(),
        deliverables: requirements
          .split('\n')
          .map((r) => r.trim())
          .filter((r) => r.length > 0),
        platforms: platforms.filter((p): p is OfferPlatform => ['instagram', 'tiktok', 'youtube', 'ugc'].includes(p)),
        priceCents: Math.round(basePriceEur * 100),
        deliveryDays: deadlineDays || 7,
      });
      // Escrow deposit on Stripe: the card is held (not charged) until the creator accepts.
      message.loading('Redirecting to secure escrow payment…', 0);
      window.location.assign(checkoutUrl);
    } catch (error) {
      message.error(getErrorMessage(error));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen pb-16 font-sans">
      <WorkspaceHeader
        title="New Campaign"
        subtitle="Scope, deliverables, and escrow."
        backHref="/brand/campaigns"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8">
          {/* Left Column: Scope & Brief Form */}
          <div className="xl:col-span-7 min-w-0 bg-white rounded-xl p-4 sm:p-6 lg:p-8 border border-[#E7E7E2] shadow-2xs space-y-6">
            <div className="flex items-center justify-between pb-2 border-b border-[#E7E7E2]">
              <div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">
                  Campaign Scope & Terms
                </h2>
                <p className="text-xs text-[#66665E] font-medium mt-0.5">
                  Consistent brief and deliverable terms sent directly to creator
                </p>
              </div>
            </div>

            {/* 1. SELECT CREATOR */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[#66665E]">
                Target Creator
              </label>
              <Select
                value={selectedCreatorId}
                onChange={handleSelectCreator}
                className="w-full h-11"
                showSearch
                loading={creatorLoading}
                placeholder="Search by creator name or @username..."
                filterOption={false}
                onSearch={setCreatorSearch}
                notFoundContent={creatorSearch ? 'No creators found' : 'Type a name or @username'}
                optionRender={(option) => {
                  const c = creators.find((cr) => cr.id === option.data.value);
                  if (!c) return option.data.label;
                  return (
                    <div className="flex items-center gap-2.5 py-0.5">
                      <RemoteImage
                        src={c.avatar}
                        alt={c.name ?? ''}
                        className="w-6 h-6 rounded-full object-cover border border-[#E7E7E2] shrink-0" width={48} height={48} sizes="24px" />
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-bold text-[#0A0A0A] text-sm">{c.name}</span>
                        <span className="text-xs text-[#66665E]">@{c.handle.replace(/^@+/, '')}</span>
                      </div>
                    </div>
                  );
                }}
                options={creators.map((c) => ({
                  value: c.id,
                  label: `${c.name} (@${c.handle.replace(/^@+/, '')})`,
                }))}
              />

              {/* Creator Snapshot Card */}
              {!currentCreator && !creatorLoading && (
                <p className="text-xs text-[#66665E] font-medium">
                  Pick a creator to see their packages, or open a creator profile and click “Send Offer”.
                </p>
              )}
              {currentCreator && (
                <div className="p-3 bg-[#FAFAF8] rounded-lg border border-[#E7E7E2] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <RemoteImage
                        src={currentCreator.avatar}
                        alt={currentCreator.name ?? ''}
                        className="w-10 h-10 rounded-full object-cover border border-[#E7E7E2]" width={80} height={80} sizes="40px" />
                      {currentCreator.verified && <VerifiedBadge className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-1.5 min-w-0">
                        <span className="truncate max-w-full font-extrabold text-[#0A0A0A] text-sm leading-tight">
                          {currentCreator.name}
                        </span>
                        <span className="truncate max-w-full text-xs text-[#66665E]">
                          @{currentCreator.handle.replace(/^@+/, '')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#66665E]">
                      Starting Rate
                    </div>
                    <div className="text-base font-black text-[#0A0A0A]">
                      €{currentCreator.startingPriceEur.toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 2. DELIVERABLE PACKAGE / SCOPE */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#66665E]">
                  Deliverable Package
                </label>
                <span className="text-[11px] text-[#66665E] font-medium">
                  Select package preset or custom scope
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {currentCreator?.packages?.map((pkg) => {
                  const isSelected = selectedPackageId === pkg.id;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => handleSelectPackage(pkg)}
                      className={`p-3.5 rounded-lg text-left border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-[#0A0A0A] bg-[#FAFAF8] ring-2 ring-[#0A0A0A] shadow-xs'
                          : 'border-[#E7E7E2] bg-white hover:border-[#0A0A0A] hover:bg-[#FAFAF8]/50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-zinc-100 text-[#44443E]">
                            {pkg.platform === 'all' ? 'Bundle' : pkg.platform}
                          </span>
                          <span className="text-xs text-[#66665E] font-semibold flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {pkg.deliveryDays}d
                          </span>
                        </div>
                        <div className="text-sm font-bold text-[#0A0A0A] mt-2 line-clamp-2 leading-snug">
                          {pkg.title}
                        </div>
                      </div>
                      <div className="mt-3 pt-2 border-t border-[#E7E7E2] flex items-center justify-between">
                        <span className="text-sm font-black text-[#0A0A0A]">
                          €{pkg.priceEur.toLocaleString()}
                        </span>
                        {isSelected && (
                          <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5 stroke-[3]" /> Selected
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}

                {/* Custom Milestone Brief Card */}
                <button
                  type="button"
                  onClick={handleSelectCustom}
                  className={`p-3.5 rounded-lg text-left border transition-all cursor-pointer flex flex-col justify-between ${
                    selectedPackageId === 'custom'
                      ? 'border-[#0A0A0A] bg-[#FAFAF8] ring-2 ring-[#0A0A0A] shadow-xs'
                      : 'border-[#E7E7E2] bg-white hover:border-[#0A0A0A] hover:bg-[#FAFAF8]/50'
                  }`}
                >
                  <div>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-[#FF2D78]/10 text-[#FF2D78] font-bold">
                      Custom Scope
                    </span>
                    <div className="text-sm font-bold text-[#0A0A0A] mt-2 leading-snug">
                      Custom Milestone Brief
                    </div>
                    <p className="text-xs text-[#66665E] mt-1 line-clamp-2">
                      Define custom budget, platforms, turnaround & requirements
                    </p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#E7E7E2] flex items-center justify-between">
                    <span className="text-sm font-black text-[#0A0A0A]">
                      {selectedPackageId === 'custom'
                        ? `€${basePriceEur.toLocaleString()}`
                        : 'Custom Rate'}
                    </span>
                    {selectedPackageId === 'custom' && (
                      <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 stroke-[3]" /> Selected
                      </span>
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* 3. TARGET PLATFORMS */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-[#66665E]">
                  Target Platform{platforms.length > 1 ? 's' : ''}
                </label>
                <span className="text-[11px] text-[#66665E] font-medium">
                  {platforms.length > 1 ? `${platforms.length} channels selected` : 'Select one or more'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PLATFORM_ITEMS.map((item) => {
                  const isSelected = platforms.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => togglePlatform(item.id)}
                      className={`h-11 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border select-none whitespace-nowrap ${
                        isSelected
                          ? 'bg-[#0A0A0A] text-white border-[#0A0A0A] shadow-xs'
                          : 'bg-white text-[#44443E] border-[#D2D2CA] hover:border-[#0A0A0A] hover:bg-[#FAFAF8]'
                      }`}
                    >
                      {item.icon}
                      <span className="whitespace-nowrap">{item.label}</span>
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center ml-0.5 shrink-0">
                          <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. TURNAROUND TIME */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-[#66665E]">
                  Delivery Turnaround
                </label>
                <span className="text-[11px] font-bold text-[#0A0A0A]">
                  Estimated Delivery: {formattedDeadline}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className={isCustomDeadline ? 'sm:col-span-7' : 'sm:col-span-12'}>
                  <select
                    value={isCustomDeadline ? 'custom' : deadlineDays}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setIsCustomDeadline(true);
                      } else {
                        setIsCustomDeadline(false);
                        setDeadlineDays(Number(e.target.value));
                      }
                    }}
                    className="w-full h-11 px-3.5 rounded-lg text-base sm:text-sm font-bold text-[#0A0A0A] bg-white border border-[#D2D2CA] hover:border-[#0A0A0A] focus:border-[#0A0A0A] focus:outline-none transition-all cursor-pointer shadow-2xs"
                  >
                    <option value={3}>3 Days (Fast Turnaround)</option>
                    <option value={5}>5 Days (Standard)</option>
                    <option value={7}>7 Days (1 Week)</option>
                    <option value="custom">Custom (Type days)...</option>
                  </select>
                </div>

                {isCustomDeadline && (
                  <div className="sm:col-span-5 flex items-center">
                    <InputNumber
                      min={1}
                      max={180}
                      value={deadlineDays}
                      onChange={(val) => setDeadlineDays(val || 1)}
                      placeholder="e.g. 12"
                      className="w-full h-11 rounded-lg text-base sm:text-sm font-bold"
                      addonAfter="Days"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 5. CAMPAIGN NAME */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[#66665E]">
                Campaign Name
              </label>
              <Input
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                className="rounded-lg h-11 text-base sm:text-sm font-semibold"
                placeholder="e.g. Summer Skincare Product Launch"
                required
              />
            </div>

            {/* 6. CAMPAIGN BRIEF */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[#66665E]">
                Campaign Brief & Instructions
              </label>
              <Input.TextArea
                rows={3}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                className="rounded-lg text-base sm:text-sm leading-relaxed p-3"
                placeholder="Outline key campaign objectives, talking points, hook concepts, and call-to-action..."
                required
              />
            </div>

            {/* 7. DELIVERABLES & REQUIREMENTS */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#66665E]">
                  Deliverables & Requirements
                </label>
                <span className="text-[11px] text-[#66665E] font-medium">One item per line</span>
              </div>
              <Input.TextArea
                rows={3}
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                className="rounded-lg text-base sm:text-sm leading-relaxed p-3 font-medium"
                placeholder="Submit video draft for review before publishing&#10;Tag official brand account&#10;Provide 24h performance screenshot"
                required
              />
            </div>
          </div>

          {/* Right Column: Offer Financials & Direct Send */}
          <div className="xl:col-span-5 min-w-0 space-y-6">
            <div className="bg-white rounded-xl p-4 sm:p-6 lg:p-8 border border-[#E7E7E2] shadow-2xs space-y-6 xl:sticky xl:top-28">
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">
                Offer Summary
              </h2>

              {/* Creator Rate: editable input & slider ONLY for custom scope; fixed for preset packages */}
              {selectedPackageId === 'custom' ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-[#66665E] block">
                        Custom Rate
                      </label>
                      <span className="text-[11px] text-[#66665E]">
                        Define custom budget
                      </span>
                    </div>
                    <div className="w-32">
                      <InputNumber
                        min={50}
                        max={20000}
                        step={50}
                        value={basePriceEur}
                        onChange={(val) => setBasePriceEur(val || 50)}
                        prefix="€"
                        className="w-full text-base sm:text-sm font-bold rounded-lg"
                      />
                    </div>
                  </div>
                  <Slider
                    min={100}
                    max={5000}
                    step={50}
                    value={basePriceEur}
                    onChange={(v) => setBasePriceEur(v)}
                    tooltip={{ open: false }}
                  />
                </div>
              ) : (
                <div className="py-1 flex justify-between items-center">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-[#66665E] block">
                      Package Rate
                    </label>
                    <span className="text-[11px] text-[#66665E]">
                      Fixed creator rate for preset package
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-[#0A0A0A]">
                      €{basePriceEur.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-emerald-700 font-bold block">
                      Fixed rate
                    </span>
                  </div>
                </div>
              )}

              {/* Financial Calculation Breakdown with 15% Platform Escrow Fee */}
              <div className="pt-4 border-t border-[#E7E7E2] space-y-2.5">
                <div className="flex justify-between items-center text-xs text-[#66665E]">
                  <span>Creator Payout (100% to creator)</span>
                  <span className="font-bold text-[#0A0A0A]">€{basePriceEur.toLocaleString()}</span>
                </div>

                <div className="flex justify-between items-center text-xs text-[#66665E]">
                  <span className="flex items-center gap-1.5">
                    <span>Influverse Platform Fee (15%)</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#EAEAE3] text-[#0A0A0A] font-bold">
                      Escrow
                    </span>
                  </span>
                  <span className="font-bold text-[#0A0A0A]">€{platformFeeEur.toLocaleString()}</span>
                </div>

                <div className="pt-2.5 border-t border-[#E7E7E2] flex justify-between items-baseline">
                  <div>
                    <span className="text-xs font-black text-[#0A0A0A] block">
                      Total Escrow Deposit
                    </span>
                    <span className="text-[10px] text-[#66665E]">
                      Held in escrow until you approve final delivery
                    </span>
                  </div>
                  <span className="text-2xl font-black text-[#0A0A0A]">
                    €{totalEscrowEur.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Escrow Protection Trust Notice */}
              <div className="flex items-center justify-center gap-1.5 text-xs text-[#66665E] font-medium pt-1">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Escrow protected · Funds released only on your approval</span>
              </div>

              <div className="space-y-2">
                <Button
                  type="primary"
                  htmlType="submit"
                  disabled
                  loading={isSubmitting}
                  className="w-full h-12 rounded-lg font-bold text-sm bg-[#0A0A0A] hover:!bg-zinc-800 !text-white border-none shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Send className="w-4 h-4" />
                  <span>Send Offer (€{totalEscrowEur.toLocaleString()})</span>
                </Button>
                <p className="text-center text-[11px] font-semibold text-[#66665E]">
                  Checkout coming soon — escrow payments are not live yet.
                </p>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
