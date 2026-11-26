'use client';

import React from 'react';
import Link from 'next/link';
import type { CreatorCardData } from '@/lib/api/endpoints/public';
import { formatCents } from '@/lib/format';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { useSaveCreator } from '@/components/shared/useSaveCreator';
import { avatarFallback, formatRating, labelize } from '@/components/shared/creatorFormat';
import { ArrowRight, Star } from 'lucide-react';
import { InstagramLogo, TikTokLogo, YouTubeLogo } from '@/components/shared/SocialLogos';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { SaveButton } from '@/components/shared/SaveButton';
import { Button, Badge } from '@/components/ui';
import { RemoteImage } from '@/components/shared/RemoteImage';

interface CreatorCardProps {
  creator: CreatorCardData;
}

/** Per-platform stats keyed by name, so the markup can do `platforms.instagram?.followersFormatted`. */
const platformMap = (creator: CreatorCardData) => ({
  instagram: creator.platforms.find((p) => p.platform === 'instagram'),
  tiktok: creator.platforms.find((p) => p.platform === 'tiktok'),
  youtube: creator.platforms.find((p) => p.platform === 'youtube'),
});

/** Shared save logic for both card layouts. */
const useCardSave = (creatorId: string) => {
  const { canSave, isSaved, toggle } = useSaveCreator();
  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void toggle(creatorId);
  };
  return { canSave, isSaved: isSaved(creatorId), handleSave };
};

