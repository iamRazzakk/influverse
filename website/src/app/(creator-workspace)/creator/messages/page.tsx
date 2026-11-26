import React from 'react';
import { MessagesWorkspace } from '@/components/chat/MessagesWorkspace';
import { loadChatInitial } from '@/components/chat/loadChatInitial';

/** Creator ↔ brand chat. Brands start threads; creators reply and can send custom offers. `?conv=` selects a thread. */
export default async function CreatorMessagesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const initial = await loadChatInitial('creator', searchParams);
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAF8]">
          <div className="w-8 h-8 rounded-full border-2 border-[#0A0A0A] border-t-transparent animate-spin" />
        </div>
      }
    >
      <MessagesWorkspace viewer="creator" initial={initial} />
    </React.Suspense>
  );
}
