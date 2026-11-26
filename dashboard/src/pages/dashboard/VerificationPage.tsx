import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useApproveVerificationMutation,
  useGetVerificationQuery,
  useGetVerificationsQuery,
  useLazyGetAdminFileUrlQuery,
  useRejectVerificationMutation,
} from '@/lib/api/verificationApi';
import { getErrorMessage } from '@/lib/api/baseApi';
import { VerificationRequest, VerificationStatus } from '@/types/admin.types';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Textarea } from '@/components/ui/Textarea';
import { Pagination } from '@/components/ui/Pagination';
import { formatDate, formatNumber } from '@/lib/utils';
import {
  Eye,
  BadgeCheck,
  Check,
  ExternalLink,
  Globe,
  Video,
  Users,
  TrendingUp,
  Layers,
  Search,
  X,
  Loader2,
  FileText,
} from 'lucide-react';

type StatusFilter = 'all' | VerificationStatus;

const DEFAULT_REJECTION_REASON = 'Profile information or identity could not be verified against platform standards.';

const statusVariant = (status: VerificationStatus) =>
  status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : 'warning';

const creatorName = (request: VerificationRequest) => request.creatorSnapshot?.name || 'Unknown creator';
const creatorHandle = (request: VerificationRequest) => request.creatorSnapshot?.handle || '—';

/** Waits until the admin stops typing before searching. */
const useDebouncedValue = <T,>(value: T, delayMs = 350) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
};

const PLATFORM_LINKS = [
  { key: 'instagram', short: 'IG', label: 'Instagram Profile', className: 'bg-pink-100 text-pink-700' },
  { key: 'tiktok', short: 'TT', label: 'TikTok Profile', className: 'bg-neutral-900 text-white' },
  { key: 'youtube', short: 'YT', label: 'YouTube Channel', className: 'bg-rose-100 text-rose-700' },
] as const;

