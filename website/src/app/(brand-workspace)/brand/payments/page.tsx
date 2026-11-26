import { serverApi } from '@/lib/api/server';
import { paymentsEndpoints } from '@/lib/api/endpoints/payments';
import { PaymentsView } from './PaymentsView';

/** Server page: loads the brand's payment ledger (GET /payments/me). A failure shows an empty ledger. */
export default async function BrandPaymentsPage() {
  const data = await paymentsEndpoints(serverApi()).brandPayments().catch(() => null);
  return <PaymentsView data={data} />;
}
