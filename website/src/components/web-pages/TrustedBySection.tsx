'use client';

import React from 'react';
import type { PartnerBrand, SiteSettings } from '@/lib/api/endpoints/public';

/**
 * "Trusted by" logo marquee. Logos come from the dashboard CMS (GET /cms/partner-brands) and
 * speed / direction / on-off from the site ticker settings (GET /cms/site). The home page loads both.
 */
export function TrustedBySection({
  brands,
  ticker,
}: {
  brands: PartnerBrand[];
  ticker?: SiteSettings['ticker'];
}) {
  if (!brands.length || ticker?.isEnabled === false) return null;

  const speed = ticker?.speedSeconds ?? 26;
  const marqueeStyle: React.CSSProperties = {
    animationDuration: `${speed}s`,
    animationDirection: ticker?.direction === 'right' ? 'reverse' : 'normal',
  };

  const logo = (brand: PartnerBrand, key: string) => {
    const img = (
      <img src={brand.logoUrl} alt={brand.name} loading="lazy" className="h-6 sm:h-7 w-auto max-w-[140px] object-contain" />
    );
    return (
      <div key={key} className="shrink-0">
        {brand.websiteUrl ? (
          <a href={brand.websiteUrl} target="_blank" rel="noopener noreferrer nofollow" title={brand.name}>
            {img}
          </a>
        ) : (
          img
        )}
      </div>
    );
  };

  return (
    <section
      className="bg-white border-y border-[#E7E7E2] py-4 sm:py-5 relative overflow-hidden font-sans select-none shrink-0 w-full"
      aria-label={ticker?.headline || 'Trusted by leading brands'}
    >
      <div className="w-full">
        <div className={`relative w-full overflow-hidden ${ticker?.pauseOnHover === false ? '' : 'group'}`}>
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-16 sm:w-32 bg-gradient-to-r from-white via-white/80 to-transparent z-10" />
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-16 sm:w-32 bg-gradient-to-l from-white via-white/80 to-transparent z-10" />

          {/* The list is repeated 3× so the loop stays seamless on wide screens. */}
          <div
            style={marqueeStyle}
            className="animate-marquee-infinite flex items-center gap-12 sm:gap-16 opacity-75 grayscale hover:grayscale-0 transition-all duration-500 py-1 group-hover:[animation-play-state:paused]"
          >
            {[0, 1, 2].flatMap((set) => brands.map((brand) => logo(brand, `logo-${set}-${brand.id}`)))}
          </div>
        </div>
      </div>
    </section>
  );
}
