'use client';

import React, { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { OrderStats } from '@/lib/api/endpoints/orders';
import {
  DollarSign,
  Building2,
  ChevronDown,
} from 'lucide-react';

interface MonthlyCreatorRecord {
  month: string;
  fullName: string;
  incomeEur: number;
  brandsCount: number;
  brands: string[];
  isCurrent?: boolean;
}

interface YearCreatorData {
  year: number;
  totalIncomeEur: number;
  totalBrandsCount: number;
  growthRatePct: number;
  brandsGrowthRatePct: number;
  peakMonth: string;
  months: MonthlyCreatorRecord[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const THIS_YEAR = new Date().getFullYear();

/**
 * Server stats (GET /orders/stats) → chart records. Income = what was released from escrow to the
 * creator in that month (order approved); "brands" = distinct brands worked with that month.
 */
const toYearData = (year: number, stats?: OrderStats | null): YearCreatorData => {
  const months = MONTHS.map((name, idx) => {
    const row = stats?.months.find((m) => m.month === idx + 1);
    return {
      month: name.slice(0, 3),
      fullName: `${name} ${year}`,
      incomeEur: Math.round((row?.amountCents ?? 0) / 100),
      brandsCount: row?.count ?? 0,
      brands: row?.names ?? [],
      isCurrent: year === THIS_YEAR && idx === new Date().getMonth(),
    };
  });
  const peak = months.reduce((best, m) => (m.incomeEur > best.incomeEur ? m : best), months[0]);
  return {
    year,
    totalIncomeEur: Math.round((stats?.yearTotalCents ?? 0) / 100),
    totalBrandsCount: stats?.yearCounterpartsCount ?? 0,
    growthRatePct: 0,
    brandsGrowthRatePct: 0,
    peakMonth: peak.incomeEur > 0 ? peak.fullName.split(' ')[0] : '—',
    months,
  };
};

/**
 * `stats` is loaded by the server page for `selectedYear`. Changing the year updates `?year=` in the
 * URL, so the server re-renders with that year's stats.
 */
export function CreatorAnnualAnalytics({ stats, selectedYear }: { stats: OrderStats | null; selectedYear: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setSelectedYear = (year: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (year === THIS_YEAR) params.delete('year');
    else params.set('year', String(year));
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const [activeMetric, setActiveMetric] = useState<'income' | 'brands'>('income');
  const [hoveredMonth, setHoveredMonth] = useState<MonthlyCreatorRecord | null>(null);

  const yearData = toYearData(selectedYear, stats);
  const yearOptions = stats?.years?.length ? stats.years : [THIS_YEAR];

  // Calculate maximum for bar scale
  const maxIncome = Math.max(...yearData.months.map((m) => m.incomeEur));
  const maxBrands = Math.max(...yearData.months.map((m) => m.brandsCount));
  // `|| 1` avoids dividing by zero for a year without earnings.
  const currentMax = (activeMetric === 'income' ? maxIncome : maxBrands) || 1;


  return (
    <div className="bg-white rounded-xl p-3.5 sm:p-7 border border-[#E7E7E2] shadow-2xs space-y-4 sm:space-y-6 font-sans">
      {/* Top Header: Title, Growth Badge, Metric Toggle & Year Dropdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#E7E7E2]">
        <div>
          <h2 className="text-2xl font-extrabold text-[#0A0A0A] tracking-tight">
            {activeMetric === 'income' ? 'Earnings Performance' : 'Brand Collaborations'}
          </h2>
          <p className="text-sm text-[#66665E] mt-1 font-medium">
            {activeMetric === 'income'
              ? `Brand deal earnings for ${selectedYear}.`
              : `Brand collaboration volume for ${selectedYear}.`}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap self-start sm:self-auto">
          {/* Metric Selector Pills */}
          <div className="bg-[#FAFAF8] p-1 rounded-lg border border-[#E7E7E2] flex items-center gap-1">
            <button
              onClick={() => setActiveMetric('income')}
              className={`px-3 py-1.5 rounded-md text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeMetric === 'income'
                  ? 'bg-[#0A0A0A] text-white shadow-2xs'
                  : 'text-[#66665E] hover:text-[#0A0A0A]'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Income (€)</span>
            </button>
            <button
              onClick={() => setActiveMetric('brands')}
              className={`px-3 py-1.5 rounded-md text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeMetric === 'brands'
                  ? 'bg-[#0A0A0A] text-white shadow-2xs'
                  : 'text-[#66665E] hover:text-[#0A0A0A]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Brand Collabs</span>
            </button>
          </div>

          {/* Year Selector Dropdown */}
          <div className="relative">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-[#FAFAF8] border border-[#E7E7E2] rounded-lg px-3 py-1.5 pr-8 text-xs font-extrabold text-[#0A0A0A] cursor-pointer focus:outline-none appearance-none"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-[#66665E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* 12-Month Bar Chart */}
      <div className="pt-2">
        <div className="h-44 sm:h-72 w-full flex items-end justify-between gap-1 sm:gap-3 px-0.5 sm:px-1 pt-6 pb-2 relative">
          {/* Subtle grid lines */}
          <div className="absolute inset-x-0 top-6 border-b border-dashed border-[#EAEAE3] pointer-events-none" />
          <div className="absolute inset-x-0 top-1/2 border-b border-dashed border-[#EAEAE3] pointer-events-none" />

          {yearData.months.map((item) => {
            const val = activeMetric === 'income' ? item.incomeEur : item.brandsCount;
            const pct = val ? Math.max(12, Math.round((val / currentMax) * 100)) : 3;
            const isHovered = hoveredMonth?.month === item.month;

            return (
              <div
                key={item.month}
                onMouseEnter={() => setHoveredMonth(item)}
                onMouseLeave={() => setHoveredMonth(null)}
                className="flex-1 h-full flex flex-col justify-end items-center group cursor-pointer relative"
              >
                {/* Floating Micro-Value on Hover ONLY */}
                {isHovered && (
                  <div
                    className="absolute -top-7 px-2.5 py-0.5 rounded-md text-xs font-black tracking-tight whitespace-nowrap z-20 pointer-events-none transition-all bg-[#0A0A0A] text-white shadow-md -translate-y-1"
                  >
                    {activeMetric === 'income'
                      ? `€${val.toLocaleString()}`
                      : `${val} Brand${val === 1 ? '' : 's'}`}
                  </div>
                )}

                {/* Track Background */}
                <div className="w-full max-w-[42px] h-full flex items-end rounded-lg bg-[#FAFAF8] group-hover:bg-[#F4F4F0] p-0.5 transition-colors">
                  {/* Dynamic Height Bar */}
                  <div
                    style={{ height: `${pct}%` }}
                    className={`w-full rounded-md transition-all duration-200 ${
                      isHovered
                        ? 'bg-[#FF2D78] scale-102 shadow-xs'
                        : 'bg-[#0A0A0A]'
                    }`}
                  />
                </div>

                {/* Month Label */}
                <span
                  className={`text-[9px] sm:text-xs font-extrabold mt-1.5 sm:mt-2 transition-colors ${
                    isHovered
                      ? 'text-[#FF2D78]'
                      : 'text-[#66665E] group-hover:text-[#0A0A0A]'
                  }`}
                >
                  {item.month}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
