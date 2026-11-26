import React from 'react';
import { Search } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatCard, type StatCardProps } from '@/components/shared/StatCard';

/**
 * Layout for list pages whose server API is not built yet (orders, transactions, tickets).
 * Shows the same stat row + search bar the real page will have, all at zero, and an empty state.
 * Swap this for the real table once the endpoint exists.
 */
export const ComingSoonList: React.FC<{
  stats: Pick<StatCardProps, 'title' | 'icon' | 'accentColor'>[];
  searchPlaceholder: string;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyDescription: string;
}> = ({ stats, searchPlaceholder, emptyIcon, emptyTitle, emptyDescription }) => (
  <>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <StatCard key={stat.title} {...stat} value={0} />
      ))}
    </div>

    <Card className="p-4">
      <div className="relative w-full max-w-sm">
        <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          disabled
          placeholder={searchPlaceholder}
          className="w-full h-10 pl-9 pr-3 text-sm bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 font-medium cursor-not-allowed opacity-70"
        />
      </div>
    </Card>

    <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
  </>
);
