'use client';

import React from 'react';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { ArrowRight, ShieldCheck, DollarSign, Award, Flame } from 'lucide-react';
import { Button } from '@/components/ui';

export function CreatorInviteSection({ dual = false }: { dual?: boolean }) {
  const { t } = useLang();

  return (
    <section className="py-16 sm:py-20 lg:py-24 bg-[#FAFAF8] relative overflow-hidden font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="app-panel-dark p-6 sm:p-10 lg:p-14 rounded-2xl sm:rounded-3xl relative overflow-hidden">
          {/* Subtle decorative circles */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-[#FF2D78]/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-60 h-60 bg-[#F1EEF9]/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl lg:max-w-4xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white text-[11px] sm:text-xs font-bold uppercase tracking-wider mb-2.5 sm:mb-4">
              <Flame className="w-3.5 h-3.5 text-[#FF2D78]" />
              {dual ? 'For Brands & Creators' : 'For Creators & Influencers'}
            </div>

            <h2 className="text-xl min-[360px]:text-2xl sm:text-4xl lg:text-[48px] font-black text-white tracking-tight leading-[1.15]">
              {dual ? 'Ready to start your next collaboration?' : t?.creatorInvite?.title || 'Turn your passion into predictable brand deals.'}
            </h2>

            <p className="text-xs min-[360px]:text-sm sm:text-base lg:text-[18px] text-[#A3A39C] leading-relaxed sm:leading-[28px] mt-2 sm:mt-4 mb-5 sm:mb-8 max-w-2xl font-medium">
              {dual
                ? 'Brands hire vetted creators with escrow-protected payments. Creators set their own EUR prices and get paid on approval.'
                : t?.creatorInvite?.subtitle ||
                  'Join thousands of verified creators monetizing their content. Set your own prices in EUR, receive upfront funded offers, and never chase unpaid invoices again.'}
            </p>

            <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-y-2.5 sm:gap-y-3 gap-x-6 sm:gap-x-8 mb-6 sm:mb-8">
              <div className="flex items-center gap-2 text-xs min-[360px]:text-sm sm:text-[15px] font-semibold text-[#FAFAF8]">
                <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" />
                <span>100% Escrow Protection</span>
              </div>
              <div className="flex min-w-0 items-center gap-2 text-xs min-[360px]:text-sm sm:text-[15px] font-semibold text-[#FAFAF8]">
                <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-[#FF2D78] shrink-0" />
                <span>{dual ? 'Flat 15% Brand Fee • 0% for Creators' : '0% Platform Fee for Creators (Keep 100%)'}</span>
              </div>
              <div className="flex items-center gap-2 text-xs min-[360px]:text-sm sm:text-[15px] font-semibold text-[#FAFAF8]">
                <Award className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300 shrink-0" />
                <span>Vetted Global Brands</span>
              </div>
            </div>

            {dual ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                <Button
                  href="/search"
                  size="md"
                  variant="white"
                  iconRight={<ArrowRight className="w-4 h-4" />}
                >
                  I&apos;m a Brand — Find Creators
                </Button>
                <Button
                  href="/register?role=creator"
                  size="md"
                  variant="dark-outline"
                  iconRight={<ArrowRight className="w-4 h-4" />}
                >
                  I&apos;m a Creator — Join Free
                </Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-4">
                <Button
                  href="/register"
                  size="md"
                  variant="white"
                  iconRight={<ArrowRight className="w-4 h-4" />}
                >
                  Create Creator Profile
                </Button>
                <Button
                  href="/how-it-works?tab=creators"
                  size="md"
                  variant="dark-outline"
                >
                  Learn How Creators Earn
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
