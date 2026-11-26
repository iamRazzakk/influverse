'use client';

import React from 'react';
import { X, Layers, Music2, Edit3, Eye, Heart } from 'lucide-react';
import type { PortfolioItem } from '@/lib/api/endpoints/studio';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { CategoryIcon } from '@/components/shared/CategoryIcon';
import { InstagramLogo, TikTokLogo, YouTubeLogo } from '@/components/shared/SocialLogos';
import { RemoteImage } from '@/components/shared/RemoteImage';

/** Fields the lightbox needs — the creator's own item (GET /me/portfolio) or a public profile item. */
export type PortfolioModalItem = Pick<
  PortfolioItem,
  'id' | 'title' | 'mediaType' | 'media' | 'platforms' | 'brandName' | 'brandLogo' | 'description' | 'deliverableType' | 'soundTrack' | 'aspectRatio' | 'thumbnailUrl' | 'metrics'
>;

interface PortfolioVideoModalProps<T extends PortfolioModalItem> {
  item: T | null;
  creator: { name: string; handle?: string; avatar?: string; verified?: boolean };
  onClose: () => void;
  onBookCampaign?: (item: T) => void;
  onEdit?: (item: T) => void;
}

const PLATFORM_LABEL: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', ugc: 'UGC Ads' };

const platformIcon = (platform?: string) => {
  switch (platform) {
    case 'instagram':
      return <InstagramLogo circle className="w-5 h-5 shrink-0 shadow-2xs" />;
    case 'tiktok':
      return <TikTokLogo circle className="w-5 h-5 shrink-0 shadow-2xs" />;
    case 'youtube':
      return <YouTubeLogo circle className="w-5 h-5 shrink-0 shadow-2xs" />;
    case 'ugc':
      return (
        <span className="w-5 h-5 rounded-full bg-[#6444A6] flex items-center justify-center text-white shrink-0 shadow-2xs">
          <CategoryIcon name="ugc" size={12} className="text-white" />
        </span>
      );
    default:
      return (
        <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white shrink-0 shadow-2xs">
          <Layers className="w-3 h-3" />
        </span>
      );
  }
};

export const portfolioPlatformLabel = (platforms: string[] = []) =>
  platforms.length === 0
    ? 'Personal work'
    : platforms.length >= 4
      ? 'All platforms'
      : platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(' • ');

/** Full-screen preview of one portfolio item (plays the real uploaded video). */
export function PortfolioVideoModal<T extends PortfolioModalItem>({
  item,
  creator,
  onClose,
  onEdit,
}: PortfolioVideoModalProps<T>) {
  if (!item) return null;

  const isVertical = item.aspectRatio === '9:16' || item.aspectRatio === '4:5';
  const label = portfolioPlatformLabel(item.platforms);
  const icon = platformIcon(item.platforms.length === 1 ? item.platforms[0] : undefined);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md transition-all font-sans animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[92vh] bg-white rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col lg:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 w-9 h-9 rounded-full bg-black/60 hover:bg-black text-white flex items-center justify-center transition-all cursor-pointer shadow-md"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Media viewport */}
        <div
          className={`relative bg-[#0A0A0A] flex items-center justify-center overflow-hidden shrink-0 ${
            isVertical
              ? 'lg:w-[420px] h-[280px] sm:h-[360px] lg:h-auto lg:min-h-[580px]'
              : 'lg:w-[58%] h-[220px] sm:h-[320px] lg:h-auto lg:min-h-[580px]'
          }`}
        >
          {item.mediaType === 'video' ? (
            <video
              src={item.media.url}
              poster={item.thumbnailUrl}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
          ) : (
            <RemoteImage src={item.media.url} alt={item.title ?? ''} className="w-full h-full object-contain" width={800} height={800} sizes="(min-width: 1024px) 50vw, 100vw" />
          )}

          <div className="absolute top-4 left-4 z-20 pointer-events-none">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-white text-xs font-bold uppercase tracking-wider border border-white/15">
              {icon}
              <span>{label}</span>
            </span>
          </div>

          {item.soundTrack && (
            <div className="absolute bottom-16 left-4 right-4 z-20 flex items-center gap-2 text-white/90 text-sm font-medium bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 truncate pointer-events-none">
              <Music2 className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span className="truncate">{item.soundTrack}</span>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 p-4 sm:p-8 overflow-y-auto max-h-[85vh] lg:max-h-[580px] space-y-4 sm:space-y-6 flex flex-col justify-between bg-white font-sans">
          <div className="space-y-4 sm:space-y-6">
            <div className="space-y-2.5 sm:space-y-3">
              {item.brandName && (
                <div className="flex items-center gap-2">
                  {item.brandLogo && (
                    <RemoteImage src={item.brandLogo} alt={item.brandName ?? ''} className="w-5 h-5 rounded-full object-cover border border-[#E7E7E2]" width={40} height={40} sizes="20px" />
                  )}
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[#66665E]">{item.brandName}</span>
                </div>
              )}

              <h2 className="text-xl sm:text-3xl font-black text-[#0A0A0A] tracking-tight leading-snug">{item.title}</h2>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F4F4F0] border border-[#E7E7E2] text-xs font-bold text-[#0A0A0A]">
                  {icon}
                  <span>{label}</span>
                </span>
                {item.deliverableType && (
                  <span className="px-3 py-1 rounded-full bg-[#FAFAF8] border border-[#E7E7E2] text-xs font-semibold text-[#66665E]">
                    {item.deliverableType}
                  </span>
                )}
              </div>
            </div>

            {(item.metrics?.views || item.metrics?.likes) ? (
              <div className="flex items-center gap-4 text-sm font-bold text-[#0A0A0A]">
                {item.metrics?.views ? (
                  <span className="flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-[#66665E]" />
                    {item.metrics.views.toLocaleString()} views
                  </span>
                ) : null}
                {item.metrics?.likes ? (
                  <span className="flex items-center gap-1.5">
                    <Heart className="w-4 h-4 text-[#66665E]" />
                    {item.metrics.likes.toLocaleString()} likes
                  </span>
                ) : null}
              </div>
            ) : null}

            {item.description && (
              <div className="space-y-3.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#66665E]">About This Project</h3>
                <div className="text-sm text-[#3A3A35] leading-relaxed font-medium bg-[#FAFAF8] p-5 rounded-2xl border border-[#E7E7E2] whitespace-pre-line">
                  {item.description}
                </div>
              </div>
            )}
          </div>

          <div className="pt-5 border-t border-[#E7E7E2] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {creator.avatar ? (
                <RemoteImage src={creator.avatar} alt={creator.name ?? ''} className="w-10 h-10 rounded-full object-cover border border-[#E7E7E2]" width={80} height={80} sizes="40px" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#F4F4F0] border border-[#E7E7E2] flex items-center justify-center font-black text-[#0A0A0A]">
                  {creator.name.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-extrabold text-sm text-[#0A0A0A] truncate">{creator.name}</span>
                  {creator.verified && <VerifiedBadge size="xs" />}
                </div>
                {creator.handle && <span className="text-xs text-[#66665E] font-medium">@{creator.handle.replace(/^@/, '')}</span>}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="px-4 py-2.5 rounded-full font-bold text-xs sm:text-sm bg-[#0A0A0A] hover:bg-zinc-800 text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Work</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-full font-bold text-xs sm:text-sm bg-[#F4F4F0] hover:bg-[#E7E7E2] text-[#0A0A0A] transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
