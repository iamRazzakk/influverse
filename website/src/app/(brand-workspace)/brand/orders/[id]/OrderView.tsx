'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { http } from '@/lib/api/client';
import { useMutation } from '@/lib/hooks/useMutation';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { WorkspaceEmptyPage } from '@/components/shared/WorkspaceEmptyPage';
import { AccountAvatar } from '@/components/auth/AccountAvatar';
import { PrivateFileLink, PrivateVideo, formatFileSize, isVideoFile } from '@/components/shared/PrivateFile';
import { formatCents } from '@/lib/format';
import { getErrorMessage } from '@/lib/api/errors';
import { ordersEndpoints, type Order } from '@/lib/api/endpoints/orders';
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  Video,
  Link2,
  ExternalLink,
  MessageSquare,
  Star,
  RotateCcw,
  HelpCircle,
  LifeBuoy,
  ArrowRight,
  Film,
  FileText,
  Loader2,
} from 'lucide-react';
import { Button, Input, Modal, Rate, Select, message } from 'antd';

const shortDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const monthYear = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '');

/**
 * Order detail UI. `order` comes from the server page (null = request failed → "not found" card).
 * Every action is a useMutation, which calls router.refresh() so the page re-renders with fresh data.
 */
export function OrderView({ order }: { order: Order | null }) {
  const api = ordersEndpoints(http);
  const { run: approveOrder, loading: approving } = useMutation((id: string) => api.approve(id));
  const { run: requestRevision, loading: requestingRevision } = useMutation((body: { id: string; notes: string }) =>
    api.requestRevision(body.id, body.notes),
  );
  const { run: reviewOrder, loading: reviewing } = useMutation(api.review);
  const { run: reportIssue, loading: reporting } = useMutation(api.reportIssue);
  const { run: resolveTicket } = useMutation((body: { ticketId: string; orderId: string }) => api.resolveTicket(body.ticketId));

  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [ratingVal, setRatingVal] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  // Support / Issue states
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState('Quality / Creative Brief Disagreement');
  const [reportReason, setReportReason] = useState('');

  if (!order) {
    return (
      <WorkspaceEmptyPage
        title="Order"
        backHref="/brand/campaigns"
        icon={<FileText className="w-8 h-8" />}
        emptyTitle="Order not found"
        emptyDescription="This order doesn't exist or you don't have access to it."
        action={{ label: 'Back to campaigns', href: '/brand/campaigns' }}
      />
    );
  }

  const creator = order.counterpart;
  const creatorName = creator?.name ?? 'Creator';
  const creatorHref = `/creators/${creator?.handle || order.creatorId}`;
  const messagesHref = `/brand/messages?conv=${order.conversationId}`;
  const totalLabel = formatCents(order.totalCents);
  const issue = order.issue ?? null;
  const assetsSubmitted = ['deliverable_submitted', 'approved', 'completed'].includes(order.status) || order.deliverables.length > 0;
  const filesCount = order.deliverables.reduce((sum, d) => sum + d.files.length + d.links.length, 0);
  // Newest submission first, like an inbox.
  const deliverables = [...order.deliverables].reverse();

  const handleApproveDeliverables = async () => {
    try {
      await approveOrder(order.id);
      message.success('Deliverables approved! Escrow payment released to creator.');
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleRequestRevision = async () => {
    if (!revisionNotes.trim()) {
      message.error('Please specify the revisions needed.');
      return;
    }
    try {
      await requestRevision({ id: order.id, notes: revisionNotes.trim() });
      setIsRevisionModalOpen(false);
      setRevisionNotes('');
      message.info('Revision request sent to creator.');
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewComment.trim()) return;
    try {
      await reviewOrder({ id: order.id, rating: ratingVal, comment: reviewComment.trim() });
      message.success('Review submitted! Campaign marked as completed.');
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
      await reportIssue({ id: order.id, category: reportCategory, reason: reportReason.trim() });
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
      content: 'Confirm that you and the creator have resolved this issue with Support assistance.',
      okText: 'Mark Resolved',
      okButtonProps: { className: '!bg-[#0A0A0A]' },
      onOk: async () => {
        try {
          await resolveTicket({ ticketId: issue.id, orderId: order.id });
          message.success('Issue marked as resolved! Order fulfillment can continue.');
        } catch (err) {
          message.error(getErrorMessage(err));
        }
      },
    });
  };

  return (
    <div className={`min-h-screen ${order.status === 'deliverable_submitted' ? 'lg:pb-16' : 'pb-16'}`}>
      <WorkspaceHeader
        title={creatorName}
        subtitle={`Order #${order.code} • ${order.title}`}
        backHref="/brand/campaigns"
      />

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
                    <span className="font-mono text-xs font-black text-[#0A0A0A] bg-white px-2.5 py-0.5 rounded-md border border-[#E7E3D8]">
                      {issue.code}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md bg-amber-500 text-white text-[11px] font-extrabold uppercase">
                      Support Review Active
                    </span>
                    <span className="text-xs text-[#66665E] font-medium">Opened: {shortDate(issue.createdAt)}</span>
                  </div>
                  <h3 className="text-lg font-bold text-[#0A0A0A] tracking-tight mt-1">Support Ticket Under Review</h3>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2.5 md:shrink-0">
                <Link
                  href={issue.supportConversationId ? `/brand/messages?conv=${issue.supportConversationId}` : '/brand/messages'}
                  className="h-10 px-4 rounded-lg bg-[#0A0A0A] hover:bg-zinc-800 text-white text-xs font-bold transition-all inline-flex items-center justify-center gap-2 shadow-2xs whitespace-nowrap"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Chat with Support</span>
                </Link>
                <button
                  onClick={handleResolveSupportTicket}
                  className="h-10 px-3.5 rounded-lg bg-white border border-[#E7E7E2] hover:border-[#0A0A0A] text-[#0A0A0A] text-xs font-bold transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap"
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
                Escrow funds of <strong>{totalLabel}</strong> remain secured in platform escrow while Support assists both parties in chat.
              </span>
            </div>
          </div>
        )}
        {/* Top Status & Escrow Banner */}
        <div className="bg-white rounded-xl p-4 sm:p-6 border border-[#E7E7E2] shadow-2xs space-y-5 sm:space-y-6">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 sm:gap-5">
            <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
              <Link href={creatorHref} className="group/avatar block shrink-0">
                <AccountAvatar
                  src={creator?.avatar}
                  name={creatorName}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border border-[#E7E7E2] shadow-2xs group-hover/avatar:scale-105 transition-transform"
                />
              </Link>
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap">
                  <Link href={creatorHref} className="hover:text-[#FF2D78] transition-colors min-w-0">
                    <h2 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight break-words">{creatorName}</h2>
                  </Link>
                  {creator?.verified && <VerifiedBadge size="sm" />}
                  {creator?.handle && <span className="text-sm text-[#66665E] font-medium break-all">@{creator.handle}</span>}
                </div>
                <div className="inline-block px-3 py-1.5 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] text-sm text-[#0A0A0A] leading-snug">
                  <span className="text-[#66665E]">Package: </span>
                  <span className="font-semibold text-[#0A0A0A]">{order.title}</span>
                  {order.platforms.length > 0 && <span className="text-[#66665E] capitalize"> ({order.platforms.join(', ')})</span>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3 xl:shrink-0">
              <Link
                href={messagesHref}
                className="h-11 px-4 rounded-lg bg-[#0A0A0A] hover:bg-[#FF2D78] text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-xs whitespace-nowrap"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Message Creator</span>
              </Link>
              <button
                onClick={() => setIsReportModalOpen(true)}
                className="h-11 px-3.5 rounded-lg bg-white border border-[#E7E7E2] hover:border-[#0A0A0A] text-[#66665E] hover:text-[#0A0A0A] font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer whitespace-nowrap"
                title="Report an issue or ask support for assistance"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Need Help?</span>
              </button>
              <div className="col-span-2 sm:ml-auto xl:ml-0 flex items-center justify-between gap-4 sm:block bg-[#FAFAF8] px-4 sm:px-5 py-3 rounded-lg border border-[#E7E7E2] text-left sm:text-right">
                <div className="text-xs font-bold text-[#66665E] uppercase tracking-wider">Escrow</div>
                <div className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">{totalLabel}</div>
              </div>
            </div>
          </div>

          {/* Escrow Progress Stepper */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 pt-4 sm:pt-6 border-t border-[#E7E7E2]">
            <div
              className={`p-3 sm:p-4 rounded-lg border space-y-1 ${
                order.paidAt ? 'bg-[#FAFAF8] border-[#0A0A0A]' : 'bg-[#FFF0F5] text-[#FF2D78] border-[#FF2D78]/25'
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-bold text-[#0A0A0A]">
                <CheckCircle2 className={`w-4 h-4 shrink-0 ${order.paidAt ? 'text-[#FF2D78]' : 'text-[#66665E]'}`} />
                <span>1. Escrow Funded</span>
              </div>
              <p className="text-sm text-[#66665E]">{order.paidAt ? `${totalLabel} secured` : 'Awaiting payment'}</p>
            </div>

            <div className="p-3 sm:p-4 rounded-lg border space-y-1 bg-[#FAFAF8] text-[#0A0A0A] border-[#0A0A0A]">
              <div className="flex items-center gap-2 text-sm font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-[#FF2D78]" />
                <span>2. Offer Accepted</span>
              </div>
              <p className="text-sm text-[#66665E]">Creator working</p>
            </div>

            <div
              className={`p-3 sm:p-4 rounded-lg border space-y-1 ${
                assetsSubmitted ? 'bg-[#FAFAF8] text-[#0A0A0A] border-[#0A0A0A]' : 'bg-[#FAFAF8] text-[#66665E] border-[#E7E7E2]'
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-bold text-[#0A0A0A]">
                <Video className={`w-4 h-4 shrink-0 ${assetsSubmitted ? 'text-[#FF2D78]' : 'text-[#66665E]'}`} />
                <span>3. Assets Submitted</span>
              </div>
              <p className="text-sm text-[#66665E]">{filesCount} files attached</p>
            </div>

            <div
              className={`p-3 sm:p-4 rounded-lg border space-y-1 ${
                order.escrowReleased ? 'bg-[#FAFAF8] text-[#0A0A0A] border-[#0A0A0A]' : 'bg-[#FAFAF8] text-[#66665E] border-[#E7E7E2]'
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-bold text-[#0A0A0A]">
                <ShieldCheck className={`w-4 h-4 shrink-0 ${order.escrowReleased ? 'text-[#FF2D78]' : 'text-[#66665E]'}`} />
                <span>4. Payment Released</span>
              </div>
              <p className="text-sm text-[#66665E]">
                {order.escrowReleased ? '100% Payout Disbursed' : order.status === 'cancelled' ? 'Refunded to you' : 'Awaiting approval'}
              </p>
            </div>
          </div>
        </div>

        {/* 2-Column Grid: Left Deliverables & Brief | Right Chat & Review */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8">
          {/* Left Column (7 cols): Deliverables & Campaign Scope */}
          <div className="xl:col-span-7 space-y-6">
            {/* Deliverables Section */}
            <div className="sm:bg-white sm:rounded-xl sm:p-6 sm:border sm:border-[#E7E7E2] sm:shadow-2xs space-y-4 sm:space-y-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">Creator Deliverables</h3>
                  <p className="text-sm text-[#66665E] mt-0.5">Review submitted assets before releasing payment.</p>
                </div>
                <span className="shrink-0 whitespace-nowrap px-2.5 py-1 rounded-md bg-white sm:bg-[#FAFAF8] border border-[#E7E7E2] text-[#0A0A0A] text-sm font-semibold">
                  {filesCount} Files
                </span>
              </div>

              {deliverables.length > 0 ? (
                <div className="space-y-3 sm:space-y-4">
                  {deliverables.map((deliv) => {
                    const hasFiles = deliv.files.length > 0;
                    const hasLinks = deliv.links.length > 0;

                    return (
                      <div key={deliv.id} className="p-4 sm:p-5 rounded-lg bg-white sm:bg-[#FAFAF8] border border-[#E7E7E2] space-y-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Video className="w-4 h-4 text-[#FF2D78] shrink-0" />
                            <span className="font-bold text-sm text-[#0A0A0A] break-words">{deliv.title}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {hasFiles && (
                              <span className="whitespace-nowrap text-xs px-2 py-0.5 rounded-md bg-[#FAFAF8] sm:bg-white border border-[#E7E7E2] font-bold text-[#0A0A0A]">
                                {deliv.files.length} {deliv.files.length === 1 ? 'file' : 'files'}
                              </span>
                            )}
                            {hasLinks && (
                              <span className="whitespace-nowrap text-xs px-2 py-0.5 rounded-md bg-[#FAFAF8] sm:bg-white border border-[#E7E7E2] font-bold text-[#0A0A0A]">
                                {deliv.links.length} {deliv.links.length === 1 ? 'link' : 'links'}
                              </span>
                            )}
                            <span className="whitespace-nowrap text-xs text-[#66665E] font-medium">{shortDate(deliv.submittedAt)}</span>
                          </div>
                        </div>

                        {/* Files Display */}
                        {hasFiles && (
                          <div className="space-y-2">
                            {deliv.files.map((f) => {
                              const video = isVideoFile(f);
                              return (
                                <div key={f.id} className="space-y-2">
                                  {video ? (
                                    <div className="rounded-lg overflow-hidden border border-[#E7E7E2] aspect-video max-h-72 bg-black shadow-xs flex items-center justify-center">
                                      <PrivateVideo file={f} className="w-full h-full object-contain" />
                                    </div>
                                  ) : null}
                                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#FAFAF8] sm:bg-white border border-[#E7E7E2] text-xs">
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                      {video ? (
                                        <Film className="w-4 h-4 text-zinc-800 shrink-0" />
                                      ) : (
                                        <FileText className="w-4 h-4 text-zinc-800 shrink-0" />
                                      )}
                                      <span className="font-bold text-[#0A0A0A] truncate">{f.name}</span>
                                      <span className="hidden sm:inline shrink-0 text-[#8E8E87]">({formatFileSize(f.size)})</span>
                                    </div>
                                    <PrivateFileLink
                                      file={f}
                                      className="font-bold text-[#0A0A0A] hover:text-[#FF2D78] flex items-center gap-1.5 shrink-0 ml-3"
                                    >
                                      <span>Download File</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </PrivateFileLink>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Notes */}
                        {deliv.notes && (
                          <p className="text-sm text-[#555550] bg-[#FAFAF8] sm:bg-white p-3.5 rounded-lg border border-[#E7E7E2] italic leading-relaxed break-words">
                            &ldquo;{deliv.notes}&rdquo;
                          </p>
                        )}

                        {/* Links Display */}
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
                                <span className="truncate">{l.title || 'Open Cloud Link'}</span>
                                <ExternalLink className="w-3.5 h-3.5 shrink-0 text-[#66665E]" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Approval / Revision Action Bar */}
                  {order.status === 'deliverable_submitted' && (
                    <div className="p-4 sm:p-5 bg-white sm:bg-[#FAFAF8] rounded-lg border border-[#E7E7E2] space-y-3.5">
                      <div className="text-sm font-semibold text-[#0A0A0A]">Are you satisfied with these deliverables?</div>
                      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
                        <Button
                          type="primary"
                          loading={approving}
                          onClick={handleApproveDeliverables}
                          className="h-11 sm:h-10 px-5 rounded-lg font-semibold text-sm bg-[#0A0A0A] hover:!bg-[#FF2D78] !text-white hover:!text-white border-none flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Approve & Release Escrow Payment</span>
                        </Button>

                        <Button
                          type="default"
                          onClick={() => setIsRevisionModalOpen(true)}
                          className="h-11 sm:h-10 px-4 rounded-lg font-semibold text-sm border-[#D2D2CA] text-[#0A0A0A] flex items-center justify-center gap-2 hover:border-[#0A0A0A] cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>Request Revisions</span>
                        </Button>

                        <Button
                          type="default"
                          onClick={() => setIsReportModalOpen(true)}
                          className="h-11 sm:h-10 px-4 rounded-lg font-semibold text-sm border-[#E7E7E2] text-[#66665E] hover:text-[#0A0A0A] flex items-center justify-center gap-2 cursor-pointer bg-white"
                        >
                          <HelpCircle className="w-4 h-4" />
                          <span>Report an Issue</span>
                        </Button>
                      </div>
                      {order.reviewDueAt && (
                        <p className="text-xs text-[#66665E]">
                          If you take no action, the order is approved automatically on {shortDate(order.reviewDueAt)}.
                        </p>
                      )}
                    </div>
                  )}

                  {order.escrowReleased && (
                    <div className="p-4 bg-white sm:bg-[#FAFAF8] rounded-lg border border-[#E7E7E2] flex items-center gap-3">
                      <ShieldCheck className="w-5 h-5 text-[#FF2D78] shrink-0" />
                      <div className="text-sm text-[#0A0A0A] font-semibold">
                        Payment of {formatCents(order.priceCents)} has been released to {creatorName}&apos;s wallet.
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 sm:p-10 text-center bg-white sm:bg-[#FAFAF8] rounded-lg border border-[#E7E7E2] space-y-2.5">
                  <div className="w-12 h-12 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] text-[#0A0A0A] flex items-center justify-center mx-auto shadow-2xs">
                    <Clock className="w-6 h-6" />
                  </div>
                  <p className="font-bold text-sm text-[#0A0A0A]">Deliverables In Progress</p>
                  <p className="text-sm text-[#66665E] max-w-sm mx-auto leading-relaxed">
                    {creatorName} is currently crafting your content according to the agreed brief.
                  </p>
                </div>
              )}
            </div>

            {/* Campaign Brief Summary */}
            <div className="sm:bg-white sm:rounded-xl sm:p-6 sm:border sm:border-[#E7E7E2] sm:shadow-2xs space-y-4 sm:space-y-5">
              <h3 className="text-xl sm:text-2xl font-extrabold text-[#0A0A0A] tracking-tight">Campaign Brief & Scope</h3>
              <p className="text-sm text-[#44443E] leading-relaxed bg-white sm:bg-[#FAFAF8] p-4 sm:p-5 rounded-lg border border-[#E7E7E2] whitespace-pre-line break-words">
                {order.brief || order.title}
              </p>

              {order.requirements.length > 0 && (
                <div className="pt-2">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-[#66665E] mb-3">Key Requirements</h4>
                  <ul className="space-y-2.5">
                    {order.requirements.map((req, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-sm text-[#0A0A0A]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#0A0A0A] shrink-0 mt-2" />
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Right Column (5 cols): Communication & Review */}
          <div className="xl:col-span-5 space-y-6 md:space-y-0 md:grid md:grid-cols-2 md:items-start md:gap-6 xl:block xl:space-y-6">
            {/* Direct Communication Hub Card */}
            <div className="bg-white rounded-xl p-4 sm:p-6 border border-[#E7E7E2] shadow-2xs space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-[#E7E7E2]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg shrink-0 bg-[#FAFAF8] border border-[#E7E7E2] flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-[#0A0A0A]" />
                  </div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">Direct Communication</h3>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[#66665E] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[#0A0A0A]">Active</span>
                </div>
              </div>

              {/* Creator Preview */}
              <div className="flex items-center gap-3.5 p-4 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2]">
                <AccountAvatar src={creator?.avatar} name={creatorName} className="w-12 h-12 rounded-full border border-[#E7E7E2] shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-[#0A0A0A] truncate">{creatorName}</span>
                    {creator?.verified && <VerifiedBadge size="sm" />}
                  </div>
                  {creator?.handle && <p className="text-xs text-[#66665E] truncate">@{creator.handle}</p>}
                </div>
              </div>

              {/* Info Note */}
              <div className="p-4 rounded-lg bg-[#FAF8F5] border border-[#EBE7DF] text-xs text-[#66665E] leading-relaxed space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-[#0A0A0A]">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>Centralized Messaging</span>
                </div>
                <p>
                  To prevent duplicate conversations and keep all files organized, all direct messaging, brief discussions, and revision
                  feedback with {creatorName} are handled in your dedicated Messages inbox.
                </p>
              </div>

              {/* Primary Action Button */}
              <Link
                href={messagesHref}
                className="w-full h-11 rounded-lg px-4 bg-[#0A0A0A] hover:bg-[#FF2D78] text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-xs group/msg cursor-pointer"
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                <span className="truncate">Open Conversation in Messages</span>
                <ArrowRight className="w-4 h-4 shrink-0 transition-transform group-hover/msg:translate-x-1" />
              </Link>
            </div>

            {/* Escrow & Protection Summary */}
            <div className="bg-white rounded-xl p-4 sm:p-6 border border-[#E7E7E2] shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">Escrow Guarantee</h4>
              </div>
              <p className="text-xs text-[#66665E] leading-relaxed">
                Your payment of {totalLabel} is securely protected in escrow. Funds are only released to {creatorName} once you review and
                approve the final deliverables.
              </p>
            </div>

            {/* Review Form (Appears when approved) */}
            {order.status === 'approved' && !order.review && (
              <div className="bg-white rounded-xl p-4 sm:p-6 border border-[#E7E7E2] shadow-2xs space-y-4">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <h3 className="font-bold text-sm text-[#0A0A0A]">Leave a Review</h3>
                </div>
                <p className="text-sm text-[#66665E]">Rate {creatorName}&apos;s work to finalize the campaign.</p>

                <form onSubmit={handleSubmitReview} className="space-y-3.5">
                  <div>
                    <Rate value={ratingVal} onChange={(v) => setRatingVal(v || 1)} />
                  </div>
                  <Input.TextArea
                    rows={3}
                    placeholder="Describe how the collaboration went, communication, content quality..."
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    className="rounded-lg text-base sm:text-sm font-sans"
                    maxLength={2000}
                    required
                  />
                  <Button
                    type="primary"
                    htmlType="submit"
                    block
                    loading={reviewing}
                    className="h-11 sm:h-10 rounded-lg font-semibold text-sm bg-[#0A0A0A] hover:!bg-[#FF2D78] !text-white hover:!text-white border-none shadow-sm cursor-pointer"
                  >
                    Submit Review & Complete
                  </Button>
                </form>
              </div>
            )}

            {order.review && (
              <div className="bg-white rounded-xl p-4 sm:p-6 border border-[#E7E7E2] shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-[#0A0A0A]">Your Review</h3>
                  <div className="flex text-amber-500">
                    {[...Array(order.review.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-amber-500" />
                    ))}
                  </div>
                </div>
                <p className="text-sm text-[#555550] italic bg-[#FAFAF8] p-4 rounded-lg border border-[#E7E7E2] leading-relaxed">
                  &ldquo;{order.review.comment}&rdquo;
                </p>
                <span className="text-sm text-[#66665E] block">Submitted {monthYear(order.review.createdAt)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Phone / tablet: keep the review decision within thumb reach while scrolling the deliverables. */}
      {order.status === 'deliverable_submitted' && (
        <div className="lg:hidden sticky bottom-0 z-20 border-t border-[#E7E7E2] bg-white/95 backdrop-blur px-4 sm:px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center gap-2">
          <Button
            type="primary"
            loading={approving}
            onClick={handleApproveDeliverables}
            className="flex-1 min-w-0 h-11 px-4 rounded-lg font-semibold text-sm bg-[#0A0A0A] hover:!bg-[#FF2D78] !text-white hover:!text-white border-none flex items-center justify-center gap-2 shadow-xs cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="truncate">Approve & Release Payment</span>
          </Button>
          <Button
            type="default"
            onClick={() => setIsRevisionModalOpen(true)}
            aria-label="Request Revisions"
            className="h-11 px-3.5 rounded-lg font-semibold text-sm border-[#D2D2CA] text-[#0A0A0A] flex items-center justify-center gap-2 hover:border-[#0A0A0A] cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">Request Revisions</span>
          </Button>
        </div>
      )}

      {/* Revision Modal */}
      <Modal
        title="Request Revisions from Creator"
        open={isRevisionModalOpen}
        onCancel={() => setIsRevisionModalOpen(false)}
        onOk={handleRequestRevision}
        okText="Send Revision Request"
        confirmLoading={requestingRevision}
        okButtonProps={{ className: 'bg-[#0A0A0A] rounded-lg' }}
      >
        <div className="space-y-3 pt-2">
          <p className="text-sm text-[#66665E]">Please clearly describe the timestamps or specific adjustments required for the creator.</p>
          <Input.TextArea
            rows={4}
            placeholder="e.g. Please shorten the intro hook by 2 seconds and emphasize the promo code in the ending caption."
            value={revisionNotes}
            onChange={(e) => setRevisionNotes(e.target.value)}
            maxLength={2000}
            className="rounded-lg text-base sm:text-xs"
          />
        </div>
      </Modal>

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
            Need help? Our Trust & Support team mediates between brands and creators. Submitting a report alerts support specialists who
            review briefs, chat history, and deliverables to resolve issues amicably.
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#66665E]">Issue Category</label>
            <Select
              value={reportCategory}
              onChange={(val) => setReportCategory(val)}
              className="w-full h-10 rounded-lg"
              options={[
                { value: 'Quality / Creative Brief Disagreement', label: 'Deliverables do not match agreed creative brief' },
                { value: 'Missed Delivery Deadline / Creator Unresponsive', label: 'Missed delivery deadline or creator unresponsive' },
                { value: 'Video Formatting / Technical Problems', label: 'Technical or formatting issues with video files' },
                { value: 'Scope or Revision Disagreement', label: 'Disagreement regarding revisions or scope' },
                { value: 'Other Support Inquiry', label: 'Other order support request' },
              ]}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#66665E]">Describe the Issue</label>
            <Input.TextArea
              rows={4}
              placeholder="Explain specifically what is missing, what went wrong, or what assistance you need from Influverse Support..."
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
