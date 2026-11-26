'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/session/AuthProvider';
import { http } from '@/lib/api/client';
import { paymentsEndpoints } from '@/lib/api/endpoints/payments';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { Wallet, FileText, Search, Download, Lock, Eye, Loader2 } from 'lucide-react';
import { Modal, Button, message } from 'antd';
import { Button as AppButton } from '@/components/ui';
import { formatCents } from '@/lib/format';
import type { BrandLedgerRow, BrandPayments } from '@/lib/api/endpoints/payments';
import type { BrandProfile } from '@/types/api';

/**
 * Brand payments ledger. No wallet (decision 2026-11-18): brands pay each offer through Stripe
 * Checkout, so the first card shows "Total Spent" instead of a wallet balance and there is no deposit.
 */

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const statusLabelOf = (txn: BrandLedgerRow) =>
  txn.status === 'in_escrow' ? 'In Escrow' : txn.status === 'refunded' ? 'Refunded' : 'Released';

export function PaymentsView({ data }: { data: BrandPayments | null }) {
  const { currentUser, profile } = useAuth();
  const brandProfile = profile as BrandProfile | null;
  // Loaded by the server page; there is no loading phase any more.
  const isLoading = false;

  const [searchQuery, setSearchQuery] = useState<string>('');
  // Invoice Receipt Modal State
  const [selectedInvoice, setSelectedInvoice] = useState<BrandLedgerRow | null>(null);
  const [isOpeningStripeDocument, setIsOpeningStripeDocument] = useState(false);
  // Compact Detail Drawer/Modal State
  const [selectedDetailTransaction, setSelectedDetailTransaction] = useState<BrandLedgerRow | null>(null);

  const transactions = data?.items ?? [];
  const totalSpentCents = data?.summary.totalSpentCents ?? 0;
  const activeEscrowCents = data?.summary.inEscrowCents ?? 0;

  const openStripeDocument = async (txn: BrandLedgerRow) => {
    if (!txn.stripeDocumentReady) {
      message.info('The Stripe document is available after the payment is captured.');
      return;
    }
    const documentWindow = window.open('about:blank', '_blank');
    setIsOpeningStripeDocument(true);
    try {
      const result = await paymentsEndpoints(http).stripePaymentDocument(txn.paymentId);
      if (documentWindow) documentWindow.location.href = result.url;
      else window.location.assign(result.url);
      if (result.type === 'receipt') message.info('Stripe receipt opened. Use Print / Save as PDF to download it.');
    } catch (error) {
      documentWindow?.close();
      message.error(error instanceof Error ? error.message : 'Could not open the Stripe document.');
    } finally {
      setIsOpeningStripeDocument(false);
    }
  };

  const filteredTransactions = transactions.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.id.toLowerCase().includes(q) ||
      t.creatorName.toLowerCase().includes(q) ||
      t.campaignTitle.toLowerCase().includes(q) ||
      t.invoiceNumber.toLowerCase().includes(q) ||
      (t.orderCode ?? '').toLowerCase().includes(q)
    );
  });

  const handleExportCsv = () => {
    if (!filteredTransactions.length) {
      message.warning('No records to export.');
      return;
    }
    const headers = ['Transaction ID', 'Date', 'Creator', 'Campaign', 'Order', 'Amount (EUR)', 'Creator Payout (EUR)', 'Platform Fee (EUR)', 'Status', 'Invoice Number'];
    const rows = filteredTransactions.map((t) => [
      t.id,
      `"${longDate(t.date)}"`,
      `"${t.creatorName.replace(/"/g, '""')}"`,
      `"${t.campaignTitle.replace(/"/g, '""')}"`,
      t.orderCode ?? '',
      (t.amountCents / 100).toFixed(2),
      (t.payoutCents / 100).toFixed(2),
      (t.feeCents / 100).toFixed(2),
      statusLabelOf(t),
      t.invoiceNumber,
    ]);

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `influverse_brand_payments_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success('Ledger exported to CSV successfully!');
  };

  return (
    <div className="min-h-screen font-sans pb-16">
      <WorkspaceHeader
        title="Payments"
        subtitle="Track escrow payments and payment history."
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <AppButton size="md" variant="secondary" className="!rounded-lg" onClick={handleExportCsv} icon={<Download className="w-3.5 h-3.5" />}>
              Export CSV
            </AppButton>
          </div>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <div className="grid grid-cols-2 gap-3 sm:gap-5">
          <div className="min-w-0 p-3 sm:p-6 bg-white rounded-xl border border-[#E7E7E2] shadow-2xs space-y-1 sm:space-y-2">
            <div className="flex items-center justify-between gap-1 text-[#66665E]">
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide leading-tight">Total Spent</span>
              <div className="hidden sm:flex w-8 h-8 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] items-center justify-center text-[#0A0A0A]">
                <Wallet className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="truncate text-lg sm:text-3xl font-black text-[#0A0A0A] tracking-tight">{formatCents(totalSpentCents)}</div>
          </div>

          <div className="min-w-0 p-3 sm:p-6 bg-white rounded-xl border border-[#E7E7E2] shadow-2xs space-y-1 sm:space-y-2">
            <div className="flex items-center justify-between gap-1 text-[#66665E]">
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide leading-tight">Locked in Escrow</span>
              <div className="hidden sm:flex w-8 h-8 rounded-lg bg-[#FFF0F5] text-[#FF2D78] items-center justify-center">
                <Lock className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="truncate text-lg sm:text-3xl font-black text-[#0A0A0A] tracking-tight">{formatCents(activeEscrowCents)}</div>
          </div>
        </div>

        <div className="sm:bg-white sm:rounded-xl sm:p-6 lg:p-8 sm:border sm:border-[#E7E7E2] sm:shadow-2xs space-y-4 sm:space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
            <div>
              <h3 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">Payment History</h3>
              <p className="text-sm text-[#66665E] mt-1">Escrow payments, released payouts and refunds. Click any row for detail breakdown.</p>
            </div>

            <div className="relative w-full md:max-w-xs shrink-0">
              <Search className="w-4 h-4 text-[#66665E] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by creator or invoice..."
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

          <div className="md:hidden space-y-3">
            {filteredTransactions.map((txn) => {
              const isEscrow = txn.status === 'in_escrow';
              const isRefund = txn.status === 'refunded';
              return (
                <div key={txn.id} className="p-4 rounded-lg bg-white border border-[#E7E7E2] shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setSelectedDetailTransaction(txn)}
                    className="flex w-full min-w-0 items-start justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-[#0A0A0A]">{txn.creatorName}</div>
                    </div>
                    <div className="shrink-0 text-sm font-black tracking-tight text-[#0A0A0A]">
                      {isRefund ? '+' : '−'}
                      {formatCents(txn.amountCents)}
                    </div>
                  </button>
                  <div className="mt-3 pt-3 border-t border-[#F0F0EA] flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-medium text-[#66665E]">{longDate(txn.date)}</span>
                    <span
                      className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                        isEscrow ? 'border border-[#FF2D78]/25 bg-[#FFF0F5] text-[#FF2D78]' : 'border border-[#E7E7E2] bg-[#F4F4F0] text-[#0A0A0A]'
                      }`}
                    >
                      {statusLabelOf(txn)}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedDetailTransaction(txn)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E7E7E2] text-[#66665E]"
                        title="View Transaction Breakdown"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedInvoice(txn)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E7E7E2] text-[#66665E]"
                        title="View Payment Receipt"
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="border-b border-[#E7E7E2] text-[#66665E] font-bold uppercase tracking-wider text-xs">
                  <th className="pb-3.5 px-4">Creator</th>
                  <th className="pb-3.5 px-4">Date</th>
                  <th className="pb-3.5 px-4 text-right whitespace-nowrap">Amount (€)</th>
                  <th className="pb-3.5 px-4 text-center">Status</th>
                  <th className="pb-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F4F0]">
                {filteredTransactions.map((txn) => {
                  const isEscrow = txn.status === 'in_escrow';
                  const isRefund = txn.status === 'refunded';
                  return (
                    <tr
                      key={txn.id}
                      onClick={() => setSelectedDetailTransaction(txn)}
                      className="hover:bg-[#FAFAF8] transition-colors cursor-pointer group"
                    >
                      <td className="py-4 px-4">
                        <div className="font-bold text-sm text-[#0A0A0A] group-hover:text-[#FF2D78] transition-colors">{txn.creatorName}</div>
                      </td>

                      <td className="py-4 px-4 text-sm text-[#66665E] font-medium whitespace-nowrap">{longDate(txn.date)}</td>

                      <td className="py-4 px-4 text-right font-black text-sm text-[#0A0A0A] tracking-tight whitespace-nowrap">
                        {isRefund ? '+' : '−'}
                        {formatCents(txn.amountCents)}
                      </td>

                      <td className="py-4 px-4 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-md font-bold text-xs uppercase tracking-wide whitespace-nowrap ${
                            isEscrow ? 'bg-[#FFF0F5] text-[#FF2D78] border border-[#FF2D78]/25' : 'bg-[#F4F4F0] text-[#0A0A0A] border border-[#E7E7E2]'
                          }`}
                        >
                          {statusLabelOf(txn)}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDetailTransaction(txn);
                            }}
                            className="w-8 h-8 rounded-lg border border-[#E7E7E2] hover:border-[#0A0A0A] hover:bg-white text-[#66665E] hover:text-[#0A0A0A] inline-flex items-center justify-center transition-colors cursor-pointer"
                            title="View Transaction Breakdown"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedInvoice(txn);
                            }}
                            className="w-8 h-8 rounded-lg border border-[#E7E7E2] hover:border-[#0A0A0A] hover:bg-white text-[#66665E] hover:text-[#0A0A0A] inline-flex items-center justify-center transition-colors cursor-pointer"
                            title="View Tax Receipt"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!isLoading && filteredTransactions.length === 0 && (
            <div className="py-12 text-center text-sm text-[#66665E] font-medium">
              {transactions.length === 0 ? 'No payments yet. Payments appear here once you fund an offer.' : 'No payment records match your search.'}
            </div>
          )}
        </div>
      </div>

      {/* Tax Invoice & Receipt Modal */}
      <Modal title={null} open={!!selectedInvoice} onCancel={() => setSelectedInvoice(null)} footer={null} centered width={500}>
        {selectedInvoice && (
          <div className="space-y-6 font-sans pt-2">
            {/* Header */}
            <div className="border-b border-[#E7E7E2] pb-4 flex items-start justify-between gap-3 pr-8">
              <div className="min-w-0">
                <span className="text-xs font-extrabold uppercase tracking-widest text-[#66665E]">PAYMENT RECEIPT</span>
                <h3 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight mt-0.5 break-all">{selectedInvoice.invoiceNumber}</h3>
                <div className="text-sm text-[#66665E]">Issued on {longDate(selectedInvoice.date)}</div>
              </div>
              <span className="px-3 py-1 rounded-md bg-[#F4F4F0] text-[#0A0A0A] border border-[#E7E7E2] font-bold text-xs shrink-0 mt-2">
                {selectedInvoice.status === 'refunded' ? 'Refunded' : 'Paid / Settled'}
              </span>
            </div>

            {/* Parties */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="min-w-0">
                <span className="text-[#66665E] font-semibold block mb-1">Billed To</span>
                <strong className="text-[#0A0A0A] block">{brandProfile?.companyName || currentUser?.name}</strong>
                {currentUser?.email && <span className="text-[#66665E] block break-all">{currentUser.email}</span>}
                {(brandProfile?.city || brandProfile?.country) && (
                  <span className="text-[#66665E] block">{[brandProfile?.city, brandProfile?.country].filter(Boolean).join(', ')}</span>
                )}
              </div>
              <div>
                <span className="text-[#66665E] font-semibold block mb-1">Platform Issuer</span>
                <strong className="text-[#0A0A0A] block">Influverse Marketplace</strong>
                <span className="text-[#66665E] block">Processed by Stripe</span>
              </div>
            </div>

            {/* Line items */}
            <div className="p-4 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] space-y-2.5 text-xs">
              <div className="flex justify-between gap-3 font-bold text-[#0A0A0A]">
                <span className="min-w-0 break-words">{selectedInvoice.campaignTitle}</span>
                <span>{formatCents(selectedInvoice.payoutCents)}</span>
              </div>
              <div className="flex justify-between text-[#66665E]">
                <span>Platform fee</span>
                <span>{formatCents(selectedInvoice.feeCents)}</span>
              </div>
              <div className="flex justify-between gap-3 text-[#66665E]">
                <span className="min-w-0 break-all">Transaction Ref: {selectedInvoice.id}</span>
                <span>{selectedInvoice.method}</span>
              </div>
              <div className="border-t border-[#E7E7E2] pt-2 flex justify-between font-black text-sm text-[#0A0A0A]">
                <span>Total Settled in EUR</span>
                <span>{formatCents(selectedInvoice.amountCents)}</span>
              </div>
            </div>

            {/* Download Button */}
            <button
              onClick={() => void openStripeDocument(selectedInvoice)}
              disabled={isOpeningStripeDocument || !selectedInvoice.stripeDocumentReady}
              className="w-full h-11 rounded-lg bg-[#0A0A0A] hover:bg-[#FF2D78] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>{isOpeningStripeDocument ? 'Opening Stripe document…' : selectedInvoice.stripeDocumentReady ? 'Open Stripe invoice / receipt' : 'Available after payment capture'}</span>
            </button>
          </div>
        )}
      </Modal>

      {/* Transaction Detail Breakdown Modal */}
      <Modal
        title={null}
        open={!!selectedDetailTransaction}
        onCancel={() => setSelectedDetailTransaction(null)}
        footer={null}
        centered
        width={480}
      >
        {selectedDetailTransaction && (
          <div className="space-y-5 font-sans pt-2">
            <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-[#E7E7E2] pr-8">
              <div className="min-w-0">
                <span className="text-xs font-bold text-[#66665E] uppercase tracking-wider">Payment Ledger Breakdown</span>
                <div className="text-xl font-extrabold text-[#0A0A0A] tracking-tight mt-0.5 truncate">{selectedDetailTransaction.id}</div>
              </div>
              <span
                className={`px-3 py-1 rounded-md font-bold text-xs uppercase tracking-wide shrink-0 mt-1 ${
                  selectedDetailTransaction.status === 'in_escrow'
                    ? 'bg-[#FFF0F5] text-[#FF2D78] border border-[#FF2D78]/25'
                    : 'bg-[#F4F4F0] text-[#0A0A0A] border border-[#E7E7E2]'
                }`}
              >
                {selectedDetailTransaction.status === 'in_escrow' ? 'In Escrow' : statusLabelOf(selectedDetailTransaction)}
              </span>
            </div>

            <div className="p-4 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#66665E]">Amount Processed</div>
                <div className="text-2xl font-black text-[#0A0A0A] mt-0.5">
                  {selectedDetailTransaction.status === 'refunded' ? '+' : '−'}
                  {formatCents(selectedDetailTransaction.amountCents)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-[#66665E]">Currency</div>
                <div className="text-sm font-extrabold text-[#0A0A0A]">EUR (€)</div>
              </div>
            </div>

            <div className="divide-y divide-[#F4F4F0] text-sm">
              <div className="flex justify-between gap-4 py-2.5">
                <span className="text-[#66665E] font-medium">Recipient / Entity</span>
                <span className="min-w-0 font-bold text-[#0A0A0A] text-right break-words">{selectedDetailTransaction.creatorName}</span>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <span className="text-[#66665E] font-medium">Campaign Purpose</span>
                <span className="min-w-0 font-bold text-[#0A0A0A] text-right max-w-xs truncate">{selectedDetailTransaction.campaignTitle}</span>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <span className="text-[#66665E] font-medium">Creator Payout / Platform Fee</span>
                <span className="font-bold text-[#0A0A0A] text-right">
                  {formatCents(selectedDetailTransaction.payoutCents)} / {formatCents(selectedDetailTransaction.feeCents)}
                </span>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <span className="text-[#66665E] font-medium">Date & Settlement</span>
                <span className="font-bold text-[#0A0A0A] text-right">{longDate(selectedDetailTransaction.date)}</span>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <span className="text-[#66665E] font-medium">Payment Channel</span>
                <span className="font-bold text-[#0A0A0A] text-right">{selectedDetailTransaction.method}</span>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <span className="text-[#66665E] font-medium">Influverse Transaction Ref</span>
                <span className="min-w-0 font-mono font-bold text-[#0A0A0A] text-right break-all">{selectedDetailTransaction.invoiceNumber}</span>
              </div>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <Button
                type="primary"
                onClick={() => {
                  setSelectedInvoice(selectedDetailTransaction);
                  setSelectedDetailTransaction(null);
                }}
                className="flex-1 h-11 rounded-lg font-bold text-sm bg-[#0A0A0A] hover:!bg-[#FF2D78] !text-white border-none cursor-pointer shadow-xs"
              >
                View Payment Receipt
              </Button>
              <button
                type="button"
                onClick={() => setSelectedDetailTransaction(null)}
                className="h-11 px-5 rounded-lg border border-[#E7E7E2] hover:border-[#0A0A0A] text-sm font-bold text-[#0A0A0A] transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
