import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useApproveCreatorMutation,
  useGetUserQuery,
  useGetUsersQuery,
  useReactivateUserMutation,
  useRequestCreatorChangesMutation,
  useSetCreatorFeaturedMutation,
  useSuspendUserMutation,
  type UserSort,
} from '@/lib/api/usersApi';
import { getErrorMessage } from '@/lib/api/baseApi';
import { BanActionType, CreatorApprovalStatus, MarketplaceUser, UserStatus } from '@/types/admin.types';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Textarea } from '@/components/ui/Textarea';
import { Pagination } from '@/components/ui/Pagination';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Ban,
  RotateCcw,
  Eye,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  ChevronDown,
  BadgeCheck,
  Search,
  Loader2,
  Star,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';

type RoleFilter = 'all' | 'creator' | 'brand';
type StatusFilter = 'all' | UserStatus;
type ApprovalFilter = 'all' | CreatorApprovalStatus;
type SortField = 'name' | 'volume' | 'deals' | 'joined';

const SUSPENSION_REASONS = [
  { value: 'Attempted off-platform payment to circumvent the platform escrow fee.', label: 'Escrow Fee Circumvention (Off-platform deal attempt)' },
  { value: 'Repeated non-delivery of deliverables within deadline.', label: 'Delinquent Deliverable Default (Breach of Campaign SLA)' },
  { value: 'Fabricated portfolio metrics and fraudulent follower graph.', label: 'Fraudulent Metrics / Bot Engagement' },
  { value: 'Abusive or defamatory communication with counterpart.', label: 'Harassment & Unprofessional Conduct' },
  { value: 'Unauthorized brand asset disclosure before embargo release.', label: 'Confidentiality & NDA Breach' },
];

const ACTION_TYPES: { value: BanActionType; label: string; hint: string }[] = [
  { value: 'warning', label: 'Warning', hint: 'Notify only, account keeps working' },
  { value: 'temporary', label: 'Temporary', hint: 'Suspended until a date, lifted automatically' },
  { value: 'permanent', label: 'Permanent', hint: 'Suspended until an admin reactivates' },
];

const STATUS_LABEL: Record<UserStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  deactivation_scheduled: 'Deactivating',
  deactivated: 'Deactivated',
};

const APPROVAL_LABEL: Record<CreatorApprovalStatus, string> = {
  under_review: 'Under review',
  approved: 'Approved',
  action_required: 'Action required',
};

const selectClass =
  'h-9 pl-3 pr-8 text-xs font-bold bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-800 outline-none focus:border-brand-pink cursor-pointer appearance-none shadow-2xs';

/** Money from the server is integer cents. */
const formatCents = (cents: number) => formatCurrency(cents / 100);

/** "@handle" for creators, company name for brands, otherwise the user code. */
const secondaryLabel = (user: Pick<MarketplaceUser, 'handle' | 'companyName' | 'code'>) =>
  user.handle ? `@${user.handle}` : user.companyName || user.code;

/** Waits until the admin stops typing before the value is used for a request. */
const useDebouncedValue = <T,>(value: T, delayMs = 350) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
};

/** Default end date for a temporary suspension (one week from today) as an `<input type="date">` value. */
const defaultSuspendUntil = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
};

