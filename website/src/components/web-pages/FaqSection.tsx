'use client';

import React, { useState, useEffect } from 'react';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { ChevronDown, HelpCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';
import type { CmsFaq } from '@/lib/api/endpoints/public';

export interface FaqSectionProps {
  /** Published FAQs from GET /cms/faqs (both categories), loaded by the page on the server. */
  faqs: CmsFaq[];
  showViewAll?: boolean;
  limit?: number;
  isFullPage?: boolean;
  initialTab?: 'brand' | 'creator';
  className?: string;
}

export function FaqSection({
  faqs,
  showViewAll = true,
  limit,
  isFullPage = false,
  initialTab = 'brand',
  className = '',
}: FaqSectionProps) {
  const { t, currentLang } = useLang();
  const [activeTab, setActiveTab] = useState<'brand' | 'creator'>(initialTab);
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  // Sync tab from URL query param ?tab=creator or hash
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'creator' || window.location.hash === '#creators') {
        setActiveTab('creator');
      } else if (tabParam === 'brand' || window.location.hash === '#brands') {
        setActiveTab('brand');
      }

      const handleHashChange = () => {
        if (window.location.hash === '#creators') {
          setActiveTab('creator');
        } else if (window.location.hash === '#brands') {
          setActiveTab('brand');
        }
      };

      window.addEventListener('hashchange', handleHashChange);
      return () => window.removeEventListener('hashchange', handleHashChange);
    }
  }, []);

  const handleTabChange = (tab: 'brand' | 'creator') => {
    setActiveTab(tab);
    setOpenIdx(0);
  };

  const handleToggle = (idx: number) => {
    setOpenIdx((prev) => (prev === idx ? null : idx));
  };

  // CMS stores categories as "brands" / "creators"; German text comes from `translations.de` when set.
  const isGerman = currentLang === 'de';
  const allFaqs = faqs
    .filter((f) => f.category === (activeTab === 'brand' ? 'brands' : 'creators'))
    .sort((a, b) => a.order - b.order)
    .map((f) => ({
      id: f.id,
      q: (isGerman && f.translations?.de?.question) || f.question,
      a: (isGerman && f.translations?.de?.answer) || f.answer,
    }));
  const displayedFaqs = limit ? allFaqs.slice(0, limit) : allFaqs;

  return (
    <section
      id="faq"
      className={`py-16 sm:py-20 lg:py-28 ${
        isFullPage ? 'bg-[#FAFAF8]' : 'bg-white border-t border-[#E7E7E2]'
      } font-sans ${className}`}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto space-y-2.5 sm:space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAFAF8] border border-[#E7E7E2] text-[#66665E] text-[11px] sm:text-xs font-bold uppercase tracking-wider mb-1 sm:mb-2">
            <HelpCircle className="w-3.5 h-3.5 text-[#FF2D78]" />
            <span>Common Inquiries</span>
          </div>
          <h2 className="text-xl min-[360px]:text-2xl sm:text-4xl lg:text-[48px] font-black text-[#0A0A0A] tracking-tight leading-[1.15]">
            {t?.faq?.title || 'Frequently Asked Questions'}
          </h2>
          <p className="text-xs min-[360px]:text-sm sm:text-base lg:text-lg text-[#66665E] font-medium leading-relaxed sm:leading-[28px]">
            {t?.faq?.subtitle ||
              'Everything you need to know about booking creators, escrow protection, and deliverables.'}
          </p>

          {/* Interactive Dual Perspective Toggle */}
          <div className="pt-4 sm:pt-6 pb-2 flex justify-center">
            <div className="inline-flex p-1 rounded-full bg-white border border-[#E7E7E2] shadow-xs max-w-full">
              <button
                type="button"
                onClick={() => handleTabChange('brand')}
                className={`px-3.5 sm:px-7 py-2 sm:py-2.5 rounded-full font-bold text-xs sm:text-sm leading-[20px] transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'brand'
                    ? 'bg-[#0A0A0A] text-[#FAFAFA] shadow-sm'
                    : 'text-[#66665E] hover:text-[#0A0A0A]'
                }`}
              >
                For Brands
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('creator')}
                className={`px-3.5 sm:px-7 py-2 sm:py-2.5 rounded-full font-bold text-xs sm:text-sm leading-[20px] transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'creator'
                    ? 'bg-[#0A0A0A] text-[#FAFAFA] shadow-sm'
                    : 'text-[#66665E] hover:text-[#0A0A0A]'
                }`}
              >
                For Creators
              </button>
            </div>
          </div>
        </div>

        {displayedFaqs.length === 0 && (
          <p className="mt-10 text-center text-sm font-medium text-[#66665E]">No questions published yet.</p>
        )}

        {/* Accordion List - Original Desktop Divider Style with Responsive Mobile Spacing */}
        <div className="mt-8 sm:mt-12 divide-y divide-[#E7E7E2] border-t border-b border-[#E7E7E2]">
          {displayedFaqs.map((faq, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div key={faq.id} className="py-4 min-[380px]:py-5 sm:py-6 lg:py-8 transition-colors select-none">
                <button
                  type="button"
                  onClick={() => handleToggle(idx)}
                  className="w-full text-left flex items-center justify-between gap-3 sm:gap-6 group cursor-pointer focus:outline-none"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm min-[360px]:text-[15px] sm:text-lg lg:text-[20px] font-bold text-[#0A0A0A] group-hover:text-[#FF2D78] transition-colors leading-snug">
                    {faq.q}
                  </span>

                  <span
                    className={`w-7 h-7 min-[380px]:w-8 min-[380px]:h-8 sm:w-11 sm:h-11 rounded-full inline-flex items-center justify-center shrink-0 transition-all duration-300 ${
                      isOpen
                        ? 'bg-[#FF2D78] text-white shadow-md shadow-[#FF2D78]/25 rotate-180'
                        : 'bg-white border border-[#D2D2CA] text-[#0A0A0A] group-hover:border-[#FF2D78] group-hover:text-[#FF2D78] rotate-0'
                    }`}
                  >
                    <ChevronDown className="w-3.5 h-3.5 sm:w-5 sm:h-5 transition-transform duration-300" />
                  </span>
                </button>

                {isOpen && (
                  <div className="pt-2.5 pb-2 min-[380px]:pt-3 min-[380px]:pb-2.5 sm:pt-5 sm:pb-0 pr-3 min-[380px]:pr-5 sm:pr-12 text-xs min-[360px]:text-sm sm:text-[17px] text-[#555550] leading-relaxed sm:leading-[28px] font-medium transition-all duration-200 animate-fadeIn">
                    <p>{faq.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* View All FAQs Button (on Homepage & summary views) */}
        {showViewAll && (
          <div className="mt-8 sm:mt-16 text-center">
            <Button
              href={`/faq?tab=${activeTab}`}
              variant="secondary"
              size="lg"
              iconRight={<ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />}
              className="group font-bold px-8 shadow-xs border-[#E7E7E2] hover:border-[#0A0A0A] hover:bg-white inline-flex items-center gap-2"
            >
              View All FAQs
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
