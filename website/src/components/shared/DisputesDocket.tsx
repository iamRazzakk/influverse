'use client';

import React, { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CheckCircle2, FileText, LifeBuoy, Loader2, MessageSquare, ShieldCheck } from 'lucide-react';
import { AccountAvatar } from '@/components/auth/AccountAvatar';
import { formatCents } from '@/lib/format';
import type { Paginated } from '@/lib/api/types';
import type { SupportTicket } from '@/lib/api/endpoints/payments';

interface DisputesDocketProps {
  role?: 'brand' | 'creator' | 'admin';
  backHref?: string;
  showHeader?: boolean;
  /** Brand / creator: tickets loaded by the server page for `status` (null = request failed). */
  tickets?: Paginated<SupportTicket> | null;
  /** Current tab, from the page's `?status=` search param. */
  status?: DocketTab;
  /** The viewer's "Influverse Support" chat thread (null = not loaded / none yet). */
  supportConversationId?: string | null;
}

export type DocketTab = 'all' | 'open' | 'resolved';

const filedDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const RESOLUTION_TEXT: Record<string, string> = {
  resume: 'Resolved — order continued',
  release: 'Resolved — payment released to creator',
  refund: 'Resolved — brand refunded',
};

/**
 * "Order issues & support" (D24: no arbitration flow any more). Lists the support tickets on the
 * viewer's orders, in the original docket card layout. Tickets are opened from an order page
 * ("Report an issue"); the conversation happens in the Influverse Support chat thread.
 */
export function DisputesDocket({
  role = 'brand',
  showHeader = false,
  tickets: ticketPage = null,
  status: activeTab = 'all',
  supportConversationId = null,
}: DisputesDocketProps) {
  const router = useRouter();
  const pathname = usePathname();
  // Tabs change `?status=`; the server page re-renders with that list. Show the spinner meanwhile.
  const [isLoading, startTransition] = useTransition();
  const setActiveTab = (tab: DocketTab) =>
    startTransition(() => router.push(tab === 'all' ? pathname : `${pathname}?status=${tab}`));
  const isUser = role === 'brand' || role === 'creator';

  const tickets = ticketPage?.items ?? [];
  const ordersHref = role === 'creator' ? '/creator/campaigns' : '/brand/campaigns';
  const supportHref = `/${role}/messages${supportConversationId ? `?conv=${supportConversationId}` : ''}`;

  if (!isUser) {
    // The public /disputes page: explain the process (tickets are private to the parties).
    return (
      <div className="space-y-6 font-sans">
        {showHeader && (
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-4xl font-black text-[#0A0A0A] tracking-tight">Order issues & support</h1>
            <p className="text-sm sm:text-base text-[#66665E] font-medium max-w-2xl">
              Payments stay in escrow until the brand approves the work. If something goes wrong, our support team steps in.
            </p>
          </div>
        )}
        <div className="bg-white rounded-3xl border border-[#E7E7E2] p-8 sm:p-12 text-center space-y-5 shadow-2xs">
          <div className="w-14 h-14 rounded-2xl bg-[#FFF0F5] text-[#FF2D78] flex items-center justify-center mx-auto">
            <LifeBuoy className="w-7 h-7" />
          </div>
          <p className="text-sm text-[#66665E] leading-relaxed max-w-lg mx-auto">
            To report a problem with an order, open the order and choose <strong>Report an issue</strong>. A support ticket is created
            and the escrow payment is put on hold until our team helps both sides reach a fair outcome.
          </p>
          <Link href="/faq" className="inline-flex px-5 py-2.5 rounded-full bg-[#0A0A0A] hover:bg-[#FF2D78] text-white text-sm font-bold transition-colors">
            Read the FAQ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Tabs */}
      <div className="flex w-fit max-w-full items-center gap-1 bg-[#F4F4F0] p-1 rounded-lg overflow-x-auto no-scrollbar">
        {(['all', 'open', 'resolved'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`h-9 shrink-0 whitespace-nowrap px-3 sm:px-3.5 text-sm font-bold rounded-md transition-all capitalize cursor-pointer ${
              activeTab === tab ? 'bg-white text-[#0A0A0A] shadow-xs' : 'text-[#66665E] hover:text-[#0A0A0A]'
            }`}
          >
            {tab === 'all' ? 'All Cases' : `${tab} Cases`}
          </button>
        ))}
      </div>

      {/* Ticket Cards */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="p-12 flex justify-center bg-white rounded-xl border border-[#E7E7E2]">
            <Loader2 className="w-6 h-6 animate-spin text-[#A3A39B]" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="px-4 py-10 sm:p-12 text-center text-[#66665E] text-sm bg-white rounded-xl border border-[#E7E7E2] space-y-4">
            <p>
              {activeTab === 'all'
                ? 'No issues reported. To report a problem, open the order and choose “Need Help?”.'
                : 'No cases found matching current filter.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href={ordersHref} className="h-10 px-4 rounded-lg bg-[#0A0A0A] hover:bg-[#FF2D78] text-white text-xs font-bold transition-colors inline-flex items-center">
                Go to campaigns
              </Link>
              <Link
                href={supportHref}
                className="h-10 px-4 rounded-lg bg-white border border-[#E7E7E2] hover:border-[#0A0A0A] text-[#0A0A0A] text-xs font-bold inline-flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Chat with Support
              </Link>
            </div>
          </div>
        ) : (
          tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} role={role} supportHref={supportHref} />)
        )}
      </div>

      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#66665E]">
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>Escrow stays locked while a ticket is open</span>
      </div>
    </div>
  );
}

