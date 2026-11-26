import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LifeBuoy, Inbox, Clock, MessagesSquare, Loader2, Eye } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { PartyCell } from '@/components/shared/PartyCell';
import { FilterTabs, SubmitSearch } from '@/components/shared/ListControls';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { getErrorMessage } from '@/lib/api/baseApi';
import { useGetSupportTicketsQuery, useGetSupportUnreadCountQuery, type SupportTicketStatus } from '@/lib/api/supportApi';
import { formatDate, formatNumber } from '@/lib/utils';
import { SupportTicketDetails } from './components/SupportTicketDetails';
import { SupportInbox } from './components/SupportInbox';
import { TicketStatusBadge } from './components/TicketStatusBadge';

type StatusFilter = 'all' | SupportTicketStatus;

const COLUMN_COUNT = 7;
/** Tickets change when users report issues or admins reply — refresh the list now and then. */
const TICKETS_POLL_MS = 30_000;

/**
 * Support desk — tickets raised with "Report an issue" on an order (the order goes on hold) and the
 * "Influverse Support" chat every user has. Deep links from admin notifications:
 *   /tickets?ticket=<ticketId>      opens the ticket panel
 *   /tickets?conv=<conversationId>  opens that support chat
 */
export const TicketsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTicketId = searchParams.get('ticket');
  const selectedConversationId = searchParams.get('conv');

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading, isFetching, isError, error, refetch } = useGetSupportTicketsQuery(
    {
      status: statusFilter === 'all' ? undefined : statusFilter,
      q: search || undefined,
      page: currentPage,
      limit: pageSize,
    },
    { pollingInterval: TICKETS_POLL_MS, skipPollingIfUnfocused: true, refetchOnFocus: true }
  );
  const { data: unreadChats } = useGetSupportUnreadCountQuery(undefined, {
    pollingInterval: 10_000,
    skipPollingIfUnfocused: true,
  });
  const tickets = data?.items ?? [];
  const stats = data?.stats;
  const showCount = (n?: number) => (n === undefined ? '—' : formatNumber(n));

  // Both panels live in the URL so they survive reloads and match notification links.
  // Opening a chat from a ticket closes the ticket panel; opening a ticket keeps the selected chat.
  const updateParams = (next: { ticket?: string | null; conv?: string | null }) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    setSearchParams(params, { replace: true });
  };
  const openTicket = (ticketId: string) => updateParams({ ticket: ticketId });
  const closeTicket = () => updateParams({ ticket: null });
  const openChat = (conversationId: string) => updateParams({ ticket: null, conv: conversationId });

  // Bring the inbox into view when a chat is opened from a ticket or a notification link.
  // Picking a chat inside the inbox itself must not jump the page, hence the flag.
  const inboxRef = useRef<HTMLDivElement>(null);
  const selectedFromInbox = useRef(false);
  useEffect(() => {
    if (selectedConversationId && !selectedFromInbox.current) {
      inboxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    selectedFromInbox.current = false;
  }, [selectedConversationId]);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader title="Support" subtitle="Manage customer support inquiries and user reports." />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Open"
          value={showCount(stats?.open)}
          icon={<Inbox className="w-5 h-5" />}
          accentColor="pink"
          subtitle="Waiting for a first reply"
        />
        <StatCard
          title="In Progress"
          value={showCount(stats?.inProgress)}
          icon={<Clock className="w-5 h-5" />}
          accentColor="amber"
          subtitle="Support has replied"
        />
        <StatCard
          title="Unread Chats"
          value={showCount(unreadChats)}
          icon={<MessagesSquare className="w-5 h-5" />}
          accentColor="black"
          subtitle="Support threads with new user messages"
        />
        <StatCard
          title="Resolved"
          value={showCount(stats?.resolved)}
          icon={<LifeBuoy className="w-5 h-5" />}
          accentColor="emerald"
          subtitle="Closed tickets"
        />
      </div>

      {/* Tickets */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <FilterTabs<StatusFilter>
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value);
            setCurrentPage(1);
          }}
          tabs={[
            { value: 'open', label: 'Open', count: stats?.open },
            { value: 'in_progress', label: 'In progress', count: stats?.inProgress },
            { value: 'resolved', label: 'Resolved', count: stats?.resolved },
            { value: 'all', label: 'All' },
          ]}
        />
        <SubmitSearch
          value={search}
          onSubmit={(value) => {
            setSearch(value);
            setCurrentPage(1);
          }}
          placeholder="Ticket or order code (Enter)"
        />
      </div>

      <Card className={`border-neutral-200/80 overflow-hidden ${isFetching && !isLoading ? 'opacity-90 transition-opacity' : ''}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Creator</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Opened</TableHead>
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
                    <p className="font-bold text-neutral-900">Could not load tickets</p>
                    <p className="text-xs text-neutral-400">{getErrorMessage(error)}</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
                      Try Again
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : tickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="p-6">
                  <EmptyState
                    icon={<LifeBuoy className="w-6 h-6" />}
                    title={search ? 'No matching tickets' : 'No support tickets'}
                    description={
                      search
                        ? 'Check the ticket or order code and try again.'
                        : 'Tickets and user reports from brands and creators will show up here.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              tickets.map((ticket) => (
                <TableRow key={ticket.id} className="cursor-pointer" onClick={() => openTicket(ticket.id)}>
                  <TableCell className="max-w-[280px]">
                    <div className="text-xs font-mono font-bold text-neutral-800">{ticket.code}</div>
                    <div className="text-xs text-neutral-500 font-semibold truncate" title={ticket.reason}>
                      {ticket.category} · by {ticket.reporterRole}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono font-bold text-neutral-800">{ticket.orderCode ?? '—'}</TableCell>
                  <TableCell>
                    <PartyCell party={ticket.brand} fallback="—" />
                  </TableCell>
                  <TableCell>
                    <PartyCell party={ticket.creator} fallback="—" />
                  </TableCell>
                  <TableCell>
                    <TicketStatusBadge status={ticket.status} />
                  </TableCell>
                  <TableCell className="text-neutral-600 text-sm font-semibold whitespace-nowrap">{formatDate(ticket.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Eye className="w-3.5 h-3.5" />}
                      onClick={(e) => {
                        e.stopPropagation();
                        openTicket(ticket.id);
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
            itemLabel="tickets"
          />
        </div>
      </Card>

      {/* Support inbox */}
      <div ref={inboxRef} className="scroll-mt-6">
        <Card className="border-neutral-200/80">
          <CardHeader className="p-5 pb-4">
            <CardTitle>Support inbox</CardTitle>
            <CardDescription>
              Every brand and creator has one "Influverse Support" chat. Replies are sent as Influverse Support.
            </CardDescription>
          </CardHeader>
          <SupportInbox
            selectedConversationId={selectedConversationId}
            onSelectConversation={(conversationId) => {
              selectedFromInbox.current = true;
              updateParams({ conv: conversationId });
            }}
            onOpenTicket={openTicket}
          />
        </Card>
      </div>

      {selectedTicketId && <SupportTicketDetails ticketId={selectedTicketId} onClose={closeTicket} onOpenChat={openChat} />}
    </div>
  );
};

export default TicketsPage;
