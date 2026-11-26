import React from 'react';
import { BadgeCheck } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import type { MarketplaceParty } from '@/types/marketplace.types';

/**
 * Avatar + name + handle of a brand or creator, used in the orders, transactions and support tables.
 * A deleted / missing account still renders a placeholder so the row keeps its shape.
 */
export const PartyCell: React.FC<{ party: MarketplaceParty | null; fallback?: string; size?: 'xs' | 'sm' }> = ({
  party,
  fallback = 'Unknown user',
  size = 'sm',
}) => {
  if (!party) return <span className="text-neutral-400 text-xs font-semibold">{fallback}</span>;
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Avatar src={party.avatar} name={party.name} size={size} />
      <div className="min-w-0">
        <div className="font-extrabold text-neutral-950 text-sm flex items-center gap-1 truncate">
          <span className="truncate">{party.name}</span>
          {party.verified && <BadgeCheck className="w-3.5 h-3.5 text-sky-500 fill-sky-500/15 shrink-0" />}
        </div>
        <div className="text-[11px] text-neutral-500 font-semibold truncate">
          {party.handle ? `@${party.handle}` : party.role}
          {!party.available && <span className="ml-1 text-rose-600">· inactive</span>}
        </div>
      </div>
    </div>
  );
};
