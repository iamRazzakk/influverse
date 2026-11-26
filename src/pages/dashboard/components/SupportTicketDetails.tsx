import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MessageSquare, PlayCircle, Send, Undo2, ExternalLink } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { PartyCell } from '@/components/shared/PartyCell';
import { OrderStatusBadge } from '@/components/shared/OrderStatusBadge';
import { DetailRow, ErrorBanner } from '@/components/shared/ListControls';
import { ROUTES } from '@/constants/routes';
import { getErrorMessage } from '@/lib/api/baseApi';
import {
  useGetSupportTicketQuery,
  useResolveSupportTicketMutation,
  type AdminTicketDetail,
  type TicketResolutionAction,
} from '@/lib/api/supportApi';
import { formatCents, formatDateTime } from '@/lib/utils';
import { TicketStatusBadge } from './TicketStatusBadge';

const RESOLUTION_LABEL: Record<TicketResolutionAction, string> = {
  resume: 'Order resumed',
  release: 'Escrow released to creator',
  refund: 'Brand refunded',
};

/** Builds the confirm text so the admin sees exactly how much money moves and to whom. */
const describeResolution = (ticket: AdminTicketDetail, action: TicketResolutionAction) => {
  const order = ticket.order;
  const orderLabel = order ? `order ${order.code}` : 'this order';
  if (action === 'release') {
    return `Release ${formatCents(order?.priceCents)} from escrow to ${ticket.creator?.name ?? 'the creator'}? ${orderLabel} is marked approved and the platform keeps the ${formatCents(order?.feeCents)} fee. This cannot be undone.`;
  }
  if (action === 'refund') {
    return `Refund ${formatCents(order?.totalCents)} to ${ticket.brand?.name ?? 'the brand'} through Stripe? ${orderLabel} is cancelled and the creator is not paid. This cannot be undone.`;
  }
  return `Take ${orderLabel} off hold? It continues exactly where it stopped and no money moves.`;
};

/**
 * One support ticket: what was reported, the order it holds, both parties and the resolve actions.
 * resume needs tickets.manage; release / refund also need disputes.arbitrate — the server answers 403
 * otherwise and the message is shown in the panel.
 */
