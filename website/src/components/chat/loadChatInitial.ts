import 'server-only';
import { serverApi } from '@/lib/api/server';
import { chatEndpoints } from '@/lib/api/endpoints/chat';
import type { ChatInitialData } from './useChatState';

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || null;

/**
 * Server preload for the Messages pages: the first inbox page, the support thread and — for the thread
 * the screen will open — its first message page (and its row when it's not in the inbox).
 * Same pick as MessagesWorkspace: `?conv=` / `?c=`, else the newest thread (none while `?creatorId=` opens one).
 * Every request may fail on its own; the client then loads that part itself.
 */
export async function loadChatInitial(viewer: 'brand' | 'creator', searchParams: SearchParams): Promise<ChatInitialData> {
  const api = chatEndpoints(serverApi());
  const urlId = first(searchParams.conv) ?? first(searchParams.c);
  const creatorId = viewer === 'brand' ? first(searchParams.creatorId) : null;

  // Thread from the URL → everything in parallel.
  if (urlId) {
    const [inbox, support, active, messages] = await Promise.all([
      api.conversations().catch(() => null),
      api.supportConversation().catch(() => null),
      api.conversation(urlId).catch(() => null),
      api.messages(urlId).catch(() => null),
    ]);
    return { inbox, support, active, thread: messages ? { conversationId: urlId, page: messages } : null };
  }

  const [inbox, support] = await Promise.all([api.conversations().catch(() => null), api.supportConversation().catch(() => null)]);
  // Empty inbox → the screen shows the support thread first.
  const selectedId = creatorId ? null : inbox?.items[0]?.id ?? support?.id ?? null;
  const messages = selectedId ? await api.messages(selectedId).catch(() => null) : null;
  return { inbox, support, active: null, thread: messages && selectedId ? { conversationId: selectedId, page: messages } : null };
}
