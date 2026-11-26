'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { fill } from '@/lib/i18n/dictionary';
import { useAuth } from '@/lib/session/AuthProvider';
import type { Paginated } from '@/lib/api/types';
import type { CreatorCardData } from '@/lib/api/endpoints/public';
import { CreatorCard, CreatorListRow } from '@/components/shared/CreatorCard';
import { CreatorGridSkeleton } from '@/components/shared/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import {
  COUNTRY_OPTIONS,
  FOLLOWER_RANGE_LABELS,
  SORT_LABELS,
  useCreatorFilters,
} from '@/components/shared/useCreatorFilters';
import { countryName, labelize } from '@/components/shared/creatorFormat';
import {
  Search,
  RotateCcw,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  SlidersHorizontal,
} from 'lucide-react';
import { Pagination } from 'antd';
import { Button } from '@/components/ui';
import { CategoryIcon } from '@/components/shared/CategoryIcon';

function FilterField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-[#73736A]">
        {label}
      </span>
      <span className="relative block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full appearance-none rounded-xl border border-[#E7E7E2] bg-[#FAFAF8] pl-3 pr-8 text-sm font-semibold text-[#0A0A0A] outline-none"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#66665E]" />
      </span>
    </label>
  );
}

/** Small sidebar card with one action (guest sign-up pitch or a role shortcut). */
function SideCard({
  title,
  body,
  cta,
  href,
  primary = false,
}: {
  title: string;
  body: string;
  cta: string;
  href: string;
  primary?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#E7E7E2] bg-white p-5">
      <h4 className="text-base font-bold tracking-tight text-[#0A0A0A]">{title}</h4>
      <p className="mt-1.5 text-sm leading-relaxed text-[#66665E]">{body}</p>
      <Button href={href} size="md" variant={primary ? 'primary' : 'secondary'} fullWidth className="mt-4">
        {cta}
      </Button>
    </div>
  );
}

interface CreatorsViewProps {
  /** Results for the current URL filters (GET /creators), rendered on the server. null = request failed. */
  data: Paginated<CreatorCardData> | null;
  /** Category keys from GET /meta/options. */
  creatorCategories: string[];
  pageSize: number;
}