function TicketCard({ ticket, role, supportHref }: { ticket: SupportTicket; role: 'brand' | 'creator' | 'admin'; supportHref: string }) {
  const isOpen = ticket.status !== 'resolved';
  const orderHref = ticket.orderId ? `/${role}/orders/${ticket.orderId}` : null;
  const amountCents = role === 'creator' ? ticket.order?.priceCents : ticket.order?.totalCents;

  return (
    <div className="bg-white rounded-xl p-4 sm:p-6 border border-[#E7E7E2] shadow-2xs space-y-5 sm:space-y-6 hover:border-[#D2D2CA] transition-all">
      {/* Top Metainfo Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#F0F0EA]">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="font-mono text-xs font-black text-[#0A0A0A] bg-[#F4F4F0] px-2.5 py-1 rounded-md border border-[#E7E7E2]">
            {ticket.code}
          </span>
          <span
            className={`text-xs font-extrabold uppercase px-2.5 py-1 rounded-md inline-flex items-center gap-1.5 ${
              isOpen ? 'bg-[#FFF0F5] text-[#FF2D78] border border-[#FF2D78]/25' : 'bg-[#F0FDF4] text-[#16A34A] border border-[#16A34A]/25'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-[#FF2D78]' : 'bg-[#16A34A]'}`} />
            {isOpen ? (ticket.status === 'in_progress' ? 'Support Replied' : 'Under Review') : 'Resolved'}
          </span>
          {orderHref && (
            <Link href={orderHref} className="text-xs text-[#66665E] font-medium hover:text-[#0A0A0A] transition-colors">
              Order #{ticket.orderCode}
            </Link>
          )}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-4 text-xs font-medium text-[#66665E]">
          <span>Filed: {filedDate(ticket.createdAt)}</span>
          {amountCents != null && <span className="text-[#0A0A0A] font-extrabold text-base">{formatCents(amountCents)}</span>}
        </div>
      </div>

      {/* Campaign Title & Grievance */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-6">
        <div className="md:col-span-7 space-y-4 min-w-0">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#888880]">CAMPAIGN</div>
            <h3 className="text-lg font-black text-[#0A0A0A] tracking-tight mt-0.5 break-words">{ticket.order?.title ?? 'Support request'}</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2 gap-3 pt-1">
            {(
              [
                ['BRAND', ticket.brand],
                ['CREATOR', ticket.creator],
              ] as const
            ).map(([label, party]) => (
              <div key={label} className="min-w-0 p-3.5 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#888880]">{label}</div>
                <div className="flex items-center gap-2.5 pt-0.5">
                  <AccountAvatar src={party?.avatar} name={party?.name} className="w-7 h-7 shrink-0 rounded-full border border-[#E7E7E2]" />
                  <span className="min-w-0 text-sm font-bold text-[#0A0A0A] truncate">{party?.name ?? '—'}</span>
                </div>
              </div>
            ))}
          </div>

          {ticket.order?.brief && (
            <div className="p-3.5 rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] text-xs text-[#555550] line-clamp-3 break-words">
              <strong className="text-[#0A0A0A]">Scope:</strong> {ticket.order.brief}
            </div>
          )}
        </div>

        <div className="md:col-span-5 space-y-3 flex flex-col justify-between min-w-0">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#888880] mb-2">
              REPORTED BY {ticket.reporterRole === role ? 'YOU' : ticket.reporterRole.toUpperCase()}
            </div>
            <div className="p-4 rounded-lg bg-[#FFF5F8] border border-[#FFE0EB] text-sm text-[#7A1E3E] font-medium leading-relaxed italic break-words">
              &ldquo;{ticket.category}: {ticket.reason}&rdquo;
            </div>
            {ticket.resolution?.note && (
              <p className="mt-2 text-xs text-[#66665E] leading-relaxed">
                <strong className="text-[#0A0A0A]">Support note:</strong> {ticket.resolution.note}
              </p>
            )}
          </div>

          {/* Bottom Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#F0F0EA] md:border-0">
            {orderHref ? (
              <Link href={orderHref} className="inline-flex h-10 items-center gap-1.5 text-xs font-bold text-[#FF2D78] hover:underline">
                <FileText className="w-4 h-4" />
                <span>View Order</span>
              </Link>
            ) : (
              <span />
            )}

            {isOpen ? (
              <Link
                href={supportHref}
                className="h-10 px-4 rounded-lg bg-[#0A0A0A] hover:bg-zinc-800 text-white text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Mediation Chat</span>
              </Link>
            ) : (
              <span className="text-xs text-[#16A34A] font-bold inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {RESOLUTION_TEXT[ticket.resolution?.action ?? 'resume']}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
