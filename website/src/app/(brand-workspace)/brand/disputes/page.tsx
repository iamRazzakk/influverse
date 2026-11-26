import React from 'react';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { DisputesDocket, type DocketTab } from '@/components/shared/DisputesDocket';
import { serverApi } from '@/lib/api/server';
import { paymentsEndpoints } from '@/lib/api/endpoints/payments';
import { chatEndpoints } from '@/lib/api/endpoints/chat';

/**
 * Server page: loads the brand's support tickets for the `?status=` tab and the support chat thread
 * in parallel. Switching tabs changes the URL, so this page re-renders with the new list.
 */
export default async function BrandDisputesPage({ searchParams }: { searchParams: { status?: string } }) {
  const status: DocketTab = searchParams.status === 'open' || searchParams.status === 'resolved' ? searchParams.status : 'all';
  const api = serverApi();
  const [tickets, supportConv] = await Promise.all([
    paymentsEndpoints(api)
      .supportTickets(status === 'all' ? {} : { status })
      .catch(() => null),
    chatEndpoints(api)
      .supportConversation()
      .catch(() => null),
  ]);

  return (
    <div className="min-h-screen pb-16 font-sans">
      <WorkspaceHeader
        title="Order Issues & Support"
        subtitle="Report a problem with an order and our support team will help."
        backHref="/brand/campaigns"
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <DisputesDocket
          role="brand"
          backHref="/brand/campaigns"
          tickets={tickets}
          status={status}
          supportConversationId={supportConv?.id ?? null}
        />
      </div>
    </div>
  );
}
