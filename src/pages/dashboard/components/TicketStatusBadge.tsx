import React from 'react';
import { Badge, type BadgeProps } from '@/components/ui/Badge';
import type { SupportTicketStatus } from '@/lib/api/supportApi';
import { humanizeStatus } from '@/lib/utils';

const TICKET_STATUS_VARIANT: Record<SupportTicketStatus, BadgeProps['variant']> = {
  open: 'pink',
  in_progress: 'warning',
  resolved: 'success',
};

export const TicketStatusBadge: React.FC<{ status: SupportTicketStatus }> = ({ status }) => (
  <Badge variant={TICKET_STATUS_VARIANT[status] ?? 'neutral'} size="sm" dot>
    {humanizeStatus(status)}
  </Badge>
);
