import { serverApi } from '@/lib/api/server';
import { paymentsEndpoints } from '@/lib/api/endpoints/payments';
import { PaymentsView } from './PaymentsView';

/**
 * Server page: loads the creator's payouts, escrow totals and Stripe Connect account state
 * (GET /payouts/me) before render. A failed request renders the empty ledger.
 */
export default async function CreatorPaymentsPage() {
  const data = await paymentsEndpoints(serverApi()).creatorPayouts().catch(() => null);
  return <PaymentsView data={data} />;
}
