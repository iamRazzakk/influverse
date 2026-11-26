'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { CreatorCard } from '@/components/shared/CreatorCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { Bookmark, Search } from 'lucide-react';
import { Button, Pagination } from 'antd';
import type { Paginated } from '@/lib/api/types';
import type { SavedCreatorCard } from '@/types/public';

/**
 * Shortlist UI. Data comes from the server page (props); paging changes the URL (`?page=`), so the
 * server re-renders with the next page. Unsave from a card → router.refresh() (see useSaveCreator).
 */
export function SavedView({ data, page, pageSize }: { data: Paginated<SavedCreatorCard> | null; page: number; pageSize: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const savedCreators = data?.items ?? [];
  const total = data?.meta.total ?? 0;

  const goToPage = (next: number) => router.push(next > 1 ? `${pathname}?page=${next}` : pathname);

  return (
    <div className="min-h-screen pb-16 font-sans">
      <WorkspaceHeader
        title="Shortlist"
        subtitle={`${total} saved creator${total === 1 ? '' : 's'}`}
        action={
          <Link href="/creators">
            <Button
              type="primary"
              className="h-10 px-5 rounded-full font-bold text-sm bg-[#0A0A0A] hover:!bg-zinc-800 !text-white hover:!text-white border-none flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Search className="w-4 h-4" />
              <span>Find Creators</span>
            </Button>
          </Link>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {data === null ? (
          <div className="bg-white rounded-xl p-6 sm:p-12 border border-[#E7E7E2] shadow-2xs">
            <EmptyState
              color="neutral"
              icon={<Bookmark className="w-8 h-8" />}
              title="Couldn't load your shortlist"
              description="Something went wrong. Please try again."
              primaryAction={{ label: 'Try again', onClick: () => router.refresh() }}
              variant="plain"
            />
          </div>
        ) : savedCreators.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {savedCreators.map((creator) => (
                <div key={creator.id} className={creator.available ? '' : 'opacity-60'} title={creator.available ? undefined : 'This creator is currently unavailable'}>
                  <CreatorCard creator={creator} />
                </div>
              ))}
            </div>
            {total > pageSize && (
              <div className="flex justify-center pt-4">
                <Pagination current={page} total={total} pageSize={pageSize} onChange={goToPage} showSizeChanger={false} />
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-xl p-6 sm:p-12 border border-[#E7E7E2] shadow-2xs">
            <EmptyState
              color="neutral"
              icon={<Bookmark className="w-8 h-8" />}
              badge="Shortlist"
              title="Your Shortlist is Empty"
              description="Click the bookmark icon on any creator card across the marketplace to add them to your saved campaign talent pool."
              primaryAction={{
                label: 'Browse Marketplace',
                href: '/creators',
              }}
              variant="plain"
            />
          </div>
        )}
      </div>
    </div>
  );
}
