import React from 'react';
import { SplitHero } from '@/components/web-pages/SplitHero';
import { TrustedBySection } from '@/components/web-pages/TrustedBySection';
import { FeaturedCreators } from '@/components/web-pages/FeaturedCreators';
import { DesignMonkBentoSection } from '@/components/web-pages/DesignMonkBentoSection';
import { ValuePropsSection } from '@/components/web-pages/ValuePropsSection';
import { CollaborationModelsSection } from '@/components/web-pages/CollaborationModelsSection';
import { HowItWorksSection } from '@/components/web-pages/HowItWorksSection';
import { PricingSection } from '@/components/web-pages/PricingSection';
import { CreatorInviteSection } from '@/components/web-pages/CreatorInviteSection';
import { FaqSection } from '@/components/web-pages/FaqSection';
import { serverFetch } from '@/lib/serverFetch';
import { tryPublic } from '@/lib/api/server';
import { metaEndpoints } from '@/lib/api/endpoints/meta';
import type { CmsFaq, CreatorCardData, PartnerBrand, SiteSettings } from '@/types/public';

export const metadata = {
  title: 'Influverse — The Creator Marketplace for Brands & Influencers',
  description:
    'Discover, collaborate, and hire vetted creators across Instagram, TikTok, and YouTube with 100% escrow protection and transparent 15% platform fees in EUR.',
};

/**
 * Server component: the dynamic sections are fetched here so they are in the initial HTML (SEO).
 * Tags match the server's POST /api/revalidate calls, so CMS / creator edits show up right away.
 * Every fetch falls back to an empty value — a failing API hides a section instead of breaking the page.
 */
export default async function HomePage() {
  const [featured, partnerBrands, site, faqs, meta] = await Promise.all([
    serverFetch<CreatorCardData[]>('/creators/featured', { tags: ['creators'], revalidate: 120 }),
    serverFetch<PartnerBrand[]>('/cms/partner-brands', { tags: ['cms:partner-brands'] }),
    serverFetch<SiteSettings>('/cms/site', { tags: ['cms:site'] }),
    serverFetch<CmsFaq[]>('/cms/faqs', { tags: ['cms:faqs'] }),
    tryPublic((api) => metaEndpoints(api).options()),
  ]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Above-The-Fold Viewport Unit: Hero + Docked Brand Marquee */}
      <div className="relative bg-[#FAFAF8] lg:min-h-[calc(100dvh-5rem)] flex flex-col justify-between">
        <SplitHero headline={site?.heroHeadline} subtitle={site?.heroSubtitle} categories={meta?.creatorCategories} />
        <TrustedBySection brands={partnerBrands ?? []} ticker={site?.ticker} />
      </div>
      <FeaturedCreators creators={featured ?? []} />
      <DesignMonkBentoSection />
      <ValuePropsSection />
      <CollaborationModelsSection />
      <HowItWorksSection />
      <PricingSection />
      <FaqSection faqs={faqs ?? []} showViewAll={true} limit={5} />
      <CreatorInviteSection dual />
    </div>
  );
}
