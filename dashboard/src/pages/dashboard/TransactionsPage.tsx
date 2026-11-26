import React, { useState } from 'react';
import { Receipt, Euro, ArrowDownLeft, ArrowUpRight, Loader2, Download, AlertCircle, RotateCw } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { PartyCell } from '@/components/shared/PartyCell';
import { FilterTabs, SubmitSearch } from '@/components/shared/ListControls';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Badge, type BadgeProps } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { getErrorMessage } from '@/lib/api/baseApi';
import {
  useGetAdminPaymentsQuery,
  useGetAdminPayoutsQuery,
  useRetryAdminPayoutMutation,
  type AdminPaymentRow,
  type AdminPayoutRow,
  type TransactionStats,
} from '@/lib/api/transactionsApi';
import { downloadCsv, formatCents, formatDate, formatDateTime, humanizeStatus } from '@/lib/utils';

type TransactionTab = 'payments' | 'payouts';

const PAYMENT_STATUS_VARIANT: Record<AdminPaymentRow['status'], BadgeProps['variant']> = {
  in_escrow: 'warning',
  released: 'success',
  refunded: 'danger',
};

const PAYOUT_STATUS_VARIANT: Record<AdminPayoutRow['status'], BadgeProps['variant']> = {
  pending: 'neutral',
  processing: 'warning',
  paid: 'success',
  failed: 'danger',
};

const PAYMENT_PURPOSE_LABEL: Record<AdminPaymentRow['purpose'], string> = {
  offer_hold: 'Offer hold',
  custom_offer_accept: 'Custom offer',
  order: 'Order payment',
};

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

/**
 * Transactions â€” brand payments (money in, held in escrow) and creator payouts (money out).
 * Data: GET /admin/transactions?tab=payments|payouts. The header totals cover the whole platform.
 */
