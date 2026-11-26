'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/session/AuthProvider';
import { http } from '@/lib/api/client';
import { useMutation } from '@/lib/hooks/useMutation';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { ArrowDownLeft, FileText, Search, Clock, Download, Landmark, Loader2, ExternalLink } from 'lucide-react';
import { Modal, message } from 'antd';
import { formatCents } from '@/lib/format';
import { getErrorMessage } from '@/lib/api/errors';
import { paymentsEndpoints, type CreatorPayoutRow, type CreatorPayouts } from '@/lib/api/endpoints/payments';
import type { CreatorProfile } from '@/types/api';

const longDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Recent';

const statusLabelOf = (p: CreatorPayoutRow) => (p.status === 'paid_out' ? 'Transferred' : p.status === 'in_escrow' ? 'In Escrow' : 'Available');

function CreatorPaymentsContent({ data }: { data: CreatorPayouts | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { currentUser, profile } = useAuth();
  const creatorProfile = profile as CreatorProfile | null;

  const isLoading = false;
  // Both return a Stripe URL and leave the page → no refresh needed.
  const startSetupMutation = useMutation(() => paymentsEndpoints(http).startPayoutSetup(), { refresh: false });
  const openDashboardMutation = useMutation(() => paymentsEndpoints(http).openPayoutDashboard(), { refresh: false });
  const startingSetup = startSetupMutation.loading;
  const openingDashboard = openDashboardMutation.loading;

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRemittance, setSelectedRemittance] = useState<CreatorPayoutRow | null>(null);

  // Back from Stripe onboarding (?connect=return|refresh) → clean the URL; that navigation re-renders
  // the server page, which reloads the account state.
  const connectParam = searchParams.get('connect');
  useEffect(() => {
    if (!connectParam) return;
    if (connectParam === 'return') {
      message.success('Payout details saved. We will send your available earnings to your bank account.');
    } else {
      message.info('Your payout setup link expired. Please continue the setup again.');
    }
    router.replace(pathname, { scroll: false });
  }, [connectParam, pathname, router]);

  const payouts = data?.items ?? [];
  const account = data?.account;
  const totalEarnedCents = data?.summary.totalEarnedCents ?? 0;
  const inEscrowCents = data?.summary.pendingEscrowCents ?? 0;
  const availableCents = data?.summary.availableCents ?? 0;

  const filteredPayouts = payouts.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.id.toLowerCase().includes(q) ||
      p.brandName.toLowerCase().includes(q) ||
      p.campaignTitle.toLowerCase().includes(q) ||
      p.referenceCode.toLowerCase().includes(q)
    );
  });

  const handleStartSetup = async () => {
    try {
      const { url } = await startSetupMutation.run();
      window.location.assign(url);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const handleOpenDashboard = async () => {
    const stripeWindow = window.open('about:blank', '_blank');
    try {
      const { url } = await openDashboardMutation.run();
      if (stripeWindow) stripeWindow.location.href = url;
      else window.location.assign(url);
    } catch (error) {
      stripeWindow?.close();
      message.error(getErrorMessage(error));
    }
  };

  const downloadPayoutStatement = (payout: CreatorPayoutRow) => {
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]!);
    const popup = window.open('', '_blank');
    if (!popup) {
      message.error('Allow pop-ups to download the PDF statement.');
      return;
    }
    const date = escapeHtml(longDate(payout.date));
    const brand = escapeHtml(payout.brandName);
    const title = escapeHtml(payout.campaignTitle);
    const order = escapeHtml(payout.orderCode);
    const ref = escapeHtml(payout.referenceCode);
    const status = escapeHtml(statusLabelOf(payout));
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Payout statement ${ref}</title><style>
      body{font:14px Arial,sans-serif;color:#171717;margin:48px auto;max-width:720px;padding:0 28px}h1{font-size:24px;margin:0 0 6px}.muted{color:#666;margin:0 0 28px}.box{border:1px solid #ddd;border-radius:12px;padding:20px;margin-top:20px}.row{display:flex;justify-content:space-between;gap:24px;padding:12px 0;border-bottom:1px solid #eee}.row:last-child{border:0;font-weight:bold;font-size:17px}.label{color:#666}.footer{margin-top:32px;color:#777;font-size:12px}@media print{body{margin:24px auto}}
      </style></head><body><h1>Influverse Payout Statement</h1><p class="muted">${date} · ${status}</p><div class="box"><div class="row"><span class="label">Creator</span><strong>${escapeHtml(String(creatorProfile?.name || currentUser?.name || 'Creator'))}</strong></div><div class="row"><span class="label">Brand</span><strong>${brand}</strong></div><div class="row"><span class="label">Campaign</span><strong>${title}</strong></div><div class="row"><span class="label">Order</span><strong>${order}</strong></div><div class="row"><span class="label">Reference</span><strong>${ref}</strong></div><div class="row"><span>Net earnings</span><strong>${escapeHtml(formatCents(payout.amountCents))}</strong></div></div><p class="footer">This statement records the payout status shown in Influverse. Stripe transfer details are available in your Stripe Express dashboard after transfer.</p><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  };

  // 1-Click CSV Export Handler
  const handleExportCSV = () => {
    if (payouts.length === 0) {
      message.warning('No records to export.');
      return;
    }

    const headers = ['Payout ID', 'Date', 'Brand', 'Campaign', 'Order', 'Amount (EUR)', 'Platform Fee', 'Status', 'Reference Code'];
    const rows = payouts.map((p) => [
      `"${p.id}"`,
      `"${longDate(p.date)}"`,
      `"${p.brandName.replace(/"/g, '""')}"`,
      `"${p.campaignTitle.replace(/"/g, '""')}"`,
      `"${p.orderCode}"`,
      (p.amountCents / 100).toFixed(2),
      `"0% (fee paid by brand)"`,
      `"${statusLabelOf(p)}"`,
      `"${p.referenceCode}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `influverse-payouts-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    message.success('Payout ledger exported as CSV!');
  };

  return (
    <div className="space-y-7 font-sans pb-16">
      <WorkspaceHeader
        title="Payouts"
        subtitle="Track earnings and payout history."
        action={
          <button
            type="button"
            onClick={handleExportCSV}
            className="h-10 px-4 rounded-lg border border-[#E7E7E2] hover:border-[#0A0A0A] bg-white hover:bg-[#FAFAF8] text-[#0A0A0A] text-sm font-bold transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-[#0A0A0A]" />
            <span>Export CSV</span>
          </button>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 sm:space-y-8">
        {/* Payout account (Stripe Connect) — needed before any money can reach the creator's bank. */}
        {account && !account.payoutsEnabled && (
          <div className="p-4 sm:p-6 bg-[#FFF0F5] rounded-xl border border-[#FF2D78]/25 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-white text-[#FF2D78] border border-[#FF2D78]/25 flex items-center justify-center shrink-0">
                <Landmark className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-[#0A0A0A]">
                  {account.detailsSubmitted ? 'Payout setup is being verified' : 'Set up payouts to get paid'}
                </div>
                <p className="text-sm text-[#66665E] mt-0.5 leading-relaxed">
                  {account.detailsSubmitted
                    ? 'Stripe is checking your details. If something is missing, continue the setup.'
                    : 'Add your bank account through our payment partner Stripe. Approved earnings are sent there automatically.'}
                  {availableCents > 0 && (
                    <>
                      {' '}
                      <strong className="text-[#0A0A0A]">{formatCents(availableCents)}</strong> is waiting for you.
                    </>
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleStartSetup}
              disabled={startingSetup}
              className="h-11 sm:h-10 px-5 rounded-lg w-full md:w-auto bg-[#0A0A0A] hover:bg-[#FF2D78] disabled:opacity-60 text-white text-sm font-bold transition-all inline-flex items-center justify-center gap-2 cursor-pointer shrink-0 shadow-xs"
            >
              {startingSetup && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{account.connected ? 'Continue Setup' : 'Set Up Payouts'}</span>
            </button>
          </div>
        )}

        {/* 2-Metric Overview Cards */}
        <div className="grid grid-cols-2 gap-2 sm:gap-5">
          {/* 1. Total Earned */}
          <div className="min-w-0 p-3 sm:p-6 bg-white rounded-xl border border-[#E7E7E2] shadow-2xs space-y-1 sm:space-y-2">
            <div className="flex items-center justify-between gap-1 text-[#66665E]">
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide leading-tight">Total Earned</span>
              <div className="hidden sm:flex w-7 h-7 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] items-center justify-center text-[#0A0A0A]">
                <ArrowDownLeft className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="truncate text-base sm:text-3xl font-black text-[#0A0A0A] tracking-tight">{formatCents(totalEarnedCents)}</div>
          </div>

          {/* 2. In Escrow */}
          <div className="min-w-0 p-3 sm:p-6 bg-white rounded-xl border border-[#E7E7E2] shadow-2xs space-y-1 sm:space-y-2">
            <div className="flex items-center justify-between gap-1 text-[#66665E]">
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide leading-tight">Pending Escrow</span>
              <div className="hidden sm:flex w-7 h-7 rounded-lg bg-[#FFF0F5] text-[#FF2D78] items-center justify-center">
                <Clock className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="truncate text-base sm:text-3xl font-black text-[#0A0A0A] tracking-tight">{formatCents(inEscrowCents)}</div>
          </div>
        </div>

        {/* Clean Transactions Table Card */}
        <div className="sm:bg-white sm:rounded-xl sm:p-6 sm:border sm:border-[#E7E7E2] sm:shadow-2xs space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h3 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">Payout History</h3>
              <p className="text-sm text-[#66665E] mt-1">
                Records of completed settlements and funds in escrow.
                {account?.payoutsEnabled && (
                  <button
                    type="button"
                    onClick={handleOpenDashboard}
                    disabled={openingDashboard}
                    className="ml-2 inline-flex items-center gap-1 font-bold text-[#0A0A0A] hover:text-[#FF2D78] cursor-pointer"
                  >
                    <span>Manage bank account</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:max-w-xs">
              <Search className="w-4 h-4 text-[#66665E] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by brand or campaign..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-3.5 text-base sm:text-sm font-medium text-[#0A0A0A] bg-white sm:bg-[#FAFAF8] border border-[#E7E7E2] rounded-lg outline-none focus:border-[#0A0A0A] placeholder:text-[#A3A39C] transition-all"
              />
            </div>
          </div>

          {isLoading && (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#A3A39B]" />
            </div>
          )}

          <div className="lg:hidden space-y-2.5 md:space-y-0 md:grid md:grid-cols-2 md:gap-3">
            {filteredPayouts.map((payout) => {
              const isEscrow = payout.status === 'in_escrow';
              return (
                <div key={payout.id} className="p-3.5 rounded-lg bg-white sm:bg-[#FAFAF8] border border-[#E7E7E2]">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-[#0A0A0A]">{payout.brandName}</div>
                    </div>
                    <div className="shrink-0 text-sm font-black tracking-tight text-[#0A0A0A]">+{formatCents(payout.amountCents)}</div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-medium text-[#66665E]">{longDate(payout.date)}</span>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        isEscrow ? 'border border-[#FF2D78]/25 bg-[#FFF0F5] text-[#FF2D78]' : 'border border-[#E7E7E2] bg-[#F4F4F0] text-[#0A0A0A]'
                      }`}
                    >
                      {statusLabelOf(payout)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedRemittance(payout)}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#E7E7E2] bg-white text-[#66665E]"
                      title="View Statement"
                    >
                      <FileText className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full min-w-[600px] text-left">
              <thead>
                <tr className="border-b border-[#E7E7E2] text-[#66665E] font-bold uppercase tracking-wider text-xs">
                  <th className="pb-3.5 px-3 whitespace-nowrap">Brand</th>
                  <th className="pb-3.5 px-3 whitespace-nowrap">Date</th>
                  <th className="pb-3.5 px-3 whitespace-nowrap text-right">Earned (€)</th>
                  <th className="pb-3.5 px-3 whitespace-nowrap text-center">Status</th>
                  <th className="pb-3.5 px-3 whitespace-nowrap text-right">Statement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F4F0]">
                {filteredPayouts.map((payout) => {
                  const isPaidOut = payout.status === 'paid_out';
                  const isEscrow = payout.status === 'in_escrow';

                  return (
                    <tr key={payout.id} className="hover:bg-[#FAFAF8] transition-colors">
                      {/* Brand */}
                      <td className="py-4 px-3">
                        <div className="font-bold text-sm text-[#0A0A0A]">{payout.brandName}</div>
                      </td>

                      {/* Date */}
                      <td className="py-4 px-3 text-sm text-[#66665E] font-medium whitespace-nowrap">{longDate(payout.date)}</td>

                      {/* Earnings */}
                      <td className="py-4 px-3 whitespace-nowrap text-right font-black text-sm text-[#0A0A0A] tracking-tight">
                        <span>+{formatCents(payout.amountCents)}</span>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-3 whitespace-nowrap text-center">
                        {isPaidOut ? (
                          <span className="px-2.5 py-1 rounded-md bg-[#F4F4F0] text-[#0A0A0A] border border-[#E7E7E2] font-bold text-xs uppercase tracking-wide">
                            Transferred
                          </span>
                        ) : isEscrow ? (
                          <span className="px-2.5 py-1 rounded-md bg-[#FFF0F5] text-[#FF2D78] border border-[#FF2D78]/25 font-bold text-xs uppercase tracking-wide">
                            In Escrow
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-md bg-[#FAFAF8] text-[#0A0A0A] border border-[#E7E7E2] font-bold text-xs uppercase tracking-wide">
                            Available
                          </span>
                        )}
                      </td>

                      {/* Receipt Action */}
                      <td className="py-4 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedRemittance(payout)}
                          className="w-8 h-8 rounded-lg border border-[#E7E7E2] hover:border-[#0A0A0A] hover:bg-white text-[#66665E] hover:text-[#0A0A0A] inline-flex items-center justify-center transition-colors cursor-pointer"
                          title="View Statement"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!isLoading && filteredPayouts.length === 0 && (
            <div className="py-12 text-center text-sm text-[#66665E] font-medium">
              {payouts.length === 0 ? 'No payouts yet. Earnings appear here once a brand funds your order.' : 'No payout records match your search criteria.'}
            </div>
          )}
        </div>
      </div>

      {/* Clean Remittance Statement Modal */}
      <Modal title={null} open={!!selectedRemittance} onCancel={() => setSelectedRemittance(null)} footer={null} centered width={460}>
        {selectedRemittance && (
          <div className="space-y-5 font-sans pt-2">
            <div className="border-b border-[#E7E7E2] pb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-xs font-bold uppercase tracking-wider text-[#66665E]">REMITTANCE STATEMENT</span>
                <h3 className="text-2xl font-extrabold text-[#0A0A0A] tracking-tight mt-0.5 break-all">{selectedRemittance.referenceCode}</h3>
                <div className="text-sm text-[#66665E]">{longDate(selectedRemittance.date)}</div>
              </div>
              <span className="shrink-0 px-2.5 py-1 rounded-md bg-[#F4F4F0] text-[#0A0A0A] border border-[#E7E7E2] font-bold text-xs uppercase tracking-wide">
                {statusLabelOf(selectedRemittance)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[#66665E] block">Creator</span>
                <strong className="text-[#0A0A0A] block break-words">{creatorProfile?.name || currentUser?.name}</strong>
                {creatorProfile?.handle && <span className="text-[#66665E] block">@{creatorProfile.handle}</span>}
              </div>
              <div>
                <span className="text-[#66665E] block">Brand Sponsor</span>
                <strong className="text-[#0A0A0A] block break-words">{selectedRemittance.brandName}</strong>
                <span className="text-[#66665E] block">Verified Escrow</span>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] space-y-2 text-xs">
              <div className="flex justify-between gap-3 font-bold text-[#0A0A0A]">
                <span className="min-w-0 break-words">{selectedRemittance.campaignTitle}</span>
                <span className="shrink-0">{formatCents(selectedRemittance.amountCents)}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[#66665E]">
                <span>
                  Order #{selectedRemittance.orderCode} • {selectedRemittance.payoutMethod}
                </span>
                <span>Platform Fee: 0%</span>
              </div>
              <div className="border-t border-[#E7E7E2] pt-2 flex justify-between font-black text-sm text-[#0A0A0A]">
                <span>Net Earnings</span>
                <span className="text-[#0A0A0A]">{formatCents(selectedRemittance.amountCents)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => downloadPayoutStatement(selectedRemittance)}
              className="w-full h-11 sm:h-10 rounded-lg bg-[#0A0A0A] hover:bg-[#FF2D78] text-white text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF Statement</span>
            </button>
            {selectedRemittance.status === 'paid_out' && (
              <button
                type="button"
                onClick={handleOpenDashboard}
                disabled={openingDashboard}
                className="w-full h-11 sm:h-10 rounded-lg border border-[#E7E7E2] hover:border-[#0A0A0A] bg-white text-[#0A0A0A] text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
              >
                {openingDashboard ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                <span>View Stripe transfer dashboard</span>
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/**
 * Payouts UI. `data` comes from the server page (GET /payouts/me).
 * `?connect=` (back from Stripe onboarding) needs useSearchParams → wrapped in Suspense like the Messages page.
 */
export function PaymentsView({ data }: { data: CreatorPayouts | null }) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#A3A39B]" />
        </div>
      }
    >
      <CreatorPaymentsContent data={data} />
    </React.Suspense>
  );
}
