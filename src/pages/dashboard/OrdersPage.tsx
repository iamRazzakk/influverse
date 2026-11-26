import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShoppingBag, Clock, AlertTriangle, CheckCircle2, Loader2, Star, Eye } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { PartyCell } from '@/components/shared/PartyCell';
import { DetailRow, FilterTabs, SubmitSearch } from '@/components/shared/ListControls';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { OrderStatusBadge } from '@/components/shared/OrderStatusBadge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { getErrorMessage } from '@/lib/api/baseApi';
import { ADMIN_ORDER_STATUSES, useGetAdminOrdersQuery, type AdminOrder, type AdminOrderStatus } from '@/lib/api/ordersApi';
import { formatCents, formatDate, formatDateTime, formatNumber, humanizeStatus } from '@/lib/utils';

type StatusFilter = 'all' | AdminOrderStatus;

const COLUMN_COUNT = 7;

/**
 * Orders — read-only view of every order (escrow contract between a brand and a creator).
 * Data: GET /admin/orders. Opening `/orders?q=ORD-10001` (e.g. from a support ticket) pre-fills the search.
 */
export const OrdersPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') ?? '';

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);

  const { data, isLoading, isFetching, isError, error, refetch } = useGetAdminOrdersQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    q: search || undefined,
    page: currentPage,
    limit: pageSize,
  });
  const orders = data?.items ?? [];
  const counts = data?.stats;

  // Header cards group the raw status counts into what an operator cares about.
  const activeCount = counts ? counts.awaiting_payment + counts.in_production + counts.deliverable_submitted : undefined;
  const completedCount = counts ? counts.approved + counts.completed : undefined;
  const totalCount = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : undefined;
  const showCount = (n?: number) => (n === undefined ? '—' : formatNumber(n));

  const applySearch = (value: string) => {
    setCurrentPage(1);
    setSearchParams(value ? { q: value.toUpperCase() } : {}, { replace: true });
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader title="Orders" subtitle="Track active contracts, escrow status, and delivery milestones." />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Active Orders"
          value={showCount(activeCount)}
          icon={<ShoppingBag className="w-5 h-5" />}
          accentColor="black"
          subtitle="Awaiting payment, in production or delivered"
        />
        <StatCard
          title="Awaiting Review"
          value={showCount(counts?.deliverable_submitted)}
          icon={<Clock className="w-5 h-5" />}
          accentColor="amber"
          subtitle="Delivered, waiting for the brand"
        />
        <StatCard
          title="On Hold"
          value={showCount(counts?.disputed)}
          icon={<AlertTriangle className="w-5 h-5" />}
          accentColor="pink"
          subtitle="Support ticket open, escrow locked"
        />
        <StatCard
          title="Completed"
          value={showCount(completedCount)}
          icon={<CheckCircle2 className="w-5 h-5" />}
          accentColor="emerald"
          subtitle="Approved, escrow released"
        />
      </div>

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <FilterTabs<StatusFilter>
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value);
            setCurrentPage(1);
          }}
          tabs={[
            { value: 'all', label: 'All', count: totalCount },
            ...ADMIN_ORDER_STATUSES.map((status) => ({ value: status, label: status === 'disputed' ? 'on hold' : humanizeStatus(status), count: counts?.[status] })),
          ]}
        />
        <SubmitSearch value={search} onSubmit={applySearch} placeholder="Order code, e.g. ORD-10001 (Enter)" />
      </div>

      <Card className={`border-neutral-200/80 overflow-hidden ${isFetching && !isLoading ? 'opacity-70 transition-opacity' : ''}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Creator</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="text-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-400 mx-auto" />
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="text-center py-12 text-neutral-500">
                  <div className="max-w-xs mx-auto space-y-2">
                    <p className="font-bold text-neutral-900">Could not load orders</p>
                    <p className="text-xs text-neutral-400">{getErrorMessage(error)}</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
                      Try Again
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="p-6">
                  <EmptyState
                    icon={<ShoppingBag className="w-6 h-6" />}
                    title={search || statusFilter !== 'all' ? 'No matching orders' : 'No orders yet'}
                    description={
                      search || statusFilter !== 'all'
                        ? 'Try another status or order code.'
                        : 'Orders appear here as soon as brands start hiring creators.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id} className="cursor-pointer" onClick={() => setSelectedOrder(order)}>
                  <TableCell className="max-w-[260px]">
                    <div className="text-xs font-mono font-bold text-neutral-800">{order.code}</div>
                    <div className="text-xs text-neutral-500 font-semibold truncate" title={order.title}>
                      {order.title}
                    </div>
                  </TableCell>
                  <TableCell>
                    <PartyCell party={order.brand} fallback="Deleted brand" />
                  </TableCell>
                  <TableCell>
                    <PartyCell party={order.creator} fallback="Deleted creator" />
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-extrabold">{formatCents(order.totalCents)}</TableCell>
                  <TableCell>
                    <OrderStatusBadge status={order.status} />
                  </TableCell>
                  <TableCell className="text-neutral-600 text-sm font-semibold whitespace-nowrap">{formatDate(order.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Eye className="w-3.5 h-3.5" />}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedOrder(order);
                      }}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="border-t border-neutral-100 px-4 py-1.5">
          <Pagination
            currentPage={currentPage}
            totalPages={data?.meta.totalPages || 1}
            totalItems={data?.meta.total ?? 0}
            pageSize={pageSize}
            pageSizeOptions={[10, 20, 50]}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            itemLabel="orders"
          />
        </div>
      </Card>

      {selectedOrder && <OrderDetailsModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </div>
  );
};

/** Everything the list returns for one order: parties, money split, timeline and the brand's review. */
const OrderDetailsModal: React.FC<{ order: AdminOrder; onClose: () => void }> = ({ order, onClose }) => {
  // Only the steps that actually happened are shown, in lifecycle order.
  const timeline: { label: string; at: string | null }[] = [
    { label: 'Created', at: order.createdAt },
    { label: 'Paid (escrow funded)', at: order.paidAt },
    { label: 'Due', at: order.dueAt },
    { label: 'Delivered', at: order.deliveredAt },
    { label: 'Review due', at: order.reviewDueAt },
    { label: order.autoApproved ? 'Auto-approved' : 'Approved', at: order.approvedAt },
    { label: 'Completed', at: order.completedAt },
    { label: 'Cancelled', at: order.cancelledAt },
  ].filter((step) => step.at);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      maxWidth="lg"
      title={
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-neutral-900 font-mono">{order.code}</span>
          <OrderStatusBadge status={order.status} />
        </div>
      }
      description={order.title}
      footer={
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2">
            <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider block">Brand</span>
            <PartyCell party={order.brand} fallback="Deleted brand" />
          </div>
          <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2">
            <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider block">Creator</span>
            <PartyCell party={order.creator} fallback="Deleted creator" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Money breakdown */}
          <div className="p-3.5 bg-white rounded-xl border border-neutral-200 space-y-2">
            <span className="font-bold text-neutral-900 block">Payment</span>
            <DetailRow label="Creator price">{formatCents(order.priceCents)}</DetailRow>
            <DetailRow label={`Platform fee (${order.platformFeePercent}%)`}>{formatCents(order.feeCents)}</DetailRow>
            <DetailRow label="Brand paid" className="pt-2 border-t border-neutral-100">
              <span className="text-sm font-black">{formatCents(order.totalCents)}</span>
            </DetailRow>
            <DetailRow label="Escrow">
              {order.escrowReleased ? (
                <Badge variant="success" size="sm">Released</Badge>
              ) : order.status === 'cancelled' ? (
                <Badge variant="danger" size="sm">Not held</Badge>
              ) : order.paidAt ? (
                <Badge variant="warning" size="sm">Held</Badge>
              ) : (
                <Badge variant="neutral" size="sm">Not funded</Badge>
              )}
            </DetailRow>
          </div>

          {/* Scope */}
          <div className="p-3.5 bg-white rounded-xl border border-neutral-200 space-y-2">
            <span className="font-bold text-neutral-900 block">Scope</span>
            <DetailRow label="Platforms">{order.platforms.length ? order.platforms.join(', ') : '—'}</DetailRow>
            <DetailRow label="Delivery time">{order.deliveryDays} days</DetailRow>
            <DetailRow label="Deliverables submitted">{order.deliverablesCount}</DetailRow>
            <DetailRow label="Revisions requested">{order.revisionCount}</DetailRow>
          </div>
        </div>

        {order.brief && (
          <div className="p-3.5 bg-white rounded-xl border border-neutral-200 space-y-1">
            <span className="font-bold text-neutral-900 block">Brief</span>
            <p className="text-neutral-700 leading-relaxed whitespace-pre-line">{order.brief}</p>
          </div>
        )}

        {/* Timeline */}
        <div className="p-3.5 bg-white rounded-xl border border-neutral-200 space-y-2">
          <span className="font-bold text-neutral-900 block">Timeline</span>
          <ol className="space-y-1.5">
            {timeline.map((step) => (
              <li key={step.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-neutral-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 shrink-0" />
                  {step.label}
                </span>
                <span className="font-bold text-neutral-950">{formatDateTime(step.at)}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Review */}
        {order.review && (
          <div className="p-3.5 bg-white rounded-xl border border-neutral-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-neutral-900">Brand review</span>
              <span className="flex items-center gap-0.5" title={`${order.review.rating} / 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`w-3.5 h-3.5 ${n <= order.review!.rating ? 'text-amber-500 fill-amber-500' : 'text-neutral-300'}`}
                  />
                ))}
              </span>
            </div>
            {order.review.comment && <p className="text-neutral-700 leading-relaxed whitespace-pre-line">{order.review.comment}</p>}
            <p className="text-[11px] text-neutral-400">{formatDate(order.review.createdAt)}</p>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default OrdersPage;
