'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { http } from '@/lib/api/client';
import { useMutation } from '@/lib/hooks/useMutation';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { PrivateFileLink, PrivateVideo, formatFileSize, isVideoFile } from '@/components/shared/PrivateFile';
import { formatCents } from '@/lib/format';
import { getErrorMessage } from '@/lib/api/errors';
import { ordersEndpoints, type Order } from '@/lib/api/endpoints/orders';
import { uploadFileWith } from '@/lib/api/endpoints/upload';
import {
  Video,
  Upload,
  ExternalLink,
  MessageSquare,
  Link2,
  Film,
  ArrowRight,
  HelpCircle,
  LifeBuoy,
  CheckCircle2,
  ShieldCheck,
  Star,
  Plus,
  Trash2,
  FileText,
  Image as ImageIcon,
  Loader2,
  PackageSearch,
} from 'lucide-react';
import { Button, Input, Modal, Select, message } from 'antd';

/** A file picked in the form — uploaded right away (context `deliverable`), sent by id on submit. */
interface AttachedFile {
  key: string;
  name: string;
  size: string;
  isVideo: boolean;
  status: 'uploading' | 'ready' | 'failed';
  fileId?: string;
}

const shortDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const monthYear = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '');

/** Max upload per file for the `deliverable` context (server: upload.constant.ts). */
const MAX_DELIVERABLE_BYTES = 2048 * 1024 * 1024;

/**
 * Order fulfilment UI. The server page loads GET /orders/:id (a missing order → 404 page; any other
 * failure → `order === null` → "Order not available"). Writes go through useMutation, which
 * re-renders the server page with the updated order.
 */