export const VerificationPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters & pagination — applied by the server. Pending first, since that's the review queue.
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const debouncedSearch = useDebouncedValue(searchQuery.trim());

  const { data, isLoading, isFetching, isError, error, refetch } = useGetVerificationsQuery({
    status: filterStatus === 'all' ? undefined : filterStatus,
    q: debouncedSearch || undefined,
    page: currentPage,
    limit: pageSize,
  });
  const requests = data?.items ?? [];
  const counts = data?.meta.counts ?? {};

  // Details modal — opened from the table or a `?request=<id>` link (admin notification).
  const selectedId = searchParams.get('request');
  const openDetails = (id: string) => setSearchParams({ request: id }, { replace: true });
  const closeDetails = () => setSearchParams({}, { replace: true });

  const [approvingItem, setApprovingItem] = useState<VerificationRequest | null>(null);
  const [rejectingItem, setRejectingItem] = useState<VerificationRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState(DEFAULT_REJECTION_REASON);
  const [actionError, setActionError] = useState('');

  const [approve, { isLoading: isApproving }] = useApproveVerificationMutation();
  const [reject, { isLoading: isRejecting }] = useRejectVerificationMutation();

  const handleApprove = async (id: string) => {
    setActionError('');
    try {
      await approve(id).unwrap();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setApprovingItem(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingItem) return;
    setActionError('');
    try {
      await reject({ id: rejectingItem.id, reason: rejectionReason.trim() }).unwrap();
      setRejectingItem(null);
    } catch (err) {
      setActionError(getErrorMessage(err));
      setRejectingItem(null);
    }
  };

  const openReject = (request: VerificationRequest) => {
    setRejectionReason(DEFAULT_REJECTION_REASON);
    setRejectingItem(request);
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader title="Verifications" subtitle="Review and manage creator verified-badge applications." />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-xl self-start">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setFilterStatus(s);
                setCurrentPage(1);
              }}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all capitalize cursor-pointer flex items-center gap-1.5 ${
                filterStatus === s ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-600 hover:text-neutral-950'
              }`}
            >
              <span>{s}</span>
              {s !== 'all' && counts[s] !== undefined && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-neutral-200/80 text-neutral-700">{counts[s]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative sm:w-72">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search name, @handle or request code..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full h-9 pl-9 pr-8 text-xs bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-pink/20 focus:border-brand-pink text-neutral-900 placeholder:text-neutral-400 font-medium"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-0.5"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="p-3 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError('')} className="p-0.5" title="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Verification Applications Table */}
      <Card className={`border-neutral-200/80 overflow-hidden ${isFetching && !isLoading ? 'opacity-70 transition-opacity' : ''}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Creator</TableHead>
              <TableHead>Request</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Applied</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-400 mx-auto" />
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-neutral-500">
                  <div className="max-w-xs mx-auto space-y-2">
                    <p className="font-bold text-neutral-900">Could not load verification requests</p>
                    <p className="text-xs text-neutral-400">{getErrorMessage(error)}</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
                      Try Again
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-neutral-500 font-medium">
                  No verification applications found.
                </TableCell>
              </TableRow>
            ) : (
              requests.map((request) => (
                <TableRow key={request.id} className="hover:bg-neutral-50/80 transition-colors">
                  {/* Creator */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar src={request.creatorSnapshot?.avatar} name={creatorName(request)} size="sm" />
                      <div>
                        <div className="font-extrabold text-neutral-950 flex items-center gap-1.5 text-sm">
                          <span>{creatorName(request)}</span>
                          {request.status === 'approved' && (
                            <span title="Verified Creator" className="inline-flex">
                              <BadgeCheck className="w-4 h-4 text-sky-500 fill-sky-500/15 shrink-0" />
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-neutral-500 font-semibold">@{creatorHandle(request)}</div>
                      </div>
                    </div>
                  </TableCell>

                  {/* Request code */}
                  <TableCell>
                    <span className="text-xs font-mono font-bold text-neutral-800">{request.code}</span>
                  </TableCell>

                  {/* Category */}
                  <TableCell>
                    {request.creatorSnapshot?.categories?.[0] ? (
                      <Badge variant="neutral" size="sm">
                        {request.creatorSnapshot.categories[0]}
                      </Badge>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </TableCell>

                  {/* Applied */}
                  <TableCell className="text-neutral-600 text-sm font-semibold">{formatDate(request.createdAt)}</TableCell>

                  {/* Status */}
                  <TableCell>
                    <Badge variant={statusVariant(request.status)} size="sm" dot>
                      {request.status}
                    </Badge>
                  </TableCell>

                  {/* Action */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs font-bold flex items-center gap-1.5"
                        onClick={() => openDetails(request.id)}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </Button>
                      {request.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => setApprovingItem(request)}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Bottom Pagination */}
        <div className="border-t border-neutral-100 px-4 py-1.5">
          <Pagination
            currentPage={currentPage}
            totalPages={data?.meta.totalPages || 1}
            totalItems={data?.meta.total ?? 0}
            pageSize={pageSize}
            pageSizeOptions={[10, 20, 50]}
            onPageChange={(page) => setCurrentPage(page)}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            itemLabel="applications"
          />
        </div>
      </Card>

      {/* Details Modal */}
      {selectedId && (
        <VerificationDetails
          requestId={selectedId}
          onClose={closeDetails}
          onApprove={setApprovingItem}
          onReject={openReject}
        />
      )}

      {/* Reject Modal */}
      {rejectingItem && (
        <Modal
          isOpen={true}
          onClose={() => setRejectingItem(null)}
          title={`Decline Verification: @${creatorHandle(rejectingItem)}`}
          description="The creator sees this reason in their notification."
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setRejectingItem(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmReject}
                isLoading={isRejecting}
                disabled={rejectionReason.trim().length < 3}
              >
                Confirm Decline
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Textarea label="Decline Reason" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={4} />
          </div>
        </Modal>
      )}

      {/* Confirm Approval Dialog */}
      <ConfirmDialog
        isOpen={Boolean(approvingItem)}
        onClose={() => setApprovingItem(null)}
        onConfirm={() => {
          if (approvingItem) void handleApprove(approvingItem.id);
        }}
        isLoading={isApproving}
        title="Approve Verified Badge"
        description={`Approve verification for ${approvingItem ? creatorName(approvingItem) : ''} (@${
          approvingItem ? creatorHandle(approvingItem) : ''
        })? The verified badge will show on their public profile.`}
        variant="success"
        confirmLabel="Approve Creator"
      />
    </div>
  );
};

/** Full request (GET /admin/verifications/:id). Approve / decline open the page-level dialogs. */
const VerificationDetails: React.FC<{
  requestId: string;
  onClose: () => void;
  onApprove: (request: VerificationRequest) => void;
  onReject: (request: VerificationRequest) => void;
}> = ({ requestId, onClose, onApprove, onReject }) => {
  const { data: request, isLoading, isError, error } = useGetVerificationQuery(requestId);
  const [getFileUrl, { isFetching: isOpeningFile }] = useLazyGetAdminFileUrlQuery();
  const [fileError, setFileError] = useState('');

  // The uploaded sample is a private file — ask the server for a short-lived signed URL.
  const openSampleFile = async (fileId: string) => {
    setFileError('');
    try {
      const { url } = await getFileUrl(fileId).unwrap();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setFileError(getErrorMessage(err));
    }
  };

  const snapshot = request?.creatorSnapshot;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={request ? `Verification Details: ${creatorName(request)}` : 'Verification Details'}
      description="Review the creator's channels, audience reach and sample work."
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          {request?.status === 'pending' && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-rose-600 border-rose-200 hover:bg-rose-50 font-bold"
                onClick={() => onReject(request)}
              >
                Decline
              </Button>
              <button
                type="button"
                onClick={() => onApprove(request)}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Approve Creator</span>
              </button>
            </div>
          )}
        </div>
      }
    >
      {isLoading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
        </div>
      ) : isError || !request ? (
        <div className="py-8 text-center text-xs text-neutral-500">{getErrorMessage(error, 'Request not found.')}</div>
      ) : (
        <div className="space-y-4 text-xs">
          {/* Top Identity Banner */}
          <div className="flex items-center justify-between p-3.5 bg-neutral-50 rounded-xl border border-neutral-200">
            <div className="flex items-center gap-3">
              <Avatar src={snapshot?.avatar} name={creatorName(request)} size="md" />
              <div>
                <div className="font-extrabold text-neutral-950 text-sm flex items-center gap-1.5">
                  <span>{creatorName(request)}</span>
                  {request.status === 'approved' && (
                    <span title="Verified Creator" className="inline-flex">
                      <BadgeCheck className="w-4 h-4 text-sky-500 fill-sky-500/15 shrink-0" />
                    </span>
                  )}
                </div>
                <div className="text-neutral-500 font-medium">@{creatorHandle(request)}</div>
              </div>
            </div>

            <Badge variant={statusVariant(request.status)} size="sm" dot>
              {request.status}
            </Badge>
          </div>

          {/* 2-Column Audit Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Column: Metrics & Social Channels */}
            <div className="space-y-3">
              <div className="p-3.5 bg-white rounded-xl border border-neutral-200 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-neutral-900 text-xs">
                  <TrendingUp className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Audience Reach &amp; Metrics</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="p-2.5 bg-neutral-50 rounded-lg">
                    <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider block">Total Followers</span>
                    <span className="text-sm font-black text-neutral-950">
                      {request.followersTotal !== undefined ? formatNumber(request.followersTotal) : '—'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-neutral-50 rounded-lg">
                    <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider block">Avg. Views</span>
                    <span className="text-sm font-black text-neutral-950">
                      {request.avgViews !== undefined ? formatNumber(request.avgViews) : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Social Channels */}
              <div className="p-3.5 bg-white rounded-xl border border-neutral-200 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-neutral-900 text-xs">
                  <Users className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Live Social Profiles</span>
                </div>
                <div className="space-y-1.5 pt-1">
                  {PLATFORM_LINKS.map((platform) => {
                    const url = request.platforms?.[platform.key];
                    if (!url) return null;
                    return (
                      <a
                        key={platform.key}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 hover:bg-neutral-100 transition-colors border border-neutral-200/60 text-xs font-semibold text-neutral-800"
                      >
                        <span className="flex items-center gap-2">
                          <span className={`font-extrabold text-[10px] uppercase px-1.5 py-0.5 rounded ${platform.className}`}>
                            {platform.short}
                          </span>
                          <span>{platform.label}</span>
                          {request.primaryPlatform === platform.key && (
                            <span className="text-[10px] text-neutral-400 font-bold">(primary)</span>
                          )}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
                      </a>
                    );
                  })}
                </div>
              </div>

              {/* Location */}
              <div className="p-3.5 bg-white rounded-xl border border-neutral-200 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-neutral-900 text-xs">
                  <Globe className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Location</span>
                </div>
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-neutral-500 font-medium">Country:</span>
                  <span className="font-bold text-neutral-900">{snapshot?.country || '—'}</span>
                </div>
              </div>
            </div>

            {/* Right Column: Sample work, categories, metadata */}
            <div className="space-y-3">
              <div className="p-3.5 bg-white rounded-xl border border-neutral-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-neutral-900 text-xs">
                    <Video className="w-3.5 h-3.5 text-neutral-600" />
                    <span>Sample Work</span>
                  </div>
                  {request.sampleWork?.views !== undefined && (
                    <Badge variant="neutral" size="sm" className="font-extrabold">
                      {formatNumber(request.sampleWork.views)} views
                    </Badge>
                  )}
                </div>

                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 space-y-2">
                  <p className="font-bold text-neutral-950 text-xs leading-snug">{request.sampleWork?.title || 'No title provided'}</p>
                  {request.sampleWork?.url && (
                    <a
                      href={request.sampleWork.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-brand-black hover:underline"
                    >
                      <span>Inspect Deliverable Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {request.sampleWork?.file && (
                    <button
                      type="button"
                      onClick={() => openSampleFile(request.sampleWork!.file!.fileId)}
                      disabled={isOpeningFile}
                      className="flex items-center gap-1 text-xs font-bold text-brand-black hover:underline disabled:opacity-50"
                    >
                      {isOpeningFile ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                      <span>Open uploaded file ({request.sampleWork.file.name})</span>
                    </button>
                  )}
                  {fileError && <p className="text-[11px] text-rose-600">{fileError}</p>}
                </div>
              </div>

              {/* Categories */}
              <div className="p-3.5 bg-white rounded-xl border border-neutral-200 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-neutral-900 text-xs">
                  <Layers className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Categories</span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {snapshot?.categories?.length ? (
                    snapshot.categories.map((category) => (
                      <span
                        key={category}
                        className="px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-800 text-[11px] font-bold border border-neutral-200"
                      >
                        {category}
                      </span>
                    ))
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </div>
              </div>

              {request.note && (
                <div className="p-3.5 bg-white rounded-xl border border-neutral-200 space-y-1">
                  <span className="font-bold text-neutral-900 text-xs block">Note from creator</span>
                  <p className="text-xs text-neutral-700 leading-relaxed whitespace-pre-line">{request.note}</p>
                </div>
              )}

              {/* Application Metadata */}
              <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500 font-medium">Applied Date:</span>
                  <span className="font-bold text-neutral-950">{formatDate(request.createdAt)}</span>
                </div>
                {request.reviewedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 font-medium">Reviewed:</span>
                    <span className="font-bold text-neutral-950">{formatDate(request.reviewedAt)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500 font-medium">Request Code:</span>
                  <span className="font-mono font-bold text-neutral-800">{request.code}</span>
                </div>
              </div>

              {request.status === 'rejected' && request.rejectionReason && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-1 text-rose-800">
                  <span className="font-bold block text-[11px]">Decline Reason:</span>
                  <p className="text-xs leading-relaxed">{request.rejectionReason}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default VerificationPage;