export const TransactionsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TransactionTab>('payments');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const listParams = { q: search || undefined, page: currentPage, limit: pageSize };
  // Only the visible tab is fetched; switching tabs keeps the other one cached.
  const paymentsQuery = useGetAdminPaymentsQuery(listParams, { skip: activeTab !== 'payments' });
  const payoutsQuery = useGetAdminPayoutsQuery(listParams, { skip: activeTab !== 'payouts' });
  const activeQuery = activeTab === 'payments' ? paymentsQuery : payoutsQuery;

  // Stats are identical on both tabs â€” use whichever response is available.
  const stats: TransactionStats | undefined = paymentsQuery.data?.stats ?? payoutsQuery.data?.stats;
  const meta = activeQuery.data?.meta;

  const switchTab = (tab: TransactionTab) => {
    setActiveTab(tab);
    setSearch('');
    setCurrentPage(1);
  };

  const exportCurrentPage = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (activeTab === 'payments') {
      const rows = paymentsQuery.data?.items ?? [];
      downloadCsv(
        `influverse-payments-${stamp}-p${currentPage}.csv`,
        ['Reference', 'Payment ID', 'Date', 'Order', 'Campaign', 'Brand', 'Creator', 'Type', 'Amount (EUR)', 'Fee (EUR)', 'Creator payout (EUR)', 'Status', 'Stripe status', 'Method', 'Invoice', 'Refunded at', 'PaymentIntent'],
        rows.map((row) => [
          row.id,
          row.paymentId,
          row.date,
          row.orderCode,
          row.campaignTitle,
          row.brand?.name,
          row.creator?.name ?? row.creatorName,
          PAYMENT_PURPOSE_LABEL[row.purpose] ?? row.purpose,
          (row.amountCents / 100).toFixed(2),
          (row.feeCents / 100).toFixed(2),
          (row.payoutCents / 100).toFixed(2),
          row.status,
          row.paymentStatus,
          row.method,
          row.invoiceNumber,
          row.refundedAt,
          row.paymentIntentId,
        ])
      );
    } else {
      const rows = payoutsQuery.data?.items ?? [];
      downloadCsv(
        `influverse-payouts-${stamp}-p${currentPage}.csv`,
        ['Payout', 'Order', 'Title', 'Creator', 'Amount (EUR)', 'Status', 'Attempts', 'Stripe transfer', 'Failure', 'Paid at', 'Created at'],
        rows.map((row) => [
          row.code,
          row.orderCode,
          row.title,
          row.creator?.name,
          (row.amountCents / 100).toFixed(2),
          row.status,
          row.attempts,
          row.stripeTransferId,
          row.failureMessage,
          row.paidAt,
          row.createdAt,
        ])
      );
    }
  };

  const rowsOnPage = activeQuery.data?.items.length ?? 0;
  const columnCount = activeTab === 'payments' ? 8 : 7;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Transactions"
        subtitle="Marketplace settlements and financial transaction records."
        actions={
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download className="w-3.5 h-3.5" />}
            onClick={exportCurrentPage}
            disabled={rowsOnPage === 0}
            title="Download the rows on this page as CSV"
          >
            Export CSV
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Gross Volume"
          value={formatCents(stats?.collectedCents)}
          icon={<Euro className="w-5 h-5" />}
          accentColor="black"
          subtitle={stats ? `${formatCents(stats.heldCents)} more on card holds` : 'Captured brand payments'}
        />
        <StatCard
          title="Platform Fees"
          value={formatCents(stats?.platformFeesCents)}
          icon={<Receipt className="w-5 h-5" />}
          accentColor="pink"
          subtitle="From captured payments"
        />
        <StatCard
          title="Payouts"
          value={formatCents(stats?.paidOutCents)}
          icon={<ArrowUpRight className="w-5 h-5" />}
          accentColor="emerald"
          subtitle={stats ? `${formatCents(stats.payoutsPendingCents)} not paid out yet` : 'Paid to creators'}
        />
        <StatCard
          title="Refunds"
          value={formatCents(stats?.refundedCents)}
          icon={<ArrowDownLeft className="w-5 h-5" />}
          accentColor="amber"
          subtitle="Returned to brands"
        />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <FilterTabs<TransactionTab>
          value={activeTab}
          onChange={switchTab}
          tabs={[
            { value: 'payments', label: 'Brand payments' },
            { value: 'payouts', label: 'Creator payouts' },
          ]}
        />
        {/* The server searches payments by their database id only (the TXN- reference is display-only). */}
        <SubmitSearch
          key={activeTab}
          value={search}
          onSubmit={(value) => {
            setSearch(value);
            setCurrentPage(1);
          }}
          placeholder={activeTab === 'payments' ? 'Payment ID (24 characters, Enter)' : 'Payout or order code (Enter)'}
          validate={(value) =>
            activeTab === 'payments' && !OBJECT_ID_PATTERN.test(value)
              ? 'Payments are searched by their 24-character payment ID.'
              : null
          }
        />
      </div>

      <Card
        className={`border-neutral-200/80 overflow-hidden ${activeQuery.isFetching && !activeQuery.isLoading ? 'opacity-70 transition-opacity' : ''}`}
      >
        <Table>
          <TableHeader>
            {activeTab === 'payments' ? (
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Creator</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Fee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            ) : (
              <TableRow>
                <TableHead>Payout</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Creator</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Stripe transfer</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            )}
          </TableHeader>
          <TableBody>
            {activeQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-400 mx-auto" />
                </TableCell>
              </TableRow>
            ) : activeQuery.isError ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center py-12 text-neutral-500">
                  <div className="max-w-xs mx-auto space-y-2">
                    <p className="font-bold text-neutral-900">Could not load transactions</p>
                    <p className="text-xs text-neutral-400">{getErrorMessage(activeQuery.error)}</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => activeQuery.refetch()}>
                      Try Again
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : rowsOnPage === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="p-6">
                  <EmptyState
                    icon={<Receipt className="w-6 h-6" />}
                    title={search ? 'No matching transactions' : activeTab === 'payments' ? 'No payments yet' : 'No payouts yet'}
                    description={
                      search
                        ? 'Check the ID or code and try again.'
                        : 'Escrow deposits, payouts and refunds will be listed here once payments go live.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : activeTab === 'payments' ? (
              (paymentsQuery.data?.items ?? []).map((row) => <PaymentTableRow key={row.paymentId} row={row} />)
            ) : (
              (payoutsQuery.data?.items ?? []).map((row) => <PayoutTableRow key={row.id} row={row} />)
            )}
          </TableBody>
        </Table>

        <div className="border-t border-neutral-100 px-4 py-1.5">
          <Pagination
            currentPage={currentPage}
            totalPages={meta?.totalPages || 1}
            totalItems={meta?.total ?? 0}
            pageSize={pageSize}
            pageSizeOptions={[10, 20, 50]}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            itemLabel={activeTab}
          />
        </div>
      </Card>
    </div>
  );
};