export const SupportTicketDetails: React.FC<{
  ticketId: string;
  onClose: () => void;
  onOpenChat: (conversationId: string) => void;
}> = ({ ticketId, onClose, onOpenChat }) => {
  const { data: ticket, isLoading, isError, error } = useGetSupportTicketQuery(ticketId);
  const [resolveTicket, { isLoading: isResolving }] = useResolveSupportTicketMutation();
  const [pendingAction, setPendingAction] = useState<TicketResolutionAction | null>(null);
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState('');

  const isActive = ticket ? ticket.status !== 'resolved' : false;
  // Money can only move while this ticket still holds the order (server re-checks this too).
  const orderOnHold = ticket?.order?.status === 'disputed';

  const confirmResolve = async () => {
    if (!ticket || !pendingAction) return;
    setActionError('');
    try {
      await resolveTicket({ id: ticket.id, action: pendingAction, note: note.trim() || undefined }).unwrap();
      setNote('');
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <>
      <Modal
        isOpen={true}
        onClose={onClose}
        maxWidth="xl"
        title={
          ticket ? (
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-neutral-900 font-mono">{ticket.code}</span>
              <TicketStatusBadge status={ticket.status} />
            </div>
          ) : (
            'Support ticket'
          )
        }
        description={ticket ? `${ticket.category} · opened ${formatDateTime(ticket.createdAt)}` : undefined}
        footer={
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        }
      >
        {isLoading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
          </div>
        ) : isError || !ticket ? (
          <div className="py-8 text-center text-xs text-neutral-500">{getErrorMessage(error, 'Ticket not found.')}</div>
        ) : (
          <div className="space-y-4 text-xs">
            <ErrorBanner message={actionError} onDismiss={() => setActionError('')} />

            {/* Report */}
            <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-neutral-900">Reported by the {ticket.reporterRole}</span>
                <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">{ticket.category}</span>
              </div>
              <p className="text-neutral-700 leading-relaxed whitespace-pre-line">{ticket.reason}</p>
            </div>

            {/* Parties + chat shortcuts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(['brand', 'creator'] as const).map((role) => {
                const party = role === 'brand' ? ticket.brand : ticket.creator;
                const conversationId = role === 'brand' ? ticket.brandConversationId : ticket.creatorConversationId;
                return (
                  <div key={role} className="p-3.5 bg-white rounded-xl border border-neutral-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">{role}</span>
                      {ticket.reporterRole === role && (
                        <span className="text-[10px] font-bold text-brand-pink uppercase tracking-wider">reporter</span>
                      )}
                    </div>
                    <PartyCell party={party} fallback={`Deleted ${role}`} />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      leftIcon={<MessageSquare className="w-3.5 h-3.5" />}
                      disabled={!conversationId}
                      onClick={() => conversationId && onOpenChat(conversationId)}
                    >
                      Open {role} chat
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Order summary */}
            {ticket.order ? (
              <div className="p-3.5 bg-white rounded-xl border border-neutral-200 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-neutral-900">Order</span>
                  <OrderStatusBadge status={ticket.order.status} />
                </div>
                <DetailRow label="Code">
                  <Link
                    to={`${ROUTES.DASHBOARD.ORDERS}?q=${encodeURIComponent(ticket.order.code)}`}
                    className="inline-flex items-center gap-1 font-mono hover:underline"
                  >
                    {ticket.order.code}
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </DetailRow>
                <DetailRow label="Title">{ticket.order.title}</DetailRow>
                <DetailRow label="Creator price">{formatCents(ticket.order.priceCents)}</DetailRow>
                <DetailRow label="Platform fee">{formatCents(ticket.order.feeCents)}</DetailRow>
                <DetailRow label="Brand paid">{formatCents(ticket.order.totalCents)}</DetailRow>
                <DetailRow label="Deliverables submitted">{ticket.order.deliverablesCount}</DetailRow>
                <DetailRow label="Paid">{formatDateTime(ticket.order.paidAt)}</DetailRow>
                <DetailRow label="Due">{formatDateTime(ticket.order.dueAt)}</DetailRow>
              </div>
            ) : (
              <div className="p-3.5 bg-white rounded-xl border border-neutral-200 text-neutral-500">
                {ticket.orderCode ? `Order ${ticket.orderCode} no longer exists.` : 'This ticket is not linked to an order.'}
              </div>
            )}

            {/* Resolution */}
            {ticket.resolution ? (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1 text-emerald-900">
                <span className="font-bold block">
                  {RESOLUTION_LABEL[ticket.resolution.action]} · by {ticket.resolution.by === 'admin' ? 'Influverse Support' : `the ${ticket.resolution.by}`}
                </span>
                <span className="text-[11px] block">{formatDateTime(ticket.resolution.at)}</span>
                {ticket.resolution.note && <p className="leading-relaxed whitespace-pre-line">{ticket.resolution.note}</p>}
              </div>
            ) : (
              isActive && (
                <div className="p-3.5 bg-white rounded-xl border border-neutral-200 space-y-3">
                  <span className="font-bold text-neutral-900 block">Resolve ticket</span>
                  <Textarea
                    label="Note (optional, shown to both parties)"
                    value={note}
                    maxLength={2000}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    className="min-h-[72px]"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="primary" leftIcon={<PlayCircle className="w-3.5 h-3.5" />} onClick={() => setPendingAction('resume')}>
                      Resume order
                    </Button>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white border-transparent"
                      leftIcon={<Send className="w-3.5 h-3.5" />}
                      onClick={() => setPendingAction('release')}
                      disabled={!orderOnHold}
                    >
                      Release to creator
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      leftIcon={<Undo2 className="w-3.5 h-3.5" />}
                      onClick={() => setPendingAction('refund')}
                      disabled={!orderOnHold}
                    >
                      Refund brand
                    </Button>
                  </div>
                  <p className="text-[11px] text-neutral-500 leading-relaxed">
                    {orderOnHold
                      ? 'Release and refund move money and need the "arbitrate disputes" permission (admins and super admins).'
                      : 'The order is not on hold by this ticket any more, so only "Resume" (close the ticket) is possible.'}
                  </p>
                </div>
              )
            )}
          </div>
        )}
      </Modal>

      {ticket && (
        <ConfirmDialog
          isOpen={Boolean(pendingAction)}
          onClose={() => setPendingAction(null)}
          onConfirm={() => void confirmResolve()}
          isLoading={isResolving}
          title={
            pendingAction === 'release' ? 'Release escrow' : pendingAction === 'refund' ? 'Refund the brand' : 'Resume the order'
          }
          description={pendingAction ? describeResolution(ticket, pendingAction) : ''}
          variant={pendingAction === 'refund' ? 'danger' : pendingAction === 'release' ? 'warning' : 'info'}
          confirmLabel={
            pendingAction === 'release'
              ? `Release ${formatCents(ticket.order?.priceCents)}`
              : pendingAction === 'refund'
                ? `Refund ${formatCents(ticket.order?.totalCents)}`
                : 'Resume order'
          }
        />
      )}
    </>
  );
};
