import { notFound } from 'next/navigation';
import { serverApi } from '@/lib/api/server';
import { ApiError } from '@/lib/api/core';
import { ordersEndpoints } from '@/lib/api/endpoints/orders';
import { OrderFulfilmentView } from './OrderFulfilmentView';

/**
 * Server page: loads the order before render. Not found / not this creator's order → 404.
 * Any other failure (server down…) → the view's "Order not available" state.
 */
export default async function CreatorOrderFulfilmentPage({ params }: { params: { id: string } }) {
  const order = await ordersEndpoints(serverApi())
    .get(params.id)
    .catch((error: unknown) => {
      if (error instanceof ApiError && [400, 403, 404].includes(error.status)) notFound();
      return null;
    });

  return <OrderFulfilmentView order={order} orderId={params.id} />;
}
