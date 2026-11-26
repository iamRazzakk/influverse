'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { message } from 'antd';
import { useAuth } from '@/lib/session/AuthProvider';
import { formatCents } from '@/lib/format';
import {
  ArrowRight,
  Check,
  Clock,
  RotateCcw,
  Film,
  Video,
  Flame,
  Layers,
  Edit3,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { InstagramLogo, TikTokLogo, YouTubeLogo } from '@/components/shared/SocialLogos';

/**
 * The fields the card needs. Works with both the creator's own package (GET /me/packages)
 * and a package on a public creator profile (GET /creators/:idOrHandle).
 */
export interface PackageCardData {
  id: string;
  title: string;
  description?: string;
  /** 'instagram' | 'tiktok' | 'youtube' | 'ugc' */
  platforms: string[];
  priceCents: number;
  deliveryDays: number;
  revisions: number;
  inclusions?: string[];
  popular?: boolean;
}

interface PackageCardProps {
  packageItem?: PackageCardData;
  pkg?: PackageCardData;
  /** Creator who owns the package. `id` is the creator's user id. */
  creator?: {
    id: string;
    name: string;
    handle?: string;
    avatar?: string;
    verified?: boolean;
  };
  /** Called instead of the default "book" action (opens the hire flow). */
  onSelect?: (pkg: PackageCardData) => void;
}

export function getPackageChannels(pkg: Pick<PackageCardData, 'platforms'>): { id: string; label: string; icon: React.ReactNode }[] {
  const rawPlatforms = pkg.platforms ?? [];

  return rawPlatforms.map((p) => {
    switch (p) {
      case 'instagram':
        return { id: 'instagram', label: 'Instagram', icon: <InstagramLogo className="w-3.5 h-3.5" /> };
      case 'tiktok':
        return { id: 'tiktok', label: 'TikTok', icon: <TikTokLogo className="w-3.5 h-3.5" /> };
      case 'youtube':
        return { id: 'youtube', label: 'YouTube', icon: <YouTubeLogo className="w-3.5 h-3.5" /> };
      case 'ugc':
        return { id: 'ugc', label: 'UGC', icon: <Film className="w-3.5 h-3.5 text-[#0A0A0A]" /> };
      default:
        return { id: p, label: 'Omni', icon: <Layers className="w-3.5 h-3.5 text-[#0A0A0A]" /> };
    }
  });
}

export function PackageCard({ packageItem, pkg, creator, onSelect }: PackageCardProps) {
  const router = useRouter();
  const { currentUser } = useAuth();
  const currentPkg = packageItem || pkg;

  if (!currentPkg) return null;

  const channels = getPackageChannels(currentPkg);

  const isCreatorUser = currentUser?.role === 'creator';
  const isSelf = isCreatorUser && Boolean(creator?.id) && currentUser?.id === creator?.id;
  const isOtherCreator = isCreatorUser && !isSelf;

  const handleSelectPackage = () => {
    if (isSelf) {
      router.push('/creator/packages');
      return;
    }

    if (isOtherCreator) {
      message.info('Logged in as a creator. Brand accounts can book packages.');
      return;
    }

    if (onSelect) {
      onSelect(currentPkg);
      return;
    }

    // Orders / offers are server Phase 3: send the brand to the hire flow with this package preselected.
    if (creator) {
      router.push(`/brand/hire/new?creator=${encodeURIComponent(creator.handle || creator.id)}&package=${currentPkg.id}`);
    }
  };

  return (
    <div
      onClick={handleSelectPackage}
      className={`min-w-0 rounded-2xl sm:rounded-3xl border p-4 sm:p-5 flex flex-col justify-between transition-all duration-300 hover:shadow-lg cursor-pointer group font-sans relative bg-white ${currentPkg.popular
          ? 'border-[#0A0A0A] ring-1 ring-[#0A0A0A]'
          : 'border-[#E7E7E2] hover:border-[#0A0A0A]'
        }`}
    >
      {currentPkg.popular && (
        <div className="absolute -top-2.5 left-3 sm:-top-3 sm:left-6">
          <Badge variant="dark" size="sm" icon={<Flame className="w-3 h-3 text-amber-300" />}>
            Most Popular
          </Badge>
        </div>
      )}

      <div className="space-y-2.5 sm:space-y-3.5">
        {/* Top row: Platform Channels */}
        <div className="flex items-center justify-between gap-2 min-h-[28px]">
          {channels.length <= 2 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {channels.map((ch) => (
                <span
                  key={ch.id}
                  className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#FAFAF8] text-[#0A0A0A] border border-[#E7E7E2] inline-flex items-center gap-1.5 shrink-0 shadow-2xs"
                >
                  {ch.icon}
                  <span>{ch.label}</span>
                </span>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#FAFAF8] text-[#0A0A0A] border border-[#E7E7E2] inline-flex items-center gap-2 shadow-2xs">
                <span className="flex items-center -space-x-1.5 shrink-0">
                  {channels.map((ch) => (
                    <span
                      key={ch.id}
                      className="w-5 h-5 rounded-full bg-white border border-[#E7E7E2] flex items-center justify-center shadow-2xs shrink-0 overflow-hidden"
                      title={ch.label}
                    >
                      {ch.icon}
                    </span>
                  ))}
                </span>
                <span className="text-[#0A0A0A] font-extrabold text-xs whitespace-nowrap">
                  All {channels.length} Platforms
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Title, Price & Description Block */}
        <div className="min-w-0 space-y-1">
          <div className="text-2xl sm:text-[28px] font-black text-[#0A0A0A] tracking-tight">
            {formatCents(currentPkg.priceCents)}
          </div>
          <h4 className="font-extrabold text-[#0A0A0A] text-sm sm:text-base group-hover:text-[#FF2D78] transition-colors leading-snug">
            {currentPkg.title}
          </h4>
          {channels.length > 2 && (
            <p className="text-[11px] font-semibold text-[#66665E] mt-1 flex items-center gap-1.5 flex-wrap">
              <span className="text-[#0A0A0A] font-bold">Includes:</span>
              <span>{channels.map((c) => c.label).join(' • ')}</span>
            </p>
          )}
          <p className="text-xs sm:text-sm text-[#66665E] mt-1 leading-snug sm:leading-relaxed line-clamp-2">
            {currentPkg.description}
          </p>
        </div>

        {/* Inclusions Checklist */}
        {currentPkg.inclusions && currentPkg.inclusions.length > 0 && (
          <ul className="space-y-1 sm:space-y-1.5 border-t border-[#F4F4F0] pt-2 sm:pt-3 text-[11px] sm:text-xs text-[#44443E]">
            {currentPkg.inclusions.slice(0, 3).map((item, idx) => (
              <li key={idx} className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#FF2D78] shrink-0" />
                <span className="truncate font-medium">{item}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer Specs & CTA */}
      <div className="pt-2.5 mt-2.5 sm:pt-4 sm:mt-4 border-t border-[#E7E7E2] space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between gap-2 text-[12px] sm:text-sm text-[#66665E] font-bold">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-[#66665E]" />
            {currentPkg.deliveryDays}d turnaround
          </span>
          <span className="flex items-center gap-1">
            <RotateCcw className="w-3.5 h-3.5 text-[#66665E]" />
            {currentPkg.revisions} revisions
          </span>
        </div>

        <Button
          type="button"
          size="sm"
          variant={isSelf ? 'secondary' : isOtherCreator ? 'secondary' : 'primary'}
          fullWidth
          className="sm:!h-10 sm:!px-5 sm:!text-sm"
          icon={isSelf ? <Edit3 className="w-3.5 h-3.5" /> : undefined}
          iconRight={!isSelf && !isOtherCreator ? <ArrowRight className="w-3.5 h-3.5" /> : undefined}
        >
          {isSelf ? 'Edit Package' : isOtherCreator ? 'Package Inclusions' : 'Book Package'}
        </Button>
      </div>
    </div>
  );
}
