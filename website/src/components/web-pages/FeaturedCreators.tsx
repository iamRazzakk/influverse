'use client';

import React from 'react';
import Link from 'next/link';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { CreatorCard } from '@/components/shared/CreatorCard';
import type { CreatorCardData } from '@/lib/api/endpoints/public';
import { ArrowRight, BadgeCheck } from 'lucide-react';

/**
 * Home page row. `creators` is loaded on the server (GET /creators/featured, tag `creators`)
 * by the home page and passed in, so the cards are in the initial HTML.
 */
export function FeaturedCreators({ creators }: { creators: CreatorCardData[] }) {
  const { t } = useLang();

  const featured = creators.slice(0, 4);

  // Nothing approved yet — hide the whole section instead of showing an empty grid.
  if (featured.length === 0) return null;

  return (
    <section className="pt-8 sm:pt-10 lg:pt-12 pb-16 sm:py-20 lg:pb-28 bg-white border-b border-[#E7E7E2]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-12 sm:mb-16 gap-5">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF0F5] text-[#FF2D78] border border-[#FF2D78]/25 text-[11px] sm:text-xs font-bold uppercase tracking-wider mb-3 sm:mb-4 font-sans">
              <BadgeCheck className="w-3.5 h-3.5" />
              Verified Marketplace Talent
            </div>
            <h2 className="text-2xl sm:text-4xl lg:text-[48px] font-black text-[#0A0A0A] tracking-tight leading-[1.15] font-sans">
              Featured{' '}
              <span className="font-editorial italic font-normal text-[#0A0A0A]">
                Creators
              </span>
            </h2>
            <p className="text-sm sm:text-base lg:text-[18px] text-[#66665E] mt-2 sm:mt-4 font-sans font-medium leading-relaxed sm:leading-[28px]">
              {t?.featured?.subtitle || 'Discover talented creators across different niches.'}
            </p>
          </div>

          <Link
            href="/creators"
            className="inline-flex items-center gap-2 text-sm sm:text-base font-bold text-[#0A0A0A] hover:text-[#FF2D78] transition-colors group self-start sm:self-auto font-sans"
          >
            <span>{t?.featured?.viewAll || 'View all creators'}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
          </Link>
        </div>

        {/* 4 Cards Grid per row across full container */}
        <div className="grid grid-cols-2 gap-3.5 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
          {featured.map((creator) => (
            <CreatorCard key={creator.id} creator={creator} />
          ))}
        </div>
      </div>
    </section>
  );
}
