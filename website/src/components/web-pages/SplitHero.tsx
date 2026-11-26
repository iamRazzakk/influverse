'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { http } from '@/lib/api/client';
import { publicEndpoints } from '@/lib/api/endpoints/public';
import { useRequest } from '@/lib/hooks/useRequest';
import { useDebouncedValue } from '@/components/shared/useDebouncedValue';
import { avatarFallback, labelize } from '@/components/shared/creatorFormat';
import {
  Search,
  Instagram,
  Youtube,
  Check,
  ArrowRight,
  ChevronDown,
  Globe,
  Star,
} from 'lucide-react';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { InstagramLogo, TikTokLogo, YouTubeLogo } from '@/components/shared/SocialLogos';
import { CategoryIcon } from '@/components/shared/CategoryIcon';
import { RemoteImage } from '@/components/shared/RemoteImage';

/**
 * Hero copy can be edited in the dashboard CMS (`/cms/site`); the home page passes it in, together with
 * the creator categories (GET /meta/options, loaded on the server).
 */
export function SplitHero({
  headline,
  subtitle,
  categories = [],
}: { headline?: string; subtitle?: string; categories?: string[] } = {}) {
  const router = useRouter();
  const { t } = useLang();
  const [platform, setPlatform] = useState<string>('all');
  const [category, setCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [isPlatformOpen, setIsPlatformOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const platformDropdownRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLDivElement>(null);

  // Typeahead from GET /creators/suggest (top 4 by handle / name prefix), debounced.
  const debouncedQuery = useDebouncedValue(searchQuery.trim(), 250);
  const { data: liveSuggestions = [] } = useRequest(
    (signal) => publicEndpoints(http).suggestCreators(debouncedQuery, signal),
    [debouncedQuery],
    { skip: debouncedQuery.length < 1 },
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (platformDropdownRef.current && !platformDropdownRef.current.contains(event.target as Node)) {
        setIsPlatformOpen(false);
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryOpen(false);
      }
      if (searchInputRef.current && !searchInputRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setShowSuggestions(false);
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (platform !== 'all') params.set('platform', platform);
    if (category !== 'all') params.set('category', category);
    router.push(`/search?${params.toString()}`);
  };

  const platformOptions = [
    {
      value: 'all',
      label: 'All Platforms',
      icon: (
        <span className="w-5 h-5 rounded-full bg-[#0A0A0A] flex items-center justify-center text-white shrink-0 shadow-2xs">
          <Globe className="w-3 h-3 text-white" />
        </span>
      ),
    },
    {
      value: 'instagram',
      label: 'Instagram',
      icon: (
        <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] flex items-center justify-center text-white shrink-0 shadow-2xs">
          <Instagram className="w-3 h-3" />
        </span>
      ),
    },
    {
      value: 'tiktok',
      label: 'TikTok',
      icon: <TikTokLogo circle className="w-5 h-5 shrink-0 shadow-2xs" />,
    },
    {
      value: 'youtube',
      label: 'YouTube',
      icon: (
        <span className="w-5 h-5 rounded-full bg-[#FF0000] flex items-center justify-center text-white shrink-0 shadow-2xs">
          <Youtube className="w-3 h-3" />
        </span>
      ),
    },
  ];

  const categoryOptions = useMemo(
    () => [
      { value: 'all', label: 'All Categories' },
      ...categories.map((c) => ({ value: c, label: labelize(c) })),
    ],
    [categories],
  );

  const renderPlatformIcon = () => {
    if (platform === 'instagram') {
      return (
        <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] flex items-center justify-center text-white mr-2 shrink-0 shadow-2xs">
          <Instagram className="w-3 h-3" />
        </span>
      );
    }
    if (platform === 'tiktok') {
      return (
        <span className="w-5 h-5 rounded-full bg-[#000000] flex items-center justify-center text-white mr-2 shrink-0 shadow-2xs">
          <svg className="w-2.5 h-2.5 fill-white" viewBox="0 0 24 24">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" />
          </svg>
        </span>
      );
    }
    if (platform === 'youtube') {
      return (
        <span className="w-5 h-5 rounded-full bg-[#FF0000] flex items-center justify-center text-white mr-2 shrink-0 shadow-2xs">
          <Youtube className="w-3 h-3" />
        </span>
      );
    }
    if (platform === 'ugc') {
      return (
        <span className="w-5 h-5 rounded-full bg-[#FF2D78] flex items-center justify-center text-white mr-2 shrink-0 shadow-2xs">
          <CategoryIcon name="ugc" size={13} className="text-white" />
        </span>
      );
    }
    return (
      <span className="w-5 h-5 rounded-full bg-[#0A0A0A] flex items-center justify-center text-white mr-2 shrink-0 shadow-2xs">
        <Globe className="w-3 h-3 text-white" />
      </span>
    );
  };

  return (
    <section className="relative overflow-hidden flex-1 flex items-center py-8 sm:py-10 lg:py-12 bg-[#FAFAF8] w-full">
      {/* Dynamic Ambient Background Glows */}
      <div className="absolute top-10 right-1/4 w-[600px] h-[600px] bg-gradient-to-tr from-[#FFF0F5]/60 to-[#FFE4EC]/60 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute -bottom-10 left-10 w-[500px] h-[500px] bg-gradient-to-br from-[#EEF7F2]/50 to-[#FAF6E8]/50 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-w-0 w-full">
        <div className="grid w-full min-w-0 max-w-full grid-cols-1 items-center gap-8 overflow-hidden lg:grid-cols-12 lg:overflow-visible">
          {/* Left Column: Typography & Search */}
          <div className="lg:col-span-7 xl:col-span-7 min-w-0">
            {/* Headline pairing Red Hat Display with Playfair Display Italic Accent */}
            <h1 className="text-[26px] min-[360px]:text-[30px] min-[420px]:text-4xl sm:text-5xl lg:text-[62px] font-black text-[#0A0A0A] tracking-tight leading-[1.15] sm:leading-[1.12] font-sans mb-3 sm:mb-5">
              {headline ? (
                headline
              ) : (
                <>
                  The right creators{' '}
                  <span className="font-editorial italic font-normal text-[#0A0A0A] block sm:inline">
                    for your brand.
                  </span>
                </>
              )}
            </h1>

            {/* Subtitle */}
            <p className="mb-6 max-w-full text-[15px] font-medium leading-[24px] text-[#555550] sm:mb-8 sm:text-[18px] sm:leading-[28px] lg:max-w-lg">
              {subtitle || t?.hero?.subtitle ||
                'Discover, collaborate and grow with verified creators across all platforms — in one place.'}
            </p>

            {/* Search Pill Bar - Responsive Mobile/Tablet Two-Tier & Desktop Unified Pill */}
            <div className="bg-white p-2 rounded-2xl lg:rounded-full border border-[#E7E7E2] shadow-lg shadow-black/[0.04] w-full max-w-2xl xl:max-w-3xl transition-all focus-within:border-[#0A0A0A] relative z-30 mb-6 lg:mb-8">
              <form onSubmit={handleSearch} className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2 lg:gap-0">
                {/* 1. Keyword / Name Text Search Input */}
                <div ref={searchInputRef} className="flex-1 flex items-center pl-3.5 pr-2 py-1.5 w-full min-w-0 lg:min-w-[160px] relative">
                  <Search className="w-4 h-4 text-[#66665E] mr-2.5 shrink-0" />
                  <input
                    type="text"
                    placeholder={t?.hero?.searchPlaceholder || 'Search creators...'}
                    value={searchQuery}
                    onFocus={() => {
                      if (searchQuery.trim()) setShowSuggestions(true);
                    }}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSuggestions(true);
                    }}
                    className="w-full bg-transparent text-sm font-semibold text-[#0A0A0A] placeholder:text-[#A3A39C] outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 border-none shadow-none font-sans"
                  />

                  {/* Submit Search Button (Mobile & Tablet Inline) */}
                  <button
                    type="submit"
                    className="lg:hidden btn-base btn-icon-sm btn-pink rounded-xl shrink-0 shadow-xs ml-1.5"
                    aria-label="Search Creators"
                  >
                    <Search className="w-4 h-4 stroke-[2.5]" />
                  </button>

                  {/* Live Suggestions Dropdown */}
                  {showSuggestions && searchQuery.trim().length > 0 && (
                    <div className="absolute top-full left-0 mt-3 w-[calc(100vw-2.5rem)] max-w-[380px] lg:w-[420px] bg-white rounded-2xl border border-[#E7E7E2] shadow-2xl p-3 z-50 animate-in fade-in-0 zoom-in-95 duration-150">
                      <div className="flex items-center justify-between pb-2 border-b border-[#F4F4F0] px-1 text-xs font-bold uppercase tracking-wider text-[#66665E]">
                        <span>Suggested Creators</span>
                        <span className="text-[#FF2D78]">Press Enter to search</span>
                      </div>

                      {liveSuggestions.length > 0 ? (
                        <div className="space-y-1 pt-1.5">
                          {liveSuggestions.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setShowSuggestions(false);
                                router.push(`/creators/${c.handle || c.id}`);
                              }}
                              className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-[#FAFAF8] transition-colors group cursor-pointer text-left"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <RemoteImage
                                  src={c.avatar || avatarFallback(c.name)}
                                  alt={c.name ?? ''}
                                  className="w-9 h-9 rounded-full object-cover border border-[#E7E7E2] shrink-0" width={72} height={72} sizes="36px" />
                                <div className="min-w-0">
                                  <div className="text-xs font-black text-[#0A0A0A] flex items-center gap-1 group-hover:text-[#FF2D78] transition-colors">
                                    <span className="truncate">{c.name}</span>
                                    {c.verified && <VerifiedBadge size="sm" />}
                                  </div>
                                  <div className="text-sm text-[#66665E] truncate">
                                    @{c.handle}{c.category ? ` • ${labelize(c.category)}` : ''}
                                  </div>
                                </div>
                              </div>
                            </button>
                          ))}

                          <button
                            type="button"
                            onClick={() => handleSearch()}
                            className="w-full mt-2 pt-2 border-t border-[#F4F4F0] text-center text-xs font-extrabold text-[#0A0A0A] hover:text-[#FF2D78] flex items-center justify-center gap-1 cursor-pointer py-1"
                          >
                            <span>Explore all results for &ldquo;{searchQuery}&rdquo;</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="py-4 text-center text-sm text-[#66665E] space-y-2">
                          <p>No creators directly matching &ldquo;{searchQuery}&rdquo;</p>
                          <button
                            type="button"
                            onClick={() => handleSearch()}
                            className="text-[#FF2D78] font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>Search full marketplace catalog</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Filter Controls: 2-col on mobile/tablet, inline on desktop */}
                <div className="grid grid-cols-2 gap-1.5 pt-1.5 lg:pt-0 border-t border-[#F4F4F0] lg:border-t-0 lg:flex lg:items-center w-full lg:w-auto">
                  {/* Divider Line (Desktop only) */}
                  <div className="hidden lg:block w-px h-6 bg-[#E7E7E2] shrink-0 mx-1" />

                  {/* 2. Platform Selector */}
                  <div ref={platformDropdownRef} className="relative shrink-0 lg:min-w-[130px] w-full lg:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setIsPlatformOpen(!isPlatformOpen);
                        setIsCategoryOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl lg:rounded-full bg-[#FAFAF8] lg:bg-transparent hover:bg-[#F4F4F0] transition-colors cursor-pointer text-left border lg:border-0 border-[#E7E7E2]"
                    >
                      <div className="flex items-center min-w-0 mr-1">
                        {renderPlatformIcon()}
                        <span className="text-xs sm:text-sm font-extrabold text-[#0A0A0A] font-sans truncate">
                          {platformOptions.find((p) => p.value === platform)?.label || 'All'}
                        </span>
                      </div>
                      <ChevronDown
                        className={`w-3.5 h-3.5 lg:w-4 lg:h-4 text-[#66665E] transition-transform duration-200 shrink-0 ${
                          isPlatformOpen ? 'rotate-180 text-[#0A0A0A]' : ''
                        }`}
                      />
                    </button>

                    {/* Custom Floating Dropdown Menu with Clean Gap */}
                    {isPlatformOpen && (
                      <div className="absolute top-full left-0 mt-2 sm:mt-3 w-52 sm:w-56 max-w-[calc(100vw-32px)] bg-white rounded-2xl border border-[#E7E7E2] shadow-2xl p-2 z-50 animate-in fade-in-0 zoom-in-95 duration-150">
                        <div className="space-y-1">
                          {platformOptions.map((opt) => {
                            const isSelected = platform === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                  setPlatform(opt.value);
                                  setIsPlatformOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all text-left cursor-pointer ${
                                  isSelected
                                    ? 'bg-[#0A0A0A] text-white shadow-xs'
                                    : 'text-[#0A0A0A] hover:bg-[#F4F4F0]'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  {opt.icon}
                                  <span>{opt.label}</span>
                                </div>
                                {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Divider Line (Desktop only) */}
                  <div className="hidden lg:block w-px h-6 bg-[#E7E7E2] shrink-0 mx-1" />

                  {/* 3. Categories Selector */}
                  <div ref={categoryDropdownRef} className="relative shrink-0 lg:min-w-[140px] w-full lg:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCategoryOpen(!isCategoryOpen);
                        setIsPlatformOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl lg:rounded-full bg-[#FAFAF8] lg:bg-transparent hover:bg-[#F4F4F0] transition-colors cursor-pointer text-left border lg:border-0 border-[#E7E7E2]"
                    >
                      <div className="flex items-center min-w-0 mr-1">
                        <span className="text-[#A3A39C] mr-1.5 text-xs font-black shrink-0 font-mono">::</span>
                        <span className="text-xs sm:text-sm font-extrabold text-[#0A0A0A] font-sans truncate">
                          {categoryOptions.find((c) => c.value === category)?.label || 'Categories'}
                        </span>
                      </div>
                      <ChevronDown
                        className={`w-3.5 h-3.5 lg:w-4 lg:h-4 text-[#66665E] transition-transform duration-200 shrink-0 ${
                          isCategoryOpen ? 'rotate-180 text-[#0A0A0A]' : ''
                        }`}
                      />
                    </button>

                    {/* Custom Floating Dropdown Menu with Clean Gap */}
                    {isCategoryOpen && (
                      <div className="absolute top-full right-0 lg:left-auto lg:right-0 mt-2 sm:mt-3 w-56 sm:w-64 max-w-[calc(100vw-32px)] bg-white rounded-2xl border border-[#E7E7E2] shadow-2xl p-2 z-50 animate-in fade-in-0 zoom-in-95 duration-150 max-h-72 overflow-y-auto">
                        <div className="space-y-1">
                          {categoryOptions.map((opt) => {
                            const isSelected = category === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                  setCategory(opt.value);
                                  setIsCategoryOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all text-left cursor-pointer ${
                                  isSelected
                                    ? 'bg-[#0A0A0A] text-white shadow-xs'
                                    : 'text-[#0A0A0A] hover:bg-[#F4F4F0]'
                                }`}
                              >
                                <span>{opt.label}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 4. Submit Search Button (Desktop only) */}
                  <div className="hidden lg:block">
                    <button
                      type="submit"
                      className="btn-base btn-icon-md btn-pink w-10 h-10 rounded-full shrink-0 shadow-sm ml-1"
                      aria-label="Search Creators"
                    >
                      <Search className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  </div>
                </div>

              </form>
            </div>

            {/* Social Trust Metrics with Avatar Stack */}
            <div className="flex items-center gap-3 sm:gap-4 pt-1">
              <div className="flex -space-x-2 overflow-hidden shrink-0">
                <RemoteImage
                  className="inline-block h-8 w-8 sm:h-11 sm:w-11 rounded-full ring-2 ring-white object-cover shadow-xs"
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100"
                  alt="Creator" width={88} height={88} sizes="44px" />
                <RemoteImage
                  className="inline-block h-8 w-8 sm:h-11 sm:w-11 rounded-full ring-2 ring-white object-cover shadow-xs"
                  src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100"
                  alt="Creator" width={88} height={88} sizes="44px" />
                <RemoteImage
                  className="inline-block h-8 w-8 sm:h-11 sm:w-11 rounded-full ring-2 ring-white object-cover shadow-xs"
                  src="https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100"
                  alt="Creator" width={88} height={88} sizes="44px" />
                <div className="h-8 w-8 sm:h-11 sm:w-11 rounded-full bg-[#0A0A0A] text-white text-[11px] sm:text-[13px] font-black flex items-center justify-center ring-2 ring-white shadow-xs font-sans">
                  +12k
                </div>
              </div>

              <div className="flex flex-col justify-center">
                <div className="flex flex-wrap items-center gap-1.5 text-xs sm:text-base font-bold text-[#0A0A0A] font-sans">
                  <div className="flex items-center gap-0.5 text-amber-400">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <span className="text-[#0A0A0A] font-black ml-0.5">4.9/5</span>
                  <span className="text-[#66665E] font-medium text-[11px] sm:text-sm">· 3,400+ reviews</span>
                </div>
                <p className="text-[11px] sm:text-sm font-medium text-[#66665E] font-sans mt-0.5">
                  Trusted by brands across 45+ countries worldwide.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Dynamic Floating Creator Stack Cards on Desktop (Hidden on Mobile for spacious clean layout) */}
          <div className="hidden lg:block lg:col-span-5 xl:col-span-5 relative min-w-0">
            {/* Ambient Back Glow */}
            <div className="absolute inset-0 max-w-sm mx-auto bg-gradient-to-tr from-[#FF2D78]/15 to-[#F1EEF9]/20 rounded-full blur-3xl pointer-events-none" />

            {/* Desktop Stacked Cards Group with Depth & Rotation (Hidden on Mobile) */}
            <div className="hidden lg:flex relative h-[440px] items-center justify-center">
              <div className="relative w-full max-w-[480px] h-[400px]">
                {/* Demo Card 1: Sophie Kim (Leftmost Tilted) */}
                <div
                  className="absolute left-0 top-10 w-[210px] bg-white rounded-3xl p-3.5 border border-[#E7E7E2] shadow-xl transform -rotate-6 z-10 select-none pointer-events-none"
                >
                  <div className="relative h-56 rounded-2xl overflow-hidden bg-[#F4F4F0] mb-3">
                    <RemoteImage
                      src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600"
                      alt="Sophie Kim"
                      className="w-full h-full object-cover" width={800} height={800} sizes="(min-width: 1024px) 50vw, 100vw" priority />
                    <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white text-xs font-black">
                      €500
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <div>
                      <div className="font-extrabold text-sm text-[#0A0A0A] font-sans flex items-center gap-1.5">
                        <span>Sophie Kim</span>
                        <VerifiedBadge size="sm" />
                      </div>
                      <div className="text-sm text-[#66665E] font-sans font-medium">1.2M followers</div>
                    </div>
                    <InstagramLogo circle className="w-7 h-7 shrink-0 shadow-xs" />
                  </div>
                </div>

                {/* Demo Card 2: Liam Carter (Center Prominent) */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 top-0 w-[230px] bg-white rounded-3xl p-4 border border-[#E7E7E2] shadow-2xl z-20 select-none pointer-events-none"
                >
                  <div className="relative h-64 rounded-2xl overflow-hidden bg-[#F4F4F0] mb-3">
                    <RemoteImage
                      src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600"
                      alt="Liam Carter"
                      className="w-full h-full object-cover" width={800} height={800} sizes="(min-width: 1024px) 50vw, 100vw" priority />
                    <div className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full bg-[#FF2D78] text-white text-xs font-black shadow-xs">
                      Top Rated
                    </div>
                    <div className="absolute bottom-3 left-3 right-3 bg-black/60 backdrop-blur-md rounded-xl p-2 text-white">
                      <div className="text-xs font-black">Cinematic 4K Adventure</div>
                      <div className="text-xs text-[#D2D2CA]">From €550</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <div>
                      <div className="font-extrabold text-sm text-[#0A0A0A] font-sans flex items-center gap-1.5">
                        <span>Liam Carter</span>
                        <VerifiedBadge size="sm" />
                      </div>
                      <div className="text-sm text-[#66665E] font-sans font-medium">980K followers</div>
                    </div>
                    <TikTokLogo circle className="w-7 h-7 shrink-0 shadow-xs" />
                  </div>
                </div>

                {/* Demo Card 3: Emma Rossi (Rightmost Tilted) */}
                <div
                  className="absolute right-0 top-14 w-[200px] bg-white rounded-3xl p-3.5 border border-[#E7E7E2] shadow-xl transform rotate-12 z-5 select-none pointer-events-none"
                >
                  <div className="relative h-50 rounded-2xl overflow-hidden bg-[#F4F4F0] mb-3">
                    <RemoteImage
                      src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600"
                      alt="Emma Rossi"
                      className="w-full h-full object-cover" width={800} height={800} sizes="(min-width: 1024px) 50vw, 100vw" priority />
                    <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white text-xs font-black">
                      €420
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <div>
                      <div className="font-extrabold text-sm text-[#0A0A0A] font-sans flex items-center gap-1.5">
                        <span>Emma Rossi</span>
                        <VerifiedBadge size="sm" />
                      </div>
                      <div className="text-sm text-[#66665E] font-sans font-medium">850K followers</div>
                    </div>
                    <YouTubeLogo circle className="w-7 h-7 shrink-0 shadow-xs" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