export function OrderFulfilmentView({ order, orderId }: { order: Order | null; orderId: string }) {
  const isLoading = false;
  const error = order === null;

  const uploadFile = (file: File) => uploadFileWith(http, file, 'deliverable');
  const submitDeliverableMutation = useMutation(ordersEndpoints(http).submitDeliverable);
  const reportIssueMutation = useMutation(ordersEndpoints(http).reportIssue);
  const resolveTicketMutation = useMutation((ticketId: string) => ordersEndpoints(http).resolveTicket(ticketId));
  const isSubmitting = submitDeliverableMutation.loading;
  const reporting = reportIssueMutation.loading;

  const [delivTitle, setDelivTitle] = useState('');
  const [submissionMode, setSubmissionMode] = useState<'direct' | 'drive'>('direct');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [cloudLinks, setCloudLinks] = useState<string[]>(['']);
  const [delivNotes, setDelivNotes] = useState('');

  // Support / Issue states
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState('Brand Unresponsive / Feedback Delayed');
  const [reportReason, setReportReason] = useState('');

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#A3A39B]" />
      </div>
    );
  }

  if (!order || error) {
    return (
      <div className="min-h-screen pb-16 font-sans">
        <WorkspaceHeader title="Order" subtitle={`Order #${orderId}`} backHref="/creator/campaigns" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="bg-white rounded-xl p-4 sm:p-6 border border-[#E7E7E2] shadow-2xs">
            <EmptyState
              color="neutral"
              icon={<PackageSearch className="w-8 h-8" />}
              title="Order not available"
              description="This order doesn't exist or you don't have access to it."
              primaryAction={{ label: 'Back to Campaigns', href: '/creator/campaigns' }}
              variant="plain"
            />
          </div>
        </div>
      </div>
    );
  }

  const brand = order.counterpart;
  const brandName = brand?.name ?? 'Brand';
  const brandHref = `/brands/${brand?.handle || order.brandId}`;
  const issue = order.issue ?? null;
  const canSubmit = order.status === 'in_production';
  const stillUploading = attachedFiles.some((f) => f.status === 'uploading');
  const submissions = [...order.deliverables].reverse();

  const statusHint: Record<string, string> = {
    awaiting_payment: 'The brand has not funded the escrow yet.',
    deliverable_submitted: 'Your deliverables are with the brand for review.',
    approved: 'The brand approved your deliverables — payment released.',
    completed: 'This campaign is completed.',
    cancelled: 'This order was cancelled.',
    disputed: 'Submissions are paused while Support reviews the open ticket.',
  };

  const handleFilesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!selected.length) return;

    const tooBig = selected.filter((f) => f.size > MAX_DELIVERABLE_BYTES);
    if (tooBig.length) message.error(`${tooBig.map((f) => f.name).join(', ')} is larger than 2 GB.`);
    const accepted = selected.filter((f) => f.size <= MAX_DELIVERABLE_BYTES);

    const rows: AttachedFile[] = accepted.map((f) => ({
      key: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
      size: formatFileSize(f.size),
      isVideo: f.type.startsWith('video') || /\.(mp4|mov|webm)$/i.test(f.name),
      status: 'uploading',
    }));
    setAttachedFiles((prev) => [...prev, ...rows]);

    accepted.forEach((file, i) => {
      const key = rows[i].key;
      uploadFile(file)
        .then((uploaded) =>
          setAttachedFiles((prev) => prev.map((f) => (f.key === key ? { ...f, status: 'ready', fileId: uploaded.id } : f))),
        )
        .catch((err) => {
          setAttachedFiles((prev) => prev.map((f) => (f.key === key ? { ...f, status: 'failed' } : f)));
          message.error(`${file.name}: ${getErrorMessage(err, 'Upload failed')}`);
        });
    });
    if (rows.length) message.success(`${rows.length} file(s) attached`);
  };

  const removeFile = (key: string) => setAttachedFiles((prev) => prev.filter((f) => f.key !== key));

  const updateLink = (idx: number, val: string) => setCloudLinks((prev) => prev.map((l, i) => (i === idx ? val : l)));
  const addLinkRow = () => setCloudLinks((prev) => [...prev, '']);
  const removeLinkRow = (idx: number) => setCloudLinks((prev) => (prev.length === 1 ? [''] : prev.filter((_, i) => i !== idx)));

  const handleDeliverableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stillUploading) {
      message.info('Please wait until all files finish uploading.');
      return;
    }
    const validLinks = cloudLinks.map((l) => l.trim()).filter(Boolean);
    const fileIds = attachedFiles.filter((f) => f.status === 'ready' && f.fileId).map((f) => f.fileId!);

    if (fileIds.length === 0 && validLinks.length === 0) {
      message.error('Please upload at least one file or provide a cloud link.');
      return;
    }

    try {
      await submitDeliverableMutation.run({
        id: order.id,
        title: delivTitle.trim() || 'Deliverable Package',
        notes: delivNotes.trim() || undefined,
        fileIds,
        links: validLinks,
      });
      message.success('Deliverables submitted to brand for escrow approval!');
      setDelivTitle('');
      setDelivNotes('');
      setAttachedFiles([]);
      setCloudLinks(['']);
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleReportIssue = async () => {
    if (!reportReason.trim()) {
      message.error('Please describe the issue for our support team.');
      return;
    }
    try {
      await reportIssueMutation.run({ id: order.id, category: reportCategory, reason: reportReason.trim() });
      setIsReportModalOpen(false);
      setReportReason('');
      message.success('Support ticket opened! Influverse Support is notified and will assist both parties in chat.');
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleResolveSupportTicket = () => {
    if (!issue) return;
    Modal.confirm({
      title: 'Mark Support Ticket as Resolved?',
      content: 'Confirm that you and the brand have resolved this issue with Support assistance.',
      okText: 'Mark Resolved',
      okButtonProps: { className: '!bg-[#0A0A0A]' },
      onOk: async () => {
        try {
          await resolveTicketMutation.run(issue.id);
          message.success('Issue marked as resolved! Order fulfillment can continue.');
        } catch (err) {
          message.error(getErrorMessage(err));
        }
      },
    });
  };

  return (
    <div className="min-h-screen pb-16">
      <WorkspaceHeader title={`Fulfilment: ${brandName}`} subtitle={`Order #${order.code} • ${order.title}`} backHref="/creator/dashboard" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 font-sans">
        {/* Support Ticket Active Banner */}
        {issue && (
          <div className="bg-[#FAF8F5] rounded-xl p-4 sm:p-6 border border-[#EBE7DF] shadow-2xs space-y-4 font-sans">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-[#E7E3D8]">
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-[#0A0A0A] text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <LifeBuoy className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-white text-[#0A0A0A] border border-[#E7E3D8]">
                      {issue.code}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500 text-white">
                      Support Review Active
                    </span>
                    <span className="text-xs text-[#66665E] font-medium">Order #{order.code}</span>
                  </div>
                  <h3 className="text-lg font-bold text-[#0A0A0A] tracking-tight mt-1">Support Ticket Under Review</h3>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2.5 md:shrink-0">
                <Link
                  href={issue.supportConversationId ? `/creator/messages?conv=${issue.supportConversationId}` : '/creator/messages'}
                  className="h-10 px-4 rounded-lg whitespace-nowrap justify-center bg-[#0A0A0A] hover:bg-zinc-800 text-white text-xs font-bold transition-all inline-flex items-center gap-2 shadow-2xs"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Chat with Support</span>
                </Link>
                <button
                  onClick={handleResolveSupportTicket}
                  className="h-10 px-3.5 rounded-lg whitespace-nowrap justify-center bg-white border border-[#E7E7E2] hover:border-[#0A0A0A] text-[#0A0A0A] text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Mark Resolved</span>
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-white border border-[#E7E3D8] space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#888880]">Report Details</div>
              <p className="text-sm text-[#44443E] font-medium leading-relaxed">
                {issue.category}: {issue.reason}
              </p>
            </div>

            <div className="text-xs text-[#66665E] flex items-start sm:items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Your guaranteed payment of <strong>{formatCents(order.priceCents)}</strong> is held safely in escrow while Support assists
                both parties in chat.
              </span>
            </div>
          </div>
        )}

        {/* Top Escrow Payout Banner */}
        <div className="bg-white rounded-xl p-4 sm:p-6 border border-[#E7E7E2] shadow-2xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <Link href={brandHref} className="hover:opacity-85 transition-opacity shrink-0" title="View Brand Profile">
                <BrandLogo name={brandName} logoUrl={brand?.avatar ?? undefined} size="lg" />
              </Link>
              <div className="min-w-0">
                <Link
                  href={brandHref}
                  className="text-xl sm:text-2xl font-extrabold break-words text-[#0A0A0A] hover:text-[#FF2D78] transition-colors tracking-tight"
                >
                  {brandName}
                </Link>
              </div>
            </div>

            <div className="flex items-stretch gap-2 sm:gap-3 md:shrink-0">
              {!issue && (
                <button
                  onClick={() => setIsReportModalOpen(true)}
                  className="order-last md:order-none shrink-0 h-auto min-h-11 px-3.5 rounded-lg justify-center whitespace-nowrap bg-white border border-[#E7E7E2] hover:border-[#0A0A0A] text-[#66665E] hover:text-[#0A0A0A] font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  title="Report an issue or ask support for assistance"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Need Help?</span>
                </button>
              )}
              <div className="flex-1 md:flex-none bg-[#FAFAF8] px-4 sm:px-5 py-3 rounded-lg border border-[#E7E7E2] text-left md:text-right">
                <div className="text-xs font-bold uppercase tracking-wider text-[#66665E]">Payout</div>
                <div className="text-2xl sm:text-3xl font-extrabold text-[#0A0A0A] tracking-tight">{formatCents(order.priceCents)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* 2-Column Fulfilment Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8">
          {/* Left Column (7 cols): Deliverable Submission Form */}
          <div className="xl:col-span-7 space-y-6">
            {/* Submit Deliverable Form */}
            <div className="bg-white rounded-xl p-4 sm:p-6 border border-[#E7E7E2] shadow-2xs space-y-5 sm:space-y-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">Submit Deliverables</h3>
                  <p className="text-sm text-[#66665E] mt-0.5">Upload or link your completed video draft for brand sign-off.</p>
                </div>
                <div className="w-10 h-10 shrink-0 rounded-lg bg-[#FAFAF8] text-[#0A0A0A] border border-[#E7E7E2] flex items-center justify-center shadow-2xs">
                  <Upload className="w-5 h-5" />
                </div>
              </div>

              {!canSubmit && statusHint[order.status] && (
                <div className="p-3.5 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] text-sm text-[#0A0A0A] font-semibold flex items-start sm:items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#FF2D78] shrink-0" />
                  <span>{statusHint[order.status]}</span>
                </div>
              )}

              <form onSubmit={handleDeliverableSubmit} className="space-y-4">
                <fieldset disabled={!canSubmit} className="space-y-4 disabled:opacity-60">
                  <div>
                    <label className="block text-sm font-semibold text-[#0A0A0A] mb-1.5">Deliverable Asset Name</label>
                    <Input
                      value={delivTitle}
                      onChange={(e) => setDelivTitle(e.target.value)}
                      className="bg-[#FAFAF8] border-[#E7E7E2] rounded-lg text-base sm:text-sm py-2"
                      placeholder="e.g. 4K Final Reel Cut + Clean Audio"
                      maxLength={200}
                      required
                    />
                  </div>

                  {/* Delivery Method Switcher */}
                  <div>
                    <label className="block text-sm font-semibold text-[#0A0A0A] mb-1.5">Delivery Method</label>
                    <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2]">
                      <button
                        type="button"
                        onClick={() => setSubmissionMode('drive')}
                        className={`flex items-center justify-center gap-2 min-h-10 py-2 px-3 rounded-md text-sm font-bold transition-all cursor-pointer ${
                          submissionMode === 'drive' ? 'bg-[#0A0A0A] text-white shadow-xs' : 'text-[#66665E] hover:text-[#0A0A0A]'
                        }`}
                      >
                        <Link2 className="w-4 h-4" />
                        <span>Drive Link</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubmissionMode('direct')}
                        className={`flex items-center justify-center gap-2 min-h-10 py-2 px-3 rounded-md text-sm font-bold transition-all cursor-pointer ${
                          submissionMode === 'direct' ? 'bg-[#0A0A0A] text-white shadow-xs' : 'text-[#66665E] hover:text-[#0A0A0A]'
                        }`}
                      >
                        <Video className="w-4 h-4" />
                        <span>Upload Video</span>
                      </button>
                    </div>
                  </div>

                  {/* Option 1: Drive Link */}
                  {submissionMode === 'drive' && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <label className="block text-sm font-semibold text-[#0A0A0A]">Drive / Cloud Links</label>
                        <button
                          type="button"
                          onClick={addLinkRow}
                          className="text-xs font-bold text-[#0A0A0A] hover:text-[#FF2D78] flex items-center gap-1 min-h-8 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add another link</span>
                        </button>
                      </div>

                      <div className="space-y-2">
                        {cloudLinks.map((link, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <Input
                              value={link}
                              onChange={(e) => updateLink(idx, e.target.value)}
                              className="bg-[#FAFAF8] border-[#E7E7E2] rounded-lg text-base sm:text-sm py-2 font-sans flex-1"
                              placeholder="https://drive.google.com/... or Dropbox link"
                            />
                            {cloudLinks.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeLinkRow(idx)}
                                className="w-10 h-10 flex items-center justify-center rounded-lg text-[#8E8E87] hover:text-rose-600 transition-colors cursor-pointer shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Option 2: Direct Video / File Upload */}
                  {submissionMode === 'direct' && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <label className="block text-sm font-semibold text-[#0A0A0A]">Upload Deliverable Files</label>
                        {attachedFiles.length > 0 && (
                          <label className="text-xs font-bold text-[#0A0A0A] hover:text-[#FF2D78] flex items-center gap-1 min-h-8 cursor-pointer">
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add more files</span>
                            <input
                              type="file"
                              multiple
                              accept="video/*,image/*,application/pdf,application/zip"
                              onChange={handleFilesUpload}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>

                      {attachedFiles.length > 0 ? (
                        <div className="space-y-2.5">
                          {attachedFiles.map((f) => (
                            <div
                              key={f.key}
                              className="rounded-lg border border-[#E7E7E2] bg-[#FAFAF8] p-3 flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-lg bg-white border border-[#E7E7E2] flex items-center justify-center shrink-0">
                                  {f.status === 'uploading' ? (
                                    <Loader2 className="w-5 h-5 text-zinc-800 animate-spin" />
                                  ) : f.isVideo ? (
                                    <Film className="w-5 h-5 text-zinc-800" />
                                  ) : (
                                    <ImageIcon className="w-5 h-5 text-zinc-800" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-bold text-[#0A0A0A] truncate">{f.name}</div>
                                  <div className={`text-xs ${f.status === 'failed' ? 'text-rose-600' : 'text-[#8E8E87]'}`}>
                                    {f.status === 'uploading' ? `${f.size} • Uploading…` : f.status === 'failed' ? 'Upload failed' : f.size}
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => removeFile(f.key)}
                                className="w-10 h-10 flex items-center justify-center rounded-lg text-[#8E8E87] hover:text-rose-600 transition-colors cursor-pointer shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <label className="border-2 border-dashed border-[#E7E7E2] hover:border-[#0A0A0A] rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer bg-[#FAFAF8] hover:bg-white transition-all text-center group">
                          <div className="w-12 h-12 rounded-lg bg-[#F4F4F0] text-[#0A0A0A] flex items-center justify-center group-hover:scale-105 transition-transform">
                            <Upload className="w-6 h-6" />
                          </div>
                          <div className="text-sm font-bold text-[#0A0A0A]">Click or drag files here to upload</div>
                          <div className="text-xs text-[#66665E]">Supports multiple videos (MP4, MOV) and images up to 2GB</div>
                          <input
                            type="file"
                            multiple
                            accept="video/*,image/*,application/pdf,application/zip"
                            onChange={handleFilesUpload}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold text-[#0A0A0A] mb-1.5">Notes</label>
                    <Input.TextArea
                      rows={3}
                      value={delivNotes}
                      onChange={(e) => setDelivNotes(e.target.value)}
                      maxLength={2000}
                      className="bg-[#FAFAF8] border-[#E7E7E2] rounded-lg text-base sm:text-sm font-sans"
                      placeholder="Add notes for the brand (optional)..."
                    />
                  </div>
                </fieldset>

                <Button
                  type="primary"
                  htmlType="submit"
                  loading={isSubmitting}
                  disabled={!canSubmit || stillUploading}
                  block
                  className="h-12 sm:h-11 rounded-lg font-bold text-sm bg-[#0A0A0A] hover:!bg-[#FF2D78] !text-white hover:!text-white border-none shadow-xs cursor-pointer"
                >
                  {stillUploading ? 'Uploading files…' : 'Submit Deliverables'}
                </Button>
              </form>
            </div>

            {/* Existing Submissions List */}
            <div className="sm:bg-white sm:rounded-xl sm:p-6 sm:border sm:border-[#E7E7E2] sm:shadow-2xs space-y-3 sm:space-y-4">
              <h3 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">Submitted Assets</h3>
              {submissions.length === 0 && <p className="text-sm text-[#66665E]">Nothing submitted yet.</p>}
              {submissions.map((deliv) => {
                const hasFiles = deliv.files.length > 0;
                const hasLinks = deliv.links.length > 0;

                return (
                  <div key={deliv.id} className="p-4 sm:p-5 rounded-lg bg-white sm:bg-[#FAFAF8] border border-[#E7E7E2] space-y-3.5">
                    <div className="flex justify-between items-start gap-3 text-sm font-semibold text-[#0A0A0A]">
                      <span className="font-bold min-w-0 break-words">{deliv.title}</span>
                      <span className="shrink-0 whitespace-nowrap text-xs text-[#66665E] font-medium">{shortDate(deliv.submittedAt)}</span>
                    </div>

                    {/* Files display */}
                    {hasFiles && (
                      <div className="space-y-2">
                        {deliv.files.map((f) => {
                          const video = isVideoFile(f);
                          return (
                            <div key={f.id} className="space-y-2">
                              {video ? (
                                <div className="rounded-lg overflow-hidden bg-black aspect-video max-h-64 shadow-xs">
                                  <PrivateVideo file={f} className="w-full h-full object-contain" />
                                </div>
                              ) : null}
                              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#FAFAF8] sm:bg-white border border-[#E7E7E2] text-xs">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {video ? (
                                    <Film className="w-3.5 h-3.5 text-zinc-700 shrink-0" />
                                  ) : (
                                    <FileText className="w-3.5 h-3.5 text-zinc-700 shrink-0" />
                                  )}
                                  <span className="font-bold text-[#0A0A0A] truncate">{f.name}</span>
                                  <span className="hidden sm:inline shrink-0 text-[#8E8E87]">({formatFileSize(f.size)})</span>
                                </div>
                                <PrivateFileLink file={f} className="font-bold text-[#0A0A0A] hover:underline flex items-center gap-1 shrink-0 ml-2">
                                  <span>Download</span>
                                  <ExternalLink className="w-3 h-3" />
                                </PrivateFileLink>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Links display */}
                    {hasLinks && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {deliv.links.map((l, i) => (
                          <a
                            key={i}
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-full min-h-10 items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-[#E7E7E2] text-xs font-bold text-[#0A0A0A] hover:border-[#0A0A0A] hover:text-[#FF2D78] transition-colors shadow-2xs"
                          >
                            <Link2 className="w-3.5 h-3.5 shrink-0 text-[#FF2D78]" />
                            <span className="truncate">{l.title || 'Open Asset Link'}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 text-[#66665E]" />
                          </a>
                        ))}
                      </div>
                    )}

                    {deliv.notes && (
                      <p className="text-xs sm:text-sm text-[#555550] bg-[#FAFAF8] sm:bg-white p-3 rounded-lg break-words border border-[#E7E7E2] italic leading-relaxed">
                        &ldquo;{deliv.notes}&rdquo;
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column (5 cols): Brief, Requirements & Direct Chat */}
          <div className="xl:col-span-5 space-y-6 md:space-y-0 md:grid md:grid-cols-2 md:items-start md:gap-6 xl:block xl:space-y-6">
            {/* Brief Box */}
            <div className="bg-white rounded-xl p-4 sm:p-6 border border-[#E7E7E2] shadow-2xs space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 pb-3 border-b border-[#E7E7E2]">
                <div className="min-w-0 flex-1 basis-48">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#66665E]">Agreed Brief &amp; Requirements</h3>
                  <div className="text-base font-extrabold text-[#0A0A0A] mt-1 break-words">{order.title}</div>
                </div>
                {order.platforms.length > 0 && (
                  <span className="text-xs font-bold uppercase px-2 py-0.5 rounded-md bg-[#FAFAF8] border border-[#E7E7E2] text-[#0A0A0A] shrink-0">
                    {order.platforms.join(', ')}
                  </span>
                )}
              </div>

              <p className="text-sm text-[#44443E] bg-[#FAFAF8] p-4 rounded-lg break-words border border-[#E7E7E2] leading-relaxed whitespace-pre-line">
                {order.brief || order.title}
              </p>

              {order.requirements.length > 0 && (
                <ul className="space-y-2 text-sm text-[#0A0A0A] pt-1">
                  {order.requirements.map((req, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0A0A0A] shrink-0 mt-2" />
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Direct Chat Link */}
            <Link
              href={`/creator/messages?conv=${order.conversationId}`}
              className="bg-white rounded-xl p-4 sm:p-5 border border-[#E7E7E2] hover:border-[#0A0A0A] shadow-2xs flex items-center justify-between gap-3 transition-all group cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-[#FAFAF8] group-hover:bg-[#0A0A0A] group-hover:text-white border border-[#E7E7E2] flex items-center justify-center transition-all shrink-0">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="font-bold text-sm text-[#0A0A0A] group-hover:text-[#FF2D78] transition-colors truncate block">
                    Chat with {brandName}
                  </span>
                  <span className="text-xs text-[#66665E]">Open messages</span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-[#A3A39C] group-hover:text-[#0A0A0A] group-hover:translate-x-1 transition-all shrink-0" />
            </Link>

            {/* Brand Review (if submitted) */}
            {order.review && (
              <div className="bg-white rounded-xl p-4 sm:p-6 border border-[#E7E7E2] shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-[#0A0A0A]">Brand Review</h3>
                  <div className="flex text-amber-500">
                    {[...Array(order.review.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-amber-500" />
                    ))}
                  </div>
                </div>
                <p className="text-sm text-[#555550] italic bg-[#FAFAF8] p-4 rounded-lg border border-[#E7E7E2] leading-relaxed">
                  &ldquo;{order.review.comment}&rdquo;
                </p>
                <span className="text-xs text-[#66665E] block">Submitted {monthYear(order.review.createdAt)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Report Issue to Support Modal */}
      <Modal
        title={`Report an Issue with Order #${order.code}`}
        open={isReportModalOpen}
        onCancel={() => setIsReportModalOpen(false)}
        footer={null}
        width={540}
        centered
      >
        <div className="space-y-4 pt-3 font-sans">
          <div className="p-3.5 bg-[#FAF8F5] rounded-lg border border-[#EBE7DF] text-xs text-[#66665E] leading-relaxed">
            Need help? Our Trust & Support team mediates between brands and creators. If the brand is unresponsive, requests out-of-scope
            work, or changes requirements, submit a report here and our team will step in to assist both parties.
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#66665E]">Issue Category</label>
            <Select
              value={reportCategory}
              onChange={(val) => setReportCategory(val)}
              className="w-full h-10 rounded-lg"
              options={[
                { value: 'Brand Unresponsive / Feedback Delayed', label: 'Brand is unresponsive or feedback is delayed' },
                { value: 'Unreasonable / Out-of-Scope Revision Request', label: 'Unreasonable or out-of-scope revision requested' },
                { value: 'Creative Brief Changed After Work Started', label: 'Brief was changed after project started' },
                { value: 'Payment or Escrow Disbursement Inquiry', label: 'Payment or escrow disbursement inquiry' },
                { value: 'Other Support Inquiry', label: 'Other order support request' },
              ]}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#66665E]">Describe the Issue</label>
            <Input.TextArea
              rows={4}
              placeholder="Explain what happened or what assistance you need from Influverse Support..."
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              maxLength={4000}
              className="rounded-lg text-base sm:text-xs p-3"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsReportModalOpen(false)}
              className="h-11 sm:h-10 px-4 rounded-lg border border-[#E7E7E2] text-xs font-bold text-[#66665E] hover:text-[#0A0A0A] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReportIssue}
              disabled={reporting}
              className="h-11 sm:h-10 px-5 rounded-lg justify-center bg-[#0A0A0A] hover:bg-[#FF2D78] disabled:opacity-60 text-white text-xs font-extrabold transition-all shadow-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              {reporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LifeBuoy className="w-3.5 h-3.5" />}
              <span>Submit Report to Support</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
