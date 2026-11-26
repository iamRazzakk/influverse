import React from 'react';
import { MessagesWorkspace } from '@/components/chat/MessagesWorkspace';
import { loadChatInitial } from '@/components/chat/loadChatInitial';

/** Brand ↔ creator chat. `?creatorId=` (from a creator profile) opens that thread, `?conv=` selects one. */
export default async function BrandMessagesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const initial = await loadChatInitial('brand', searchParams);
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center font-sans text-sm font-bold text-[#66665E]">
          Loading direct messages...
        </div>
      }
    >
      <MessagesWorkspace viewer="brand" initial={initial} />
    </React.Suspense>
  );
}