export function CreatorCard({ creator }: CreatorCardProps) {
  const { canSave, isSaved, handleSave } = useCardSave(creator.id);
  const platforms = platformMap(creator);
  const href = `/creators/${creator.handle || creator.id}`;
  const { t } = useLang();
  const tc = t.creatorCard;
  const catLabel = (key: string) => t.categories[key] ?? labelize(key);
  const rating = creator.reviewsCount ? formatRating(creator.rating, creator.reviewsCount) : tc.newCreator;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-[#E7E7E2] bg-white font-sans transition-[border-color,box-shadow,transform] duration-300 hover:border-[#0A0A0A] hover:shadow-[0_16px_36px_-12px_rgba(10,10,10,0.08)] lg:hover:-translate-y-0.5">
      <Link
        href={href}
        aria-label={`${tc.view} ${creator.name}`}
        className="absolute inset-0 z-[1] lg:hidden"
      />
      {/* Creator Portrait Section */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F4F4F0]">
        <RemoteImage
          src={creator.avatar || avatarFallback(creator.name)}
          alt={creator.name ?? ''}
          className="h-full w-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          width={600} height={750} sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
        />
        <Link
          href={href}
          aria-label={`${tc.view} ${creator.name}`}
          className="absolute inset-0 z-[1] hidden lg:block"
        />

        {/* Rating pill top left */}
        <div className="absolute left-2 top-2 z-[2] flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-xs backdrop-blur-md lg:left-3 lg:top-3 lg:px-2.5 lg:py-1 lg:text-[12px]">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400 lg:h-3.5 lg:w-3.5" />
          <span>{rating}</span>
        </div>

        {/* Top Right Save/Bookmark Action Button */}
        <div className="absolute right-2 top-2 z-[2] lg:right-3 lg:top-3">
          {canSave && <SaveButton saved={isSaved} overlay onClick={handleSave} />}
        </div>
      </div>

      {/* Card Info Body with refined balanced padding */}
      <div className="flex flex-1 flex-col justify-between space-y-2.5 p-3.5 sm:p-4 lg:space-y-4 lg:p-5">
        <div>
          {/* Creator Name & Price Header */}
          <div className="mb-1.5 flex items-start justify-between gap-1.5 lg:mb-2 lg:gap-2">
            <div className="min-w-0 flex-1">
              <Link href={href} className="relative z-[2] inline-flex max-w-full items-center gap-1 group/link">
                <h3 className="truncate font-sans text-[13px] sm:text-sm font-bold tracking-tight text-[#0A0A0A] transition-colors group-hover/link:text-[#FF2D78] lg:text-base">
                  {creator.name}
                </h3>
                {creator.verified && <VerifiedBadge size="sm" />}
              </Link>
            </div>

            <div className="shrink-0 text-right">
              <span className="hidden font-sans text-[11px] font-medium text-[#8A8A82] lg:block">
                {tc.from}
              </span>
              <strong className="font-sans text-sm sm:text-base font-bold tracking-tight tabular-nums text-[#0A0A0A] lg:text-xl">
                {formatCents(creator.startingPriceCents)}
              </strong>
            </div>
          </div>

          {/* Category Tags Pills */}
          <div className="mb-2.5 flex flex-wrap gap-1 lg:mb-3.5 lg:gap-1.5">
            {creator.categories.slice(0, 1).map((cat) => (
              <Badge key={cat} variant="neutral" size="sm">
                {catLabel(cat)}
              </Badge>
            ))}
            <span className="hidden lg:contents">
              {creator.categories.slice(1, 3).map((cat) => (
                <Badge key={cat} variant="neutral" size="sm">
                  {catLabel(cat)}
                </Badge>
              ))}
            </span>
          </div>

          {/* Mobile Clean Followers & Channels (No crowding) */}
          <div className="flex sm:hidden items-center justify-between border-t border-[#F0F0EB] pt-2.5 font-sans">
            <div className="flex items-center gap-1.5">
              {platforms.instagram ? (
                <>
                  <InstagramLogo circle className="w-4 h-4 shrink-0 shadow-2xs" />
                  <span className="text-xs font-black text-[#0A0A0A]">
                    {platforms.instagram.followersFormatted}
                  </span>
                </>
              ) : platforms.tiktok ? (
                <>
                  <TikTokLogo circle className="w-4 h-4 shrink-0 shadow-2xs" />
                  <span className="text-xs font-black text-[#0A0A0A]">
                    {platforms.tiktok.followersFormatted}
                  </span>
                </>
              ) : platforms.youtube ? (
                <>
                  <YouTubeLogo circle className="w-4 h-4 shrink-0 shadow-2xs" />
                  <span className="text-xs font-black text-[#0A0A0A]">
                    {platforms.youtube.followersFormatted}
                  </span>
                </>
              ) : null}
            </div>

            <div className="flex items-center gap-1">
              {platforms.tiktok && platforms.instagram && (
                <TikTokLogo circle className="w-4 h-4 shrink-0 shadow-2xs" />
              )}
              {platforms.youtube && (platforms.instagram || platforms.tiktok) && (
                <YouTubeLogo circle className="w-4 h-4 shrink-0 shadow-2xs" />
              )}
            </div>
          </div>

          {/* Desktop/Tablet Follower Counts Bar with crisp icons & proper sizes */}
          <div className="hidden sm:flex items-center justify-between gap-1 overflow-hidden border-t border-[#F0F0EB] pt-2.5 font-sans text-xs font-bold text-[#0A0A0A] lg:pt-3 lg:text-sm">
            {platforms.instagram && (
              <div className="flex items-center gap-1 sm:gap-1.5">
                <InstagramLogo circle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 shadow-2xs" />
                <span className="text-[11px] sm:text-xs font-extrabold text-[#0A0A0A]">
                  {platforms.instagram.followersFormatted}
                </span>
              </div>
            )}

            {platforms.tiktok && (
              <div className="flex items-center gap-1 sm:gap-1.5">
                <TikTokLogo circle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 shadow-2xs" />
                <span className="text-[11px] sm:text-xs font-extrabold text-[#0A0A0A]">
                  {platforms.tiktok.followersFormatted}
                </span>
              </div>
            )}

            {platforms.youtube && (
              <div className="flex items-center gap-1 sm:gap-1.5">
                <YouTubeLogo circle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 shadow-2xs" />
                <span className="text-[11px] sm:text-xs font-extrabold text-[#0A0A0A]">
                  {platforms.youtube.followersFormatted}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="relative z-[2] hidden lg:block">
          <Button
            href={href}
            size="md"
            variant="secondary"
            fullWidth
            className="!h-10 !text-sm"
            iconRight={<ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />}
          >
            {tc.viewProfile}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CreatorListRow({ creator }: CreatorCardProps) {
  const { canSave, isSaved, handleSave } = useCardSave(creator.id);
  const platforms = platformMap(creator);
  const href = `/creators/${creator.handle || creator.id}`;
  const { t } = useLang();
  const tc = t.creatorCard;
  const catLabel = (key: string) => t.categories[key] ?? labelize(key);
  const rating = creator.reviewsCount ? formatRating(creator.rating, creator.reviewsCount) : tc.newCreator;

  const handleFormatted = creator.handle?.startsWith('@') ? creator.handle : `@${creator.handle}`;

  return (
    <article className="rounded-2xl border border-[#E7E7E2] bg-white p-4 sm:p-5 transition-[border-color,box-shadow] duration-300 hover:border-[#0A0A0A] hover:shadow-[0_16px_36px_-12px_rgba(10,10,10,0.08)]">
      {/* Top Row: Identity on Left, Price on Right */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
        {/* Left: Avatar + Details */}
        <div className="flex items-start gap-3.5 sm:gap-4 min-w-0 flex-1">
          <Link href={href} className="relative shrink-0">
            <RemoteImage
              src={creator.avatar || avatarFallback(creator.name)}
              alt={creator.name ?? ''}
              className="h-14 w-14 sm:h-16 sm:w-16 rounded-xl border border-[#E7E7E2] object-cover object-top"
              width={128} height={128} sizes="64px"
            />
            {creator.verified && (
              <VerifiedBadge className="absolute -bottom-1 -right-1 h-4 w-4 sm:h-5 sm:w-5" />
            )}
          </Link>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={href}
                className="font-bold text-base sm:text-lg text-[#0A0A0A] hover:text-[#FF2D78] transition-colors leading-tight"
              >
                {creator.name}
              </Link>
              <span className="text-xs sm:text-sm font-medium text-[#66665E]">
                {handleFormatted}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs sm:text-sm">
              <span className="inline-flex items-center gap-1 font-bold text-[#0A0A0A]">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span>{rating}</span>
                <span className="font-medium text-[#66665E]">({creator.reviewsCount})</span>
              </span>
            </div>

            {/* Categories */}
            <div className="pt-1 flex flex-wrap gap-1.5">
              {creator.categories.slice(0, 4).map((cat) => (
                <span
                  key={cat}
                  className="rounded-full border border-[#E7E7E2] bg-[#FAFAF8] px-2.5 py-0.5 text-[11px] sm:text-xs font-semibold text-[#555550]"
                >
                  {catLabel(cat)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Packages from Price (Top Right) */}
        <div className="shrink-0 text-left sm:text-right flex items-center justify-between sm:flex-col sm:items-end sm:justify-start">
          <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#66665E]">
            {tc.packagesFrom}
          </div>
          <div className="text-lg sm:text-2xl font-black text-[#0A0A0A] leading-tight">
            {formatCents(creator.startingPriceCents)}
          </div>
        </div>
      </div>

      {/* Bottom Row: Clustered Social Reach on Left, View Profile + Save on Right */}
      <div className="mt-3.5 pt-3.5 border-t border-[#F0F0EB] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Clustered Channels: Clean, compact, no giant empty gaps! */}
        <div className="flex items-center gap-3 sm:gap-5 flex-wrap">
          {platforms.instagram && (
            <div className="inline-flex items-center gap-1.5 text-xs text-[#0A0A0A]">
              <InstagramLogo circle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 shadow-2xs" />
              <span className="font-extrabold">{platforms.instagram.followersFormatted}</span>
              <span className="text-[#66665E] font-medium hidden xs:inline">Instagram</span>
            </div>
          )}

          {platforms.tiktok && (
            <div className="inline-flex items-center gap-1.5 text-xs text-[#0A0A0A]">
              <TikTokLogo circle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 shadow-2xs" />
              <span className="font-extrabold">{platforms.tiktok.followersFormatted}</span>
              <span className="text-[#66665E] font-medium hidden xs:inline">TikTok</span>
            </div>
          )}

          {platforms.youtube && (
            <div className="inline-flex items-center gap-1.5 text-xs text-[#0A0A0A]">
              <YouTubeLogo circle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 shadow-2xs" />
              <span className="font-extrabold">{platforms.youtube.followersFormatted}</span>
              <span className="text-[#66665E] font-medium hidden xs:inline">YouTube</span>
            </div>
          )}
        </div>

        {/* Right Action Button & Save */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <Link
            href={href}
            className="inline-flex h-9 sm:h-10 items-center justify-center gap-1.5 rounded-full bg-[#0A0A0A] hover:bg-zinc-800 text-white px-4 sm:px-5 text-xs sm:text-sm font-bold transition-all shadow-xs cursor-pointer"
          >
            <span>{tc.viewProfile}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          {canSave && <SaveButton saved={isSaved} onClick={handleSave} />}
        </div>
      </div>
    </article>
  );
}