const PaymentTableRow: React.FC<{ row: AdminPaymentRow }> = ({ row }) => (
  <TableRow>
    <TableCell>
      <div className="text-xs font-mono font-bold text-neutral-800" title={`Payment ID ${row.paymentId}`}>
        {row.id}
      </div>
      <div className="text-[11px] text-neutral-500 font-semibold">
        {PAYMENT_PURPOSE_LABEL[row.purpose] ?? row.purpose} Â· {row.invoiceNumber}
      </div>
    </TableCell>
    <TableCell className="max-w-[220px]">
      <div className="text-xs font-mono font-bold text-neutral-800">{row.orderCode ?? 'â€”'}</div>
      <div className="text-xs text-neutral-500 font-semibold truncate" title={row.campaignTitle}>
        {row.campaignTitle}
      </div>
    </TableCell>
    <TableCell>
      <PartyCell party={row.brand} fallback="Deleted brand" />
    </TableCell>
    <TableCell>
      <PartyCell party={row.creator} fallback={row.creatorName} />
    </TableCell>
    <TableCell className="text-right tabular-nums font-extrabold">
      {formatCents(row.amountCents)}
      <div className="text-[11px] text-neutral-500 font-semibold">creator {formatCents(row.payoutCents)}</div>
    </TableCell>
    <TableCell className="text-right tabular-nums text-neutral-700">{formatCents(row.feeCents)}</TableCell>
    <TableCell>
      <Badge variant={PAYMENT_STATUS_VARIANT[row.status]} size="sm" dot>
        {humanizeStatus(row.status)}
      </Badge>
      <div className="text-[11px] text-neutral-500 font-semibold mt-1">
        {row.method}
        {row.refundedAt && ` Â· refunded ${formatDate(row.refundedAt)}`}
      </div>
    </TableCell>
    <TableCell className="text-neutral-600 text-sm font-semibold whitespace-nowrap" title={formatDateTime(row.date)}>
      {formatDate(row.date)}
    </TableCell>
  </TableRow>
);

const PayoutTableRow: React.FC<{ row: AdminPayoutRow }> = ({ row }) => {
  const [retryPayout, { isLoading }] = useRetryAdminPayoutMutation();
  const [retryError, setRetryError] = useState<string | null>(null);
  const handleRetry = async () => {
    setRetryError(null);
    try {
      await retryPayout(row.id).unwrap();
    } catch (error) {
      setRetryError(getErrorMessage(error, 'Could not retry this payout.'));
    }
  };

  return <TableRow>
    <TableCell>
      <div className="text-xs font-mono font-bold text-neutral-800">{row.code}</div>
      {row.attempts > 1 && <div className="text-[11px] text-neutral-500 font-semibold">{row.attempts} attempts</div>}
    </TableCell>
    <TableCell className="max-w-[220px]">
      <div className="text-xs font-mono font-bold text-neutral-800">{row.orderCode}</div>
      <div className="text-xs text-neutral-500 font-semibold truncate" title={row.title}>
        {row.title}
      </div>
    </TableCell>
    <TableCell>
      <PartyCell party={row.creator} fallback="Deleted creator" />
    </TableCell>
    <TableCell className="text-right tabular-nums font-extrabold">{formatCents(row.amountCents)}</TableCell>
    <TableCell className="max-w-[240px]">
      <Badge variant={PAYOUT_STATUS_VARIANT[row.status]} size="sm" dot>
        {row.status}
      </Badge>
      {/* Stripe's failure reason, so support can explain a missing payout to the creator. */}
      {row.status === 'failed' && row.failureMessage && (
        <div className="mt-1 flex items-start gap-1 text-[11px] text-rose-700 font-semibold">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="break-words">{row.failureMessage}</span>
        </div>
      )}
    </TableCell>
    <TableCell className="text-xs font-mono text-neutral-600">
      {row.stripeTransferId ?? '—'}
      {row.status === 'failed' && (
        <div className="mt-2">
          <Button size="sm" variant="outline" leftIcon={<RotateCw className="w-3 h-3" />} isLoading={isLoading} onClick={handleRetry}>
            Retry payout
          </Button>
          {retryError && <div className="mt-1 max-w-48 whitespace-normal text-[11px] text-rose-700">{retryError}</div>}
        </div>
      )}
    </TableCell>
    <TableCell className="text-neutral-600 text-sm font-semibold whitespace-nowrap">
      {formatDate(row.paidAt ?? row.createdAt)}
      <div className="text-[11px] text-neutral-500">{row.paidAt ? 'paid' : 'created'}</div>
    </TableCell>
  </TableRow>;
};

export default TransactionsPage;
