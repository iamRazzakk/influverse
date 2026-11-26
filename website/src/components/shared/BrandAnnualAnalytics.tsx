'use client';

import React, { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { OrderStats } from '@/lib/api/endpoints/orders';
import {
  DollarSign,
  Users,
  ChevronDown,
} from 'lucide-react';

interface MonthlyBrandRecord {
  month: string;
  fullName: string;
  spendEur: number;
  creatorsCount: number;
  creators: string[];
  isCurrent?: boolean;
}

interface YearBrandData {
  year: number;
  totalSpendEur: number;
  totalCreatorsCount: number;
  growthRatePct: number;
  peakMonth: string;
  months: MonthlyBrandRecord[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const THIS_YEAR = new Date().getFullYear();

/** Server stats (GET /orders/stats) → the chart's month records. Spend = escrow paid that month. */
const toYearData = (year: number, stats?: OrderStats | null): YearBrandData => {
  const months = MONTHS.map((name, idx) => {
    const row = stats?.months.find((m) => m.month === idx + 1);
    return {
      month: name.slice(0, 3),
      fullName: `${name} ${year}`,
      spendEur: Math.round((row?.amountCents ?? 0) / 100),
      creatorsCount: row?.count ?? 0,
      creators: row?.names ?? [],
      isCurrent: year === THIS_YEAR && idx === new Date().getMonth(),
    };
  });
  const peak = months.reduce((best, m) => (m.spendEur > best.spendEur ? m : best), months[0]);
  return {
    year,
    totalSpendEur: Math.round((stats?.yearTotalCents ?? 0) / 100),
    totalCreatorsCount: stats?.yearCounterpartsCount ?? 0,
    growthRatePct: 0,
    peakMonth: peak.spendEur > 0 ? peak.fullName.split(' ')[0] : '—',
    months,
  };
};

/**
 * Data comes from the server page (GET /orders/stats?year=). The year picker changes `?year=` in the
 * URL, so the page re-renders with that year's stats.
 */
export function BrandAnnualAnalytics({ stats, year: selectedYear }: { stats: OrderStats | null; year: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setSelectedYear = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === THIS_YEAR) params.delete('year');
    else params.set('year', String(next));
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const [activeMetric, setActiveMetric] = useState<'spend' | 'creators'>('spend');
  const [hoveredMonth, setHoveredMonth] = useState<MonthlyBrandRecord | null>(null);

  const yearData = toYearData(selectedYear, stats);
  const yearOptions = stats?.years?.length ? stats.years : [THIS_YEAR];

  // Calculate maximum for bar scale
  const maxSpend = Math.max(...yearData.months.map((m) => m.spendEur));
  const maxCreators = Math.max(...yearData.months.map((m) => m.creatorsCount));
  // `|| 1` avoids dividing by zero while there is no data yet.
  const currentMax = (activeMetric === 'spend' ? maxSpend : maxCreators) || 1;

  return (
    <div className="bg-white rounded-xl p-3.5 sm:p-7 border border-[#E7E7E2] shadow-2xs space-y-4 sm:space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E7E7E2]">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">
            {activeMetric === 'spend' ? 'Campaign Spend' : 'Creator Hires'}
          </h2>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap self-start sm:self-auto">
          {/* Metric Selector Pills */}
          <div className="bg-[#FAFAF8] p-1 rounded-lg border border-[#E7E7E2] flex items-center gap-1">
            <button
              onClick={() => setActiveMetric('spend')}
              className={`px-3 py-1.5 rounded-md text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeMetric === 'spend'
                  ? 'bg-[#0A0A0A] text-white shadow-2xs'
                  : 'text-[#66665E] hover:text-[#0A0A0A]'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Spend (€)</span>
            </button>
            <button
              onClick={() => setActiveMetric('creators')}
              className={`px-3 py-1.5 rounded-md text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeMetric === 'creators'
                  ? 'bg-[#0A0A0A] text-white shadow-2xs'
                  : 'text-[#66665E] hover:text-[#0A0A0A]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Creators Hired</span>
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
            const val = activeMetric === 'spend' ? item.spendEur : item.creatorsCount;
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
                    {activeMetric === 'spend'
                      ? `€${val.toLocaleString()}`
                      : `${val} Creator${val === 1 ? '' : 's'}`}
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
