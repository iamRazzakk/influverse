'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Calculator,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';

export default function PricingPage() {
  const [budgetEur, setBudgetEur] = useState<number>(1000);

  const platformFeeEur = Math.round(budgetEur * 0.15);
  const totalCostEur = budgetEur + platformFeeEur;

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#0A0A0A] font-sans pb-24">
      {/* 1. HERO HEADER */}
      <section className="pt-12 sm:pt-16 pb-8 sm:pb-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center space-y-3 sm:space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-[#E7E7E2] text-[#52524B] text-[11px] sm:text-xs font-bold uppercase tracking-[0.14em] shadow-2xs">
            <span className="h-1.5 w-1.5 rounded-full bg-[#FF2D78]" />
            Zero Subscription Fees
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-[54px] font-black text-[#0A0A0A] tracking-tight leading-[1.12] sm:leading-[1.1] font-sans">
            Transparent, pay-per-hire{' '}
            <span className="font-editorial italic font-normal text-[#0A0A0A]">
              pricing.
            </span>
          </h1>

          <p className="text-sm sm:text-lg text-[#66665E] font-medium max-w-2xl mx-auto leading-relaxed font-sans">
            No monthly software lock-ins, hidden markups, or tier walls. Brands pay a flat 15% escrow platform fee on successful hires — creators keep 100% of their listed price.
          </p>
        </div>
      </section>

      {/* 2. INTERACTIVE FEE CALCULATOR & WHAT'S INCLUDED */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16 sm:mb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-10 lg:gap-10 max-w-5xl mx-auto items-stretch">
          {/* Interactive Calculator Box */}
          <div className="lg:col-span-7 min-w-0 bg-white rounded-2xl sm:rounded-3xl p-6 min-[400px]:p-7 sm:p-8 lg:p-10 border border-[#E7E7E2] shadow-sm space-y-5 sm:space-y-6 flex flex-col justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#0A0A0A] text-white flex items-center justify-center shadow-xs">
                  <Calculator className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <h2 className="font-black text-base sm:text-xl text-[#0A0A0A] font-sans">
                  Interactive Fee Calculator
                </h2>
              </div>
              <span className="self-start sm:self-auto px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-[#FFF0F5] text-[#FF2D78] border border-[#FF2D78]/20 text-xs sm:text-sm font-bold font-sans whitespace-nowrap">
                Flat 15% Platform Fee
              </span>
            </div>

            {/* Interactive Slider & Presets */}
            <div className="space-y-3.5 pt-1">
              <div className="flex justify-between items-center gap-2 font-sans">
                <label className="text-xs sm:text-sm font-bold text-[#66665E]">
                  Creator Base Rate:
                </label>
                <span className="font-sans text-xl sm:text-3xl font-black text-[#0A0A0A]">
                  €{budgetEur.toLocaleString()}
                </span>
              </div>

              {/* Custom High-Contrast Range Slider */}
              <div className="relative py-1">
                <input
                  type="range"
                  min={200}
                  max={5000}
                  step={50}
                  value={budgetEur}
                  onChange={(e) => setBudgetEur(Number(e.target.value))}
                  className="w-full h-3 rounded-full appearance-none cursor-pointer bg-[#E7E7E2] accent-[#0A0A0A] focus:outline-none"
                  style={{
                    background: `linear-gradient(to right, #0A0A0A 0%, #0A0A0A ${
                      ((budgetEur - 200) / (5000 - 200)) * 100
                    }%, #E7E7E2 ${
                      ((budgetEur - 200) / (5000 - 200)) * 100
                    }%, #E7E7E2 100%)`,
                  }}
                  aria-label="Creator Base Rate Budget Slider"
                />
              </div>
            </div>

            {/* Financial Breakdown Table */}
            <div className="space-y-3 pt-4 sm:pt-5 border-t border-[#E7E7E2] font-sans">
              <div className="flex justify-between items-center gap-2 text-xs sm:text-sm text-[#555550]">
                <span>Creator Earnings (100% Payout):</span>
                <span className="font-sans text-sm sm:text-base font-bold text-[#0A0A0A]">
                  €{budgetEur.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center gap-2 text-xs sm:text-sm text-[#555550]">
                <span>Brand Platform Fee (15%):</span>
                <span className="font-sans text-sm sm:text-base font-bold text-[#FF2D78]">
                  +€{platformFeeEur.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs sm:text-base font-extrabold text-[#0A0A0A] pt-3 border-t border-[#E7E7E2]">
                <span>Total Brand Escrow Deposit:</span>
                <span className="font-sans text-base sm:text-2xl font-black text-[#0A0A0A]">
                  €{totalCostEur.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <Link
                href="/register?role=brand"
                className="w-full h-11 rounded-full bg-[#0A0A0A] hover:bg-[#FF2D78] text-white font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
              >
                <span>Start Hiring Creators</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Value Summary Card */}
          <div className="lg:col-span-5 min-w-0 relative overflow-hidden bg-[#0A0A0A] bg-gradient-to-b from-[#141414] to-[#0D0D0D] text-white rounded-2xl sm:rounded-3xl p-6 min-[400px]:p-7 sm:p-8 lg:p-10 border border-white/10 hover:border-white/20 shadow-2xl transition-all duration-300 space-y-5 sm:space-y-6 group flex flex-col justify-between">
            <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-[#FF2D78]/20 blur-[90px] pointer-events-none transition-opacity duration-500 group-hover:opacity-90" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-[#FF2D78]/10 blur-[80px] pointer-events-none" />

            <div className="relative z-10 space-y-4 sm:space-y-6">
              <h2 className="text-xl sm:text-3xl font-black text-white font-sans tracking-tight">
                What&apos;s{' '}
                <span className="font-sans font-black text-white drop-shadow-[0_2px_12px_rgba(255,45,120,0.3)]">
                  Included
                </span>
              </h2>
              <p className="text-xs sm:text-[16px] text-[#A3A39C] leading-snug sm:leading-[26px] font-sans font-medium">
                Every collaboration through Influverse comes with enterprise-grade safeguards and seamless delivery workflows.
              </p>

              <ul className="space-y-2.5 sm:space-y-3.5">
                {[
                  'Full Escrow Payment Protection',
                  'Standard Commercial Usage Rights',
                  'Built-in File Delivery Workspace',
                  'Dedicated Mediation & Dispute Help',
                  'EU VAT Invoices & Compliance Receipts',
                  'Free to Sign Up & Search Catalog',
                ].map((item, idx) => (
                  <li key={idx} className="flex items-center gap-2.5 text-xs sm:text-[14px] font-semibold text-white/90 font-sans">
                    <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
                    </div>
                    <span className="leading-snug">{item}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-2 space-y-2">
                <Button
                  href="/creators"
                  size="md"
                  variant="white"
                  fullWidth
                >
                  Explore Creator Marketplace
                </Button>
                <div className="text-center text-xs text-[#A3A39C] py-1">
                  100% money-back escrow guarantee if deliverables aren&apos;t approved
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. BOTTOM CONVERSION CALL TO ACTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16 sm:mb-24">
        <div className="bg-[#0A0A0A] text-white rounded-3xl p-8 sm:p-14 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-1/4 w-96 h-96 rounded-full bg-[#FF2D78]/20 blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-2xl mx-auto space-y-6">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.1]">
              Ready to collaborate with total confidence?
            </h2>
            <p className="text-sm sm:text-base text-[#A3A39C] leading-relaxed">
              Explore thousands of verified creators or join our talent marketplace. No credit card required to get started.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 pt-2">
              <Link href="/creators" className="w-full sm:w-auto">
                <button className="w-full sm:w-auto h-12 px-8 rounded-full bg-white hover:bg-[#FAFAF8] text-[#0A0A0A] font-bold text-sm transition-all shadow-md inline-flex items-center justify-center gap-2 cursor-pointer hover:scale-105 active:scale-95">
                  <span>Browse Creator Directory</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
              <Link href="/register" className="w-full sm:w-auto">
                <button className="w-full sm:w-auto h-12 px-8 rounded-full bg-[#FF2D78] hover:bg-[#E02669] text-white font-bold text-sm transition-all shadow-md inline-flex items-center justify-center gap-2 cursor-pointer hover:scale-105 active:scale-95">
                  <span>Create Free Account</span>
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
