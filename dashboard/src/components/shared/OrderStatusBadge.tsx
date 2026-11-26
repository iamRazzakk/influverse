import React from 'react';
import { Badge, type BadgeProps } from '@/components/ui/Badge';
import type { AdminOrderStatus } from '@/lib/api/ordersApi';
import { humanizeStatus } from '@/lib/utils';

/** Badge colour per order state: amber = waiting on someone, pink = on hold, green = money released. */
const ORDER_STATUS_VARIANT: Record<AdminOrderStatus, BadgeProps['variant']> = {
  awaiting_payment: 'warning',
  in_production: 'default',
  deliverable_submitted: 'warning',
  approved: 'success',
  completed: 'success',
  disputed: 'pink',
  cancelled: 'danger',
};

/** Shared by the Orders page and the support ticket panel so an order state always looks the same. */
export const OrderStatusBadge: React.FC<{ status: AdminOrderStatus }> = ({ status }) => (
  <Badge variant={ORDER_STATUS_VARIANT[status] ?? 'neutral'} size="sm" dot>
    {status === 'disputed' ? 'on hold' : humanizeStatus(status)}
  </Badge>
);