function CreatorsDiscoveryContent({ data, creatorCategories, pageSize }: CreatorsViewProps) {
  const router = useRouter();
  const { t, currentLang } = useLang();
  const tp = t.creatorsPage;
  const catLabel = (key: string) => t.categories[key] ?? labelize(key);
  const { status, activeRole } = useAuth();

  // Filters live in the URL; the server page filters, sorts and paginates (GET /creators) and
  // re-renders with new `data` whenever the URL changes.
  const { filters, setFilters, resetFilters, searchText, setSearchText, activeFilterCount, isPending } =
    useCreatorFilters(pageSize);
  const isFetching = isPending;
  const isError = data === null;
  const refetch = () => router.refresh();

  const results = data?.items ?? [];
  const total = data?.meta.total ?? 0;
  const currentPage = filters.page;

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const categoryRowRef = useRef<HTMLDivElement>(null);
  const [categoryEdges, setCategoryEdges] = useState({ left: false, right: true });

  const categoryOptions = [
    { value: 'all', label: tp.allCategories },
    ...creatorCategories.map((c) => ({ value: c, label: catLabel(c) })),
  ];
  const countryOptions = [
    { value: 'all', label: tp.allLocations },
    ...COUNTRY_OPTIONS.map((code) => ({ value: code, label: countryName(code, currentLang) })),
  ];
  const platformOptions = [
    { value: 'all', label: tp.allPlatforms },
    { value: 'instagram', label: 'Instagram' },
    { value: 'tiktok', label: 'TikTok' },
    { value: 'youtube', label: 'YouTube' },
  ];
  const followerOptions = [
    { value: 'all', label: tp.anyRange },
    ...Object.entries(FOLLOWER_RANGE_LABELS).map(([value, label]) => ({ value, label: t.followerRanges[value] ?? label })),
  ];
  const sortOptions = Object.entries(SORT_LABELS).map(([value, label]) => ({ value, label: t.sortOptions[value] ?? label }));

  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileFiltersOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileFiltersOpen]);

  const updateCategoryEdges = () => {
    const row = categoryRowRef.current;
    if (!row) return;
    setCategoryEdges({
      left: row.scrollLeft > 8,
      right: row.scrollLeft + row.clientWidth < row.scrollWidth - 8,
    });
  };

  useEffect(() => {
    const row = categoryRowRef.current;
    if (!row) return;
    updateCategoryEdges();
    row.addEventListener('scroll', updateCategoryEdges, { passive: true });
    window.addEventListener('resize', updateCategoryEdges);
    return () => {
      row.removeEventListener('scroll', updateCategoryEdges);
      window.removeEventListener('resize', updateCategoryEdges);
    };
  }, []);

  useEffect(() => {
    const row = categoryRowRef.current;
    if (!row) return;
    const selected = row.querySelector<HTMLElement>('[data-selected="true"]');
    if (!selected) return;
    const left = selected.offsetLeft - (row.clientWidth - selected.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [filters.category]);

  const nudgeCategories = (direction: 1 | -1) => {
    categoryRowRef.current?.scrollBy({ left: direction * 200, behavior: 'smooth' });
  };

  const categories = [
    { name: 'all', label: tp.allCreators, icon: <CategoryIcon name="all" size={16} /> },
    ...creatorCategories.map((key) => ({
      name: key,
      label: catLabel(key),
      icon: <CategoryIcon name={key} size={16} />,
    })),
  ];

  return (
    <div className="bg-[#FAFAF8] min-h-screen overflow-x-clip py-5 sm:py-10">
      <div className="max-w-7xl mx-auto min-w-0 px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-8">
        {/* Page header */}
        <div className="relative">
          <div className="max-w-4xl">
            <h1 className="text-[1.65rem] sm:text-4xl lg:text-[48px] font-extrabold text-[#0A0A0A] tracking-tight leading-[1.15] sm:leading-[1.15] font-sans">
              {tp.titleLead}{' '}
              <span className="font-editorial italic font-normal text-[#0A0A0A]">
                {tp.titleAccent}
              </span>
            </h1>
            <p className="text-sm sm:text-[18px] text-[#555550] font-sans font-medium leading-5 sm:leading-[28px] mt-2 sm:mt-3 max-w-none">
              {t.discovery.subtitle}
            </p>
          </div>
        </div>

        {/* Compact search + filter sheet. Desktop keeps the full bar below. */}
        <div className="lg:hidden">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1 font-sans">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#66665E]" />
              <input
                type="text"
                placeholder={t.discovery.searchPlaceholder}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="h-10 w-full rounded-xl border-none bg-[#F4F4F0] pl-9 pr-3 text-sm font-medium text-[#0A0A0A] outline-none placeholder:text-[#A3A39C]"
              />
            </div>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[#E7E7E2] bg-white px-3 text-xs font-bold text-[#0A0A0A]"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {tp.filters}
              {activeFilterCount > 0 && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#0A0A0A] px-1 text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {mobileFiltersOpen && (
          <div className="fixed inset-0 z-[70] !mt-0 lg:hidden">
            <button
              type="button"
              aria-label={tp.closeFilters}
              className="absolute inset-0 bg-[#0A0A0A]/40"
              onClick={() => setMobileFiltersOpen(false)}
            />
            <div className="absolute inset-x-0 bottom-0 max-h-[min(85dvh,640px)] overflow-y-auto rounded-t-3xl bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#E7E7E2]" />
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-[#0A0A0A]">{tp.filters}</h2>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs font-bold text-[#66665E]"
                >
                  {tp.reset}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FilterField label={tp.category} value={filters.category} onChange={(category) => setFilters({ category })} options={categoryOptions} />
                <FilterField label={tp.location} value={filters.country} onChange={(country) => setFilters({ country })} options={countryOptions} />
                <FilterField label={tp.platform} value={filters.platform} onChange={(platform) => setFilters({ platform })} options={platformOptions} />
                <FilterField
                  label={tp.followers}
                  value={filters.followerRange}
                  onChange={(followerRange) => setFilters({ followerRange })}
                  options={followerOptions}
                />
                <FilterField
                  label={tp.sort}
                  value={filters.sort}
                  onChange={(sort) => setFilters({ sort: sort as typeof filters.sort })}
                  options={sortOptions}
                />
              </div>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="mt-5 flex h-11 w-full items-center justify-center rounded-full bg-[#0A0A0A] text-sm font-bold text-white"
              >
                {fill(tp.showCreators, { count: total.toLocaleString(currentLang) })}
              </button>
            </div>
          </div>
        )}

        {/* Desktop filter bar */}
        <div className="hidden lg:flex bg-white p-3 rounded-2xl border border-[#E7E7E2] items-center gap-3">
          {/* Omni Search Input */}
          <div className="w-full lg:flex-1 lg:min-w-[220px] relative font-sans">
            <Search className="w-4 h-4 text-[#66665E] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={t.discovery.searchPlaceholder}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm font-medium text-[#0A0A0A] bg-[#F4F4F0] rounded-xl outline-none focus:outline-none focus:ring-0 focus-visible:outline-none border-none placeholder:text-[#A3A39C]"
            />
          </div>

          {/* Responsive Dropdowns Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:items-center gap-2 sm:gap-2.5 w-full lg:w-auto">
            {/* All Categories Dropdown */}
            <div className="w-full lg:min-w-[145px] font-sans relative">
              <select
                value={filters.category}
                onChange={(e) => setFilters({ category: e.target.value })}
                className="w-full pl-3 pr-7 py-2.5 text-xs sm:text-sm font-bold text-[#0A0A0A] bg-[#FAFAF8] border border-[#E7E7E2] rounded-xl outline-none cursor-pointer appearance-none truncate"
              >
                {categoryOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#66665E] pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
            </div>

            {/* Locations Dropdown */}
            <div className="w-full lg:min-w-[135px] font-sans relative">
              <select
                value={filters.country}
                onChange={(e) => setFilters({ country: e.target.value })}
                className="w-full pl-3 pr-7 py-2.5 text-xs sm:text-sm font-bold text-[#0A0A0A] bg-[#FAFAF8] border border-[#E7E7E2] rounded-xl outline-none cursor-pointer appearance-none truncate"
              >
                {countryOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#66665E] pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
            </div>

            {/* Platforms Dropdown */}
            <div className="w-full lg:min-w-[130px] font-sans relative">
              <select
                value={filters.platform}
                onChange={(e) => setFilters({ platform: e.target.value })}
                className="w-full pl-3 pr-7 py-2.5 text-xs sm:text-sm font-bold text-[#0A0A0A] bg-[#FAFAF8] border border-[#E7E7E2] rounded-xl outline-none cursor-pointer appearance-none truncate"
              >
                {platformOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#66665E] pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
            </div>

            {/* Follower Range Dropdown */}
            <div className="w-full lg:min-w-[140px] font-sans relative">
              <select
                value={filters.followerRange}
                onChange={(e) => setFilters({ followerRange: e.target.value })}
                className="w-full pl-3 pr-7 py-2.5 text-xs sm:text-sm font-bold text-[#0A0A0A] bg-[#FAFAF8] border border-[#E7E7E2] rounded-xl outline-none cursor-pointer appearance-none truncate"
              >
                {[{ value: 'all', label: tp.followerRange }, ...followerOptions.slice(1)].map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#66665E] pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
            </div>

            {/* Sort By Dropdown */}
            <div className="w-full lg:min-w-[140px] font-sans relative">
              <select
                value={filters.sort}
                onChange={(e) => setFilters({ sort: e.target.value as typeof filters.sort })}
                className="w-full pl-3 pr-7 py-2.5 text-xs sm:text-sm font-bold text-[#0A0A0A] bg-[#FAFAF8] border border-[#E7E7E2] rounded-xl outline-none cursor-pointer appearance-none truncate"
              >
                {sortOptions.map((o) => (o.value === 'relevance' ? { ...o, label: `${tp.sortPrefix}: ${o.label}` } : o)).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#66665E] pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
            </div>

            {/* Reset Filters Button */}
            <button
              onClick={resetFilters}
              className="w-full lg:w-auto h-10 px-3 rounded-xl border border-[#E7E7E2] hover:bg-[#F4F4F0] text-[#66665E] hover:text-[#0A0A0A] transition-colors flex items-center justify-center gap-1.5 font-bold text-xs"
              title={tp.resetFilters}
              aria-label={tp.resetFilters}
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span className="lg:hidden">{tp.reset}</span>
            </button>
          </div>
        </div>

        {/* Category navigation scrolls on its own. It must not widen the page. */}
        <div className="relative min-w-0 px-8 lg:hidden">
          {categoryEdges.left && (
            <button
              type="button"
              aria-label={tp.prevCategories}
              onClick={() => nudgeCategories(-1)}
              className="absolute left-0 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-[#E7E7E2] bg-white text-[#0A0A0A] shadow-sm"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <div
            ref={categoryRowRef}
            className="flex w-full min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain no-scrollbar py-0.5"
            role="tablist"
            aria-label={tp.categoriesHeading}
          >
            {categories.map((cat) => {
              const isSelected = filters.category === cat.name;
              const shortLabel = cat.name === 'all' ? tp.all : cat.label.split('&')[0].trim();
              return (
                <button
                  key={cat.name}
                  type="button"
                  role="tab"
                  data-selected={isSelected}
                  aria-selected={isSelected}
                  onClick={() => setFilters({ category: cat.name })}
                  className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold ${
                    isSelected
                      ? 'bg-[#0A0A0A] text-white'
                      : 'border border-[#E7E7E2] bg-white text-[#555550]'
                  }`}
                >
                  <span className={`[&_svg]:h-3.5 [&_svg]:w-3.5 ${isSelected ? 'text-white' : 'text-[#0A0A0A]'}`}>
                    {cat.icon}
                  </span>
                  <span>{shortLabel}</span>
                </button>
              );
            })}
          </div>
          {categoryEdges.right && (
            <>
              <div className="pointer-events-none absolute inset-y-0 right-8 w-8 bg-gradient-to-l from-[#FAFAF8] to-transparent" />
              <button
                type="button"
                aria-label={tp.moreCategories}
                onClick={() => nudgeCategories(1)}
                className="absolute right-0 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-[#E7E7E2] bg-white text-[#0A0A0A] shadow-sm"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
          {categoryEdges.left && (
            <div className="pointer-events-none absolute inset-y-0 left-8 w-8 bg-gradient-to-r from-[#FAFAF8] to-transparent" />
          )}
        </div>

        {/* Main Split Grid: Left Category Sidebar + Right Creator Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left sidebar - desktop only */}
          <aside className="hidden font-sans lg:sticky lg:top-24 lg:col-span-3 lg:block lg:self-start space-y-4">
            {/* Category list: plain icons in the text colour, one quiet selected state. */}
            <nav aria-label={tp.categoriesHeading} className="rounded-2xl border border-[#E7E7E2] bg-white p-2">
              <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A8A82]">
                {tp.categoriesHeading}
              </p>
              <ul className="space-y-0.5">
                {categories.map((cat) => {
                  const isSelected = filters.category === cat.name;
                  return (
                    <li key={cat.name}>
                      <button
                        type="button"
                        aria-current={isSelected ? 'true' : undefined}
                        onClick={() => setFilters({ category: cat.name })}
                        className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                          isSelected
                            ? 'bg-[#F4F4F0] font-semibold text-[#0A0A0A]'
                            : 'font-medium text-[#555550] hover:bg-[#FAFAF8] hover:text-[#0A0A0A]'
                        }`}
                      >
                        <span className={`shrink-0 [&_svg]:h-4 [&_svg]:w-4 ${isSelected ? 'text-[#0A0A0A]' : 'text-[#8A8A82]'}`}>
                          {cat.icon}
                        </span>
                        <span className="truncate">{cat.label}</span>
                        {isSelected && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF2D78]" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* The side card depends on who is looking: guests get the creator sign-up pitch, logged-in
                users get a shortcut for their role. Nothing renders while the session is still loading. */}
            {status === 'guest' && (
              <SideCard title={tp.guestTitle} body={tp.guestBody} cta={tp.guestCta} href="/register" primary />
            )}
            {status === 'authenticated' && activeRole === 'brand' && (
              <SideCard title={tp.brandTitle} body={tp.brandBody} cta={tp.brandCta} href="/brand/saved" />
            )}
            {status === 'authenticated' && activeRole === 'creator' && (
              <SideCard title={tp.creatorTitle} body={tp.creatorBody} cta={tp.creatorCta} href="/creator/profile" />
            )}
          </aside>

          {/* Right Main Area (75% width) */}
          <div className="lg:col-span-9 space-y-6">
            {/* Results Header with Count & Grid/List switcher */}
            <div className="flex items-center justify-between font-sans">
              <div>
                <span className="text-lg font-bold tracking-tight tabular-nums text-[#0A0A0A] sm:text-xl">
                  {total.toLocaleString(currentLang)} {total === 1 ? tp.creatorOne : tp.creatorMany}
                </span>
                {total > pageSize && (
                  <span className="ml-2.5 hidden text-sm font-medium tabular-nums text-[#66665E] sm:inline">
                    {fill(tp.shown, {
                      from: (currentPage - 1) * pageSize + 1,
                      to: (currentPage - 1) * pageSize + results.length,
                    })}
                  </span>
                )}
              </div>

              {/* Layout Switcher (Grid vs List) */}
              <div className="flex items-center rounded-xl border border-[#E7E7E2] bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-[#F4F4F0] text-[#0A0A0A]'
                      : 'text-[#8A8A82] hover:text-[#0A0A0A]'
                  }`}
                  title={tp.gridView}
                  aria-label={tp.gridView}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-[#F4F4F0] text-[#0A0A0A]'
                      : 'text-[#8A8A82] hover:text-[#0A0A0A]'
                  }`}
                  title={tp.listView}
                  aria-label={tp.listView}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Creator Cards Grid or List */}
            {isFetching && !data ? (
              <CreatorGridSkeleton count={6} />
            ) : isError ? (
              <EmptyState
                color="pink"
                showIcon={false}
                title={tp.errorTitle}
                description={tp.errorBody}
                primaryAction={{ label: tp.tryAgain, onClick: () => void refetch() }}
                variant="card"
              />
            ) : results.length > 0 ? (
              viewMode === 'grid' ? (
                <div className={`grid grid-cols-2 gap-3.5 sm:gap-5 md:grid-cols-3 lg:gap-7 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
                  {results.map((creator) => (
                    <CreatorCard key={creator.id} creator={creator} />
                  ))}
                </div>
              ) : (
                <div className="space-y-2.5 sm:space-y-4">
                  {results.map((creator) => (
                    <CreatorListRow key={creator.id} creator={creator} />
                  ))}
                </div>
              )
            ) : (
              <EmptyState
                color="pink"
                showIcon={false}
                title={tp.emptyTitle}
                description={tp.emptyBody}
                primaryAction={{
                  label: tp.resetAll,
                  onClick: resetFilters,
                }}
                variant="card"
              />
            )}

            {/* Pagination */}
            {total > pageSize && (
              <div className="flex justify-center pt-8">
                <Pagination
                  current={currentPage}
                  total={total}
                  pageSize={pageSize}
                  onChange={(page) => {
                    setFilters({ page });
                    window.scrollTo({ top: 200, behavior: 'smooth' });
                  }}
                  showSizeChanger={false}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** /creators UI. Data comes from the server page (props); filters/pagination change the URL. */
export function CreatorsView(props: CreatorsViewProps) {
  return (
    <Suspense
      fallback={
        <div className="bg-[#FAFAF8] min-h-screen py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <CreatorGridSkeleton count={6} />
          </div>
        </div>
      }
    >
      <CreatorsDiscoveryContent {...props} />
    </Suspense>
  );
}
