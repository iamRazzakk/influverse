import { notFound } from 'next/navigation';
import { serverApi } from '@/lib/api/server';
import { ApiError } from '@/lib/api/core';
import { ordersEndpoints } from '@/lib/api/endpoints/orders';
import { OrderView } from './OrderView';

/**
 * Server page: loads the order (GET /orders/:id). 404 → Next.js not-found page; any other failure
 * renders the view's "Order not found" card. Actions in the view re-render this page via router.refresh().
 */
export default async function BrandOrderDetailPage({ params }: { params: { id: string } }) {
  const order = await ordersEndpoints(serverApi())
    .get(params.id)
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.isNotFound) notFound();
      return null;
    });

  return <OrderView order={order} />;
}