export const UsersPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters, sorting & pagination — all applied by the server.
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('all');
  const [sortBy, setSortBy] = useState<UserSort>('recent');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // The server search needs at least 2 characters.
  const debouncedSearch = useDebouncedValue(searchQuery.trim());
  const searchTerm = debouncedSearch.length >= 2 ? debouncedSearch : undefined;

  const { data, isLoading, isFetching, isError, error, refetch } = useGetUsersQuery({
    role: roleFilter === 'all' ? undefined : roleFilter,
    status: statusFilter === 'all' ? undefined : statusFilter,
    approval: approvalFilter === 'all' ? undefined : approvalFilter,
    q: searchTerm,
    sort: sortBy,
    page: currentPage,
    limit: pageSize,
  });
  const users = data?.items ?? [];
  const totalItems = data?.meta.total ?? 0;
  const totalPages = data?.meta.totalPages || 1;

  // Suspend modal state
  const [selectedUserForModeration, setSelectedUserForModeration] = useState<MarketplaceUser | null>(null);
  const [actionType, setActionType] = useState<BanActionType>('temporary');
  const [banReason, setBanReason] = useState(SUSPENSION_REASONS[0].value);
  const [escrowDisposition, setEscrowDisposition] = useState<'hold' | 'refund'>('hold');
  const [suspendUntil, setSuspendUntil] = useState(defaultSuspendUntil());
  const [auditNotes, setAuditNotes] = useState('');
  const [moderationError, setModerationError] = useState('');

  // User inspector — opened from the table, or a `?creator=<id>` / `?user=<id>` link (admin notifications).
  const inspectedUserId = searchParams.get('creator') || searchParams.get('user');
  const openInspector = (id: string) => setSearchParams({ user: id }, { replace: true });
  const closeInspector = () => setSearchParams({}, { replace: true });

  const [userToReactivate, setUserToReactivate] = useState<MarketplaceUser | null>(null);
  const [actionError, setActionError] = useState('');

  const [suspendUser, { isLoading: isSuspending }] = useSuspendUserMutation();
  const [reactivateUser, { isLoading: isReactivating }] = useReactivateUserMutation();

  const resetFilters = () => {
    setSearchQuery('');
    setRoleFilter('all');
    setStatusFilter('all');
    setApprovalFilter('all');
    setCurrentPage(1);
  };

  // Column header sort toggle
  const handleSort = (field: SortField) => {
    setCurrentPage(1);
    if (field === 'name') setSortBy((prev) => (prev === 'name_asc' ? 'name_desc' : 'name_asc'));
    else if (field === 'volume') setSortBy((prev) => (prev === 'volume_desc' ? 'volume_asc' : 'volume_desc'));
    else if (field === 'deals') setSortBy((prev) => (prev === 'deals_desc' ? 'deals_asc' : 'deals_desc'));
    else setSortBy((prev) => (prev === 'recent' ? 'oldest' : 'recent'));
  };

  const renderSortIcon = (field: SortField) => {
    const down = <ArrowDown className="w-3.5 h-3.5 text-neutral-900" />;
    const up = <ArrowUp className="w-3.5 h-3.5 text-neutral-900" />;
    if (field === 'name' && sortBy === 'name_asc') return up;
    if (field === 'name' && sortBy === 'name_desc') return down;
    if (field === 'volume' && sortBy === 'volume_desc') return down;
    if (field === 'volume' && sortBy === 'volume_asc') return up;
    if (field === 'deals' && sortBy === 'deals_desc') return down;
    if (field === 'deals' && sortBy === 'deals_asc') return up;
    if (field === 'joined' && sortBy === 'recent') return down;
    if (field === 'joined' && sortBy === 'oldest') return up;
    return <ArrowUpDown className="w-3 h-3 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity" />;
  };

  const handleOpenModeration = (user: MarketplaceUser) => {
    setSelectedUserForModeration(user);
    setActionType('temporary');
    setBanReason(SUSPENSION_REASONS[0].value);
    setEscrowDisposition('hold');
    setSuspendUntil(defaultSuspendUntil());
    setAuditNotes('');
    setModerationError('');
  };

  const handleExecuteModeration = async () => {
    if (!selectedUserForModeration) return;
    setModerationError('');
    try {
      await suspendUser({
        id: selectedUserForModeration.id,
        actionType,
        reason: banReason,
        escrowDisposition,
        notes: auditNotes.trim() || undefined,
        // End of the chosen day, so "until the 20th" includes the 20th.
        until: actionType === 'temporary' ? new Date(`${suspendUntil}T23:59:59`).toISOString() : undefined,
      }).unwrap();
      setSelectedUserForModeration(null);
    } catch (err) {
      setModerationError(getErrorMessage(err));
    }
  };

  const handleReactivate = async (userId: string) => {
    setActionError('');
    try {
      await reactivateUser(userId).unwrap();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setUserToReactivate(null);
    }
  };

  const sortableHead = (field: SortField, label: string) => (
    <TableHead className="cursor-pointer hover:text-neutral-950 transition-colors select-none group" onClick={() => handleSort(field)}>
      <div className="flex items-center gap-1.5">
        <span>{label}</span>
        {renderSortIcon(field)}
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Users" subtitle="Manage registered creators and brand accounts." />

      {/* Control Panel: Filters, Search & Sorting */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Role Filter Tabs (All / Creators / Brands) */}
          <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl self-start">
            {[
              { label: 'All', value: 'all' as const },
              { label: 'Creators', value: 'creator' as const },
              { label: 'Brands', value: 'brand' as const },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  setRoleFilter(tab.value);
                  if (tab.value === 'brand') setApprovalFilter('all');
                  setCurrentPage(1);
                }}
                className={`px-4 py-2 text-sm font-bold rounded-lg transition-all cursor-pointer ${
                  roleFilter === tab.value ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 flex-1 lg:justify-end">
            {/* Search Input with Clear Button */}
            <div className="relative flex-1 sm:w-64 lg:w-72 lg:flex-none">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search name, email or USR- code..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full h-9 pl-9 pr-8 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-pink/20 focus:border-brand-pink text-neutral-900 placeholder:text-neutral-400 transition-all font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-0.5 rounded transition-colors"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as UserSort);
                  setCurrentPage(1);
                }}
                className={selectClass}
                title="Sort directory"
              >
                <option value="recent">Sort: Recently Joined</option>
                <option value="oldest">Sort: Oldest Joined</option>
                <option value="volume_desc">Sort: Highest Volume (€)</option>
                <option value="volume_asc">Sort: Lowest Volume (€)</option>
                <option value="deals_desc">Sort: Most Campaigns</option>
                <option value="deals_asc">Sort: Fewest Campaigns</option>
                <option value="name_asc">Sort: Name (A → Z)</option>
                <option value="name_desc">Sort: Name (Z → A)</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Status Dropdown Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as StatusFilter);
                  setCurrentPage(1);
                }}
                className={selectClass}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="deactivation_scheduled">Deactivating</option>
                <option value="deactivated">Deactivated</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Creator approval queue filter (only meaningful for creators) */}
            {roleFilter !== 'brand' && (
              <div className="relative">
                <select
                  value={approvalFilter}
                  onChange={(e) => {
                    setApprovalFilter(e.target.value as ApprovalFilter);
                    setCurrentPage(1);
                  }}
                  className={selectClass}
                  title="Creator approval"
                >
                  <option value="all">All Approval</option>
                  <option value="under_review">Under review</option>
                  <option value="action_required">Action required</option>
                  <option value="approved">Approved</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}
          </div>
        </div>
      </Card>

      {actionError && (
        <div className="p-3 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError('')} className="p-0.5" title="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Users Directory Table */}
      <Card className={isFetching && !isLoading ? 'opacity-70 transition-opacity' : undefined}>
        <Table>
          <TableHeader>
            <TableRow>
              {sortableHead('name', 'User')}
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              {sortableHead('volume', 'Volume')}
              {sortableHead('deals', 'Deals')}
              {sortableHead('joined', 'Joined')}
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-400 mx-auto" />
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-neutral-500">
                  <div className="max-w-xs mx-auto space-y-2">
                    <p className="font-bold text-neutral-900">Could not load users</p>
                    <p className="text-xs text-neutral-400">{getErrorMessage(error)}</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
                      Try Again
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-neutral-500">
                  <div className="max-w-xs mx-auto space-y-2">
                    <p className="font-bold text-neutral-900">No matching accounts found</p>
                    <p className="text-xs text-neutral-400">Try adjusting your search keywords, role filters, or status selection.</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={resetFilters}>
                      Reset All Filters
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={user.avatar}
                        name={user.name}
                        size="sm"
                        className="cursor-pointer hover:ring-2 hover:ring-brand-pink/50 transition-all shrink-0"
                        onClick={() => openInspector(user.id)}
                        title={`${user.name} (${secondaryLabel(user)})`}
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="font-bold text-neutral-900 text-sm block cursor-pointer hover:text-brand-pink transition-colors truncate max-w-[170px]"
                            onClick={() => openInspector(user.id)}
                          >
                            {user.name}
                          </span>
                          {user.isVerified && (
                            <span title="Verified" className="inline-flex shrink-0">
                              <BadgeCheck className="w-4 h-4 text-sky-500 fill-sky-500/15" />
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-neutral-500 font-medium">{secondaryLabel(user)}</span>
                        {user.approvalStatus && user.approvalStatus !== 'approved' && (
                          <span
                            className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              user.approvalStatus === 'under_review' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {APPROVAL_LABEL[user.approvalStatus]}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge variant={user.role === 'creator' ? 'pink' : 'neutral'} size="sm">
                      {user.role}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <Badge variant={user.status === 'active' ? 'success' : 'warning'} size="sm" dot>
                      {STATUS_LABEL[user.status] ?? user.status}
                    </Badge>
                  </TableCell>

                  <TableCell className="font-black text-neutral-950 tabular-nums text-sm">
                    {formatCents(user.totalVolumeCents)}
                  </TableCell>

                  <TableCell className="text-neutral-800 tabular-nums font-bold">{user.ordersCount} campaigns</TableCell>

                  <TableCell className="text-neutral-600 text-sm font-semibold">{formatDate(user.joinedAt)}</TableCell>

                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openInspector(user.id)} title="View Full Profile">
                        <Eye className="w-3.5 h-3.5" />
                      </Button>

                      {user.status === 'suspended' ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-bold text-xs"
                          onClick={() => setUserToReactivate(user)}
                        >
                          <RotateCcw className="w-3.5 h-3.5 mr-1" />
                          Reactivate
                        </Button>
                      ) : user.status === 'deactivated' ? null : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-amber-700 border-amber-200 hover:bg-amber-50 font-bold text-xs"
                          onClick={() => handleOpenModeration(user)}
                        >
                          <Ban className="w-3.5 h-3.5 mr-1" />
                          Suspend
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Bottom Pagination Bar */}
        <div className="border-t border-neutral-100 px-4 py-1.5">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            pageSizeOptions={[10, 20, 50, 100]}
            onPageChange={(page) => setCurrentPage(page)}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            itemLabel="accounts"
          />
        </div>
      </Card>

      {/* Suspend Account Modal */}
      {selectedUserForModeration && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedUserForModeration(null)}
          title={`Moderate Account: ${secondaryLabel(selectedUserForModeration)}`}
          description={`Warn or restrict platform access for ${selectedUserForModeration.name}. All sessions are signed out on suspension.`}
          maxWidth="md"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setSelectedUserForModeration(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" className="font-bold" onClick={handleExecuteModeration} isLoading={isSuspending}>
                {actionType === 'warning' ? 'Send Warning' : 'Confirm Suspension'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {moderationError && (
              <div className="p-3 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">{moderationError}</div>
            )}

            {/* Action Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-700">Action</label>
              <div className="grid grid-cols-3 gap-2">
                {ACTION_TYPES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setActionType(option.value)}
                    title={option.hint}
                    className={`p-2.5 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                      actionType === option.value
                        ? 'border-brand-pink bg-pink-50 text-neutral-900 font-bold'
                        : 'border-neutral-200 bg-white text-neutral-600'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-neutral-500">{ACTION_TYPES.find((a) => a.value === actionType)?.hint}</p>
            </div>

            {actionType === 'temporary' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-700">Suspended Until</label>
                <input
                  type="date"
                  value={suspendUntil}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setSuspendUntil(e.target.value)}
                  className="w-full h-10 px-3 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-brand-pink text-neutral-800 font-semibold"
                />
              </div>
            )}

            {/* Violation Reason */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-700">Primary Reason / Policy Violation</label>
              <div className="relative">
                <select
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="w-full h-10 pl-3 pr-8 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-brand-pink appearance-none cursor-pointer text-neutral-800 font-semibold"
                >
                  {SUSPENSION_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Escrow Disposition */}
            {actionType !== 'warning' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-700">Current Escrow Funds Handling</label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: 'hold', label: 'Lock in Trust Hold' },
                      { value: 'refund', label: 'Automate Full Refund' },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setEscrowDisposition(option.value)}
                      className={`p-2.5 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                        escrowDisposition === option.value
                          ? 'border-brand-pink bg-pink-50 text-neutral-900 font-bold'
                          : 'border-neutral-200 bg-white text-neutral-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Internal Audit Notes */}
            <Textarea
              label="Internal Security Log (Private to Admins)"
              placeholder="Provide evidence links, chat screenshots, or transaction hashes for future audit..."
              value={auditNotes}
              onChange={(e) => setAuditNotes(e.target.value)}
            />
          </div>
        </Modal>
      )}

      {/* User Details Modal */}
      {inspectedUserId && <UserInspector userId={inspectedUserId} onClose={closeInspector} />}

      {/* Confirm Reactivate User Dialog */}
      <ConfirmDialog
        isOpen={Boolean(userToReactivate)}
        onClose={() => setUserToReactivate(null)}
        onConfirm={() => {
          if (userToReactivate) void handleReactivate(userToReactivate.id);
        }}
        isLoading={isReactivating}
        title="Reactivate User Account"
        description={`Are you sure you want to restore marketplace access for ${userToReactivate?.name} (${
          userToReactivate ? secondaryLabel(userToReactivate) : ''
        })? They will immediately be able to log in again.`}
        variant="info"
        confirmLabel="Reactivate Account"
      />
    </div>
  );
};

/**
 * Full user profile (GET /admin/users/:id) with creator review actions:
 * approve onboarding, ask for changes, and feature on the homepage.
 */
const UserInspector: React.FC<{ userId: string; onClose: () => void }> = ({ userId, onClose }) => {
  const { data: user, isLoading, isError, error } = useGetUserQuery(userId);
  const [approveCreator, { isLoading: isApproving }] = useApproveCreatorMutation();
  const [requestChanges, { isLoading: isRequesting }] = useRequestCreatorChangesMutation();
  const [setFeatured, { isLoading: isFeaturing }] = useSetCreatorFeaturedMutation();

  const [changesNote, setChangesNote] = useState('');
  const [showChangesForm, setShowChangesForm] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const run = async (action: () => Promise<unknown>) => {
    setReviewError('');
    try {
      await action();
      setShowChangesForm(false);
      setChangesNote('');
    } catch (err) {
      setReviewError(getErrorMessage(err));
    }
  };

  const isCreator = user?.role === 'creator';
  const isFeatured = Boolean(user?.profile?.isFeatured);
  const bio = typeof user?.profile?.bio === 'string' ? user.profile.bio : '';

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={
        user ? (
          <div className="flex items-center gap-3">
            <Avatar src={user.avatar} name={user.name} size="md" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-extrabold text-neutral-950">{user.name}</h3>
                {user.isVerified && (
                  <span title="Verified" className="inline-flex shrink-0">
                    <BadgeCheck className="w-4 h-4 text-sky-500 fill-sky-500/15" />
                  </span>
                )}
                <Badge variant={user.role === 'creator' ? 'pink' : 'neutral'} size="sm">
                  {user.role}
                </Badge>
                <Badge variant={user.status === 'active' ? 'success' : 'warning'} size="sm" dot>
                  {STATUS_LABEL[user.status] ?? user.status}
                </Badge>
              </div>
              <p className="text-xs text-neutral-500 font-medium mt-0.5">
                {secondaryLabel(user)} • {user.code}
              </p>
            </div>
          </div>
        ) : (
          'User profile'
        )
      }
      maxWidth="lg"
      footer={
        <div className="flex justify-end w-full">
          <Button variant="outline" size="sm" className="font-bold text-xs" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
        </div>
      ) : isError || !user ? (
        <div className="py-8 text-center text-xs text-neutral-500">{getErrorMessage(error, 'User not found.')}</div>
      ) : (
        <div className="space-y-5 text-xs">
          {reviewError && (
            <div className="p-3 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">{reviewError}</div>
          )}

          {/* Key KPI Highlights Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-neutral-50/80 rounded-xl border border-neutral-100">
              <span className="text-[11px] font-bold text-neutral-500 block">Total Volume</span>
              <p className="text-base font-black text-neutral-950 mt-0.5 tabular-nums">{formatCents(user.totalVolumeCents)}</p>
            </div>
            <div className="p-3 bg-neutral-50/80 rounded-xl border border-neutral-100">
              <span className="text-[11px] font-bold text-neutral-500 block">Campaigns</span>
              <p className="text-base font-black text-neutral-950 mt-0.5 tabular-nums">{user.ordersCount}</p>
            </div>
            <div className="p-3 bg-neutral-50/80 rounded-xl border border-neutral-100">
              <span className="text-[11px] font-bold text-neutral-500 block">Location</span>
              <p className="text-xs font-bold text-neutral-900 mt-1 truncate">{user.location || '—'}</p>
            </div>
            <div className="p-3 bg-neutral-50/80 rounded-xl border border-neutral-100">
              <span className="text-[11px] font-bold text-neutral-500 block">Joined</span>
              <p className="text-xs font-bold text-neutral-900 mt-1">{formatDate(user.joinedAt)}</p>
            </div>
          </div>

          {user.ban && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
              <span className="text-xs font-bold text-amber-900 block">
                Account Suspension Notice ({user.ban.type}
                {user.ban.until ? ` until ${formatDate(user.ban.until)}` : ''})
              </span>
              <p className="text-xs text-amber-800">{user.ban.reason}</p>
              {user.ban.notes && <p className="text-[11px] text-amber-700 italic mt-1.5">Internal notes: {user.ban.notes}</p>}
            </div>
          )}

          {/* Creator review (onboarding approval + homepage feature) */}
          {isCreator && (
            <div className="space-y-2">
              <span className="text-xs font-bold text-neutral-800 uppercase tracking-wider block">Creator Review</span>
              <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-600">Approval:</span>
                    <Badge
                      variant={user.approvalStatus === 'approved' ? 'success' : user.approvalStatus === 'action_required' ? 'warning' : 'neutral'}
                      size="sm"
                    >
                      {user.approvalStatus ? APPROVAL_LABEL[user.approvalStatus] : '—'}
                    </Badge>
                    {!user.onboardingCompleted && <span className="text-[11px] text-neutral-400">(onboarding not submitted)</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {user.approvalStatus !== 'approved' && user.onboardingCompleted && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-bold text-xs"
                        isLoading={isApproving}
                        onClick={() => run(() => approveCreator(user.id).unwrap())}
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1" />
                        Approve
                      </Button>
                    )}
                    {user.approvalStatus !== 'action_required' && user.onboardingCompleted && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-amber-700 border-amber-200 hover:bg-amber-50 font-bold text-xs"
                        onClick={() => setShowChangesForm((v) => !v)}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                        Request Changes
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="font-bold text-xs"
                      isLoading={isFeaturing}
                      onClick={() => run(() => setFeatured({ id: user.id, isFeatured: !isFeatured }).unwrap())}
                      title="Show on the website's featured creators section"
                    >
                      <Star className={`w-3.5 h-3.5 mr-1 ${isFeatured ? 'fill-amber-400 text-amber-500' : ''}`} />
                      {isFeatured ? 'Unfeature' : 'Feature'}
                    </Button>
                  </div>
                </div>

                {typeof user.profile?.approvalNote === 'string' && user.approvalStatus === 'action_required' && (
                  <p className="text-[11px] text-amber-700">Last note to creator: {user.profile.approvalNote}</p>
                )}

                {showChangesForm && (
                  <div className="space-y-2">
                    <Textarea
                      label="What should the creator change?"
                      placeholder="e.g. Please add at least one portfolio item and a clearer profile photo."
                      value={changesNote}
                      onChange={(e) => setChangesNote(e.target.value)}
                    />
                    <div className="flex justify-end">
                      <Button
                        variant="primary"
                        size="sm"
                        className="font-bold text-xs"
                        isLoading={isRequesting}
                        disabled={changesNote.trim().length < 3}
                        onClick={() => run(() => requestChanges({ id: user.id, note: changesNote.trim() }).unwrap())}
                      >
                        Send to Creator
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Profile & Account Information */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-neutral-800 uppercase tracking-wider block">Account Details</span>
            <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100 overflow-hidden text-xs">
              <div className="px-4 py-2.5 flex items-center justify-between">
                <span className="font-medium text-neutral-600">{user.role === 'brand' ? 'Company' : 'Category'}</span>
                <span className="font-bold text-neutral-950">{(user.role === 'brand' ? user.companyName : user.category) || '—'}</span>
              </div>
              <div className="px-4 py-2.5 flex items-center justify-between">
                <span className="font-medium text-neutral-600">Contact Email</span>
                <span className="font-bold text-neutral-950">{user.email}</span>
              </div>
              <div className="px-4 py-2.5 flex items-center justify-between">
                <span className="font-medium text-neutral-600">Phone</span>
                <span className="font-bold text-neutral-950">{user.phone || '—'}</span>
              </div>
              {isCreator && (
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="font-medium text-neutral-600">Rating</span>
                  <span className="font-bold text-neutral-950">{user.rating ? user.rating.toFixed(2) : '—'}</span>
                </div>
              )}
              <div className="px-4 py-2.5 flex items-center justify-between">
                <span className="font-medium text-neutral-600">Last Login</span>
                <span className="font-bold text-neutral-950">{user.lastLoginAt ? formatDate(user.lastLoginAt) : '—'}</span>
              </div>
            </div>
          </div>

          {bio && (
            <div className="space-y-2">
              <span className="text-xs font-bold text-neutral-800 uppercase tracking-wider block">Bio</span>
              <p className="text-xs text-neutral-700 leading-relaxed whitespace-pre-line">{bio}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default UsersPage;
