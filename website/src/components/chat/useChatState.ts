'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { http } from '@/lib/api/client';
import {
  bumpConversation,
  chatEndpoints,
  dedupeById,
  upsertMessage,
  type ChatAttachment,
  type ChatMessage,
  type Conversation,
  type CursorPage,
} from '@/lib/api/endpoints/chat';
import type { Offer } from '@/lib/api/endpoints/offers';
import { useOnReconnect, useSocketEvent } from '@/lib/realtime/RealtimeProvider';

/**
 * Local chat state for the Messages screen (no global store).
 *
 * - `useInbox`   — the conversation list (cursor pages), the support thread and the open thread's
 *                  detail row. Seeded from the server page, kept live by socket events.
 * - `useThreads` — message lists per conversation (newest first), kept for threads already opened so
 *                  switching back is instant. Optimistic send / delete live here too.
 *
 * Socket handling mirrors the old Redux socket bridge's cache patches; a socket re-connect refetches
 * what is on screen because events may have been missed while offline.
 */

const api = chatEndpoints(http);

/** What the server page preloads. Every field may be null when its request failed. */
export interface ChatInitialData {
  inbox: CursorPage<Conversation> | null;
  support: Conversation | null;
  /** The selected conversation when it is not in the first inbox page (e.g. a thread with no messages yet). */
  active: Conversation | null;
  /** First message page of the selected conversation. */
  thread: { conversationId: string; page: CursorPage<ChatMessage> } | null;
}

interface ListState<T> {
  items: T[];
  nextCursor: string | null;
  /** How many cursor pages are loaded (0 = never loaded). */
  pages: number;
}

const fromPage = <T>(page: CursorPage<T>): ListState<T> => ({ items: page.items, nextCursor: page.nextCursor, pages: 1 });

/* ========================================================================== inbox */

export function useInbox(initial: ChatInitialData) {
  const [inbox, setInbox] = useState<ListState<Conversation>>(() =>
    initial.inbox ? fromPage(initial.inbox) : { items: [], nextCursor: null, pages: 0 },
  );
  const [support, setSupport] = useState<Conversation | null>(initial.support);
  const [detail, setDetail] = useState<Conversation | null>(initial.active);
  const [loadingMore, setLoadingMore] = useState(false);

  // Latest list for socket handlers (they need to know if a thread is already in the inbox).
  const inboxRef = useRef(inbox);
  inboxRef.current = inbox;
  const refetchSeq = useRef(0);
  const loadingMoreRef = useRef(false);

  /** Reloads the newest page. Pages loaded with "Load more" are kept below it. */
  const refetch = useCallback(async () => {
    const mine = ++refetchSeq.current;
    try {
      const page = await api.conversations();
      if (mine !== refetchSeq.current) return; // a newer refetch already started
      setInbox((prev) =>
        prev.pages <= 1
          ? fromPage(page)
          : { items: dedupeById([...page.items, ...prev.items]), nextCursor: prev.nextCursor, pages: prev.pages },
      );
    } catch {
      // Keep what is on screen.
    }
  }, []);

  const loadMore = useCallback(async () => {
    const cursor = inboxRef.current.nextCursor;
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await api.conversations(cursor);
      setInbox((prev) => ({ items: dedupeById([...prev.items, ...page.items]), nextCursor: page.nextCursor, pages: prev.pages + 1 }));
    } catch {
      // Silent, like the old infinite query; the button stays for another try.
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  // Server preload failed → load in the browser.
  useEffect(() => {
    if (!initial.inbox) void refetch();
    if (!initial.support) {
      api
        .supportConversation()
        .then(setSupport)
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Applies the same change to the conversation wherever it is shown (inbox row, support, detail). */
  const patchConversation = useCallback((id: string, changes: Partial<Conversation>) => {
    setInbox((prev) =>
      prev.items.some((c) => c.id === id) ? { ...prev, items: prev.items.map((c) => (c.id === id ? { ...c, ...changes } : c)) } : prev,
    );
    setSupport((prev) => (prev && prev.id === id ? { ...prev, ...changes } : prev));
    setDetail((prev) => (prev && prev.id === id ? { ...prev, ...changes } : prev));
  }, []);

  /** Drops a thread from the inbox (deleted here or in another tab). */
  const removeFromInbox = useCallback((id: string) => {
    setInbox((prev) => ({ ...prev, items: prev.items.filter((c) => c.id !== id) }));
  }, []);

  /** Clear the row badge right away; the server pushes the new sidebar total afterwards. */
  const markReadLocal = useCallback((id: string) => patchConversation(id, { unread: 0 }), [patchConversation]);

  useSocketEvent('message:new', ({ conversationId, conversation }) => {
    // Server sends the inbox row without the counterpart card (the client already has it).
    const { counterpart: _omit, ...changes } = conversation;
    setSupport((prev) => (prev && prev.id === conversationId ? { ...prev, ...changes } : prev));
    setDetail((prev) => (prev && prev.id === conversationId ? { ...prev, ...changes } : prev));

    const known = inboxRef.current.items.some((c) => c.id === conversationId);
    if (known) {
      // Newest activity moves to the top.
      setInbox((prev) => {
        const result = bumpConversation(prev.items, conversationId, changes);
        return result.found ? { ...prev, items: result.list } : prev;
      });
    } else {
      // A brand-new thread (first message from someone) → fetch it with its counterpart card.
      void refetch();
    }
  });

  useSocketEvent('conversation:read', ({ conversationId, readAt }) => {
    patchConversation(conversationId, { counterpartLastReadAt: readAt });
  });

  // Thread deleted by me in another tab.
  useSocketEvent('conversation:removed', ({ conversationId }) => removeFromInbox(conversationId));

  useOnReconnect(() => void refetch());

  return {
    inbox: inbox.items,
    hasMore: Boolean(inbox.nextCursor),
    loadingMore,
    loadMore,
    refetch,
    support,
    detail,
    setDetail,
    markReadLocal,
    removeFromInbox,
  };
}

/* ========================================================================== threads */

/** Merges a fresh newest page into a loaded thread, keeping unsent bubbles and older loaded pages. */
const mergeThread = (prev: ListState<ChatMessage> | undefined, page: CursorPage<ChatMessage>): ListState<ChatMessage> => {
  if (!prev) return fromPage(page);
  const savedClientIds = new Set(page.items.map((m) => m.clientMsgId).filter(Boolean));
  const local = prev.items.filter((m) => m.localStatus && !(m.clientMsgId && savedClientIds.has(m.clientMsgId)));
  if (prev.pages <= 1) return { items: [...local, ...page.items], nextCursor: page.nextCursor, pages: 1 };
  return {
    items: dedupeById([...local, ...page.items, ...prev.items.filter((m) => !m.localStatus)]),
    nextCursor: prev.nextCursor,
    pages: prev.pages,
  };
};

/** Puts a row back at its place by time (newest first) — used to undo an optimistic delete. */
const insertByTime = (items: ChatMessage[], row: ChatMessage) => {
  const index = items.findIndex((m) => m.createdAt < row.createdAt);
  return index < 0 ? [...items, row] : [...items.slice(0, index), row, ...items.slice(index)];
};

export function useThreads(activeId: string | null, initial: ChatInitialData['thread']) {
  const [threads, setThreads] = useState<Record<string, ListState<ChatMessage>>>(() =>
    initial ? { [initial.conversationId]: fromPage(initial.page) } : {},
  );
  const [errored, setErrored] = useState<Record<string, boolean>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);
  const inFlight = useRef(new Set<string>());
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  /** Loads (or reloads) the newest page of one thread. */
  const load = useCallback(async (id: string) => {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    try {
      const page = await api.messages(id);
      setThreads((prev) => ({ ...prev, [id]: mergeThread(prev[id], page) }));
      setErrored((prev) => {
        if (!prev[id]) return prev;
        const { [id]: _drop, ...rest } = prev;
        return rest;
      });
    } catch {
      setErrored((prev) => ({ ...prev, [id]: true }));
    } finally {
      inFlight.current.delete(id);
    }
  }, []);

  const active = activeId ? threads[activeId] : undefined;

  // First open of a thread → load it.
  useEffect(() => {
    if (activeId && !active && !errored[activeId]) void load(activeId);
  }, [activeId, active, errored, load]);

  const loadOlder = useCallback(async () => {
    const id = activeRef.current;
    const cursor = id ? threadsRef.current[id]?.nextCursor : null;
    if (!id || !cursor || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const page = await api.messages(id, cursor);
      setThreads((prev) => {
        const current = prev[id];
        if (!current) return prev;
        return {
          ...prev,
          [id]: { items: dedupeById([...current.items, ...page.items]), nextCursor: page.nextCursor, pages: current.pages + 1 },
        };
      });
    } catch {
      // Silent, like the old infinite query.
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, []);

  /** Changes the message list of a thread that is already loaded (others are left alone). */
  const patchThread = useCallback((id: string, fn: (items: ChatMessage[]) => ChatMessage[]) => {
    setThreads((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], items: fn(prev[id].items) } } : prev));
  }, []);

  /** Forgets a thread; if it's open, the effect above loads it again. */
  const drop = useCallback((id: string) => {
    setThreads((prev) => {
      if (!prev[id]) return prev;
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
  }, []);

  /**
   * Optimistic: the bubble appears instantly as "sending", is swapped for the saved row on success,
   * and marked "failed" (with Retry) on error. Retrying with the same `clientMsgId` can't duplicate it.
   */
  const send = useCallback(
    async (args: { conversationId: string; text: string; clientMsgId: string; senderId: string; attachments: ChatAttachment[] }) => {
      const { conversationId, text, clientMsgId, senderId, attachments } = args;
      const optimistic: ChatMessage = {
        id: `local-${clientMsgId}`,
        conversationId,
        senderId,
        kind: 'text',
        text,
        attachments,
        offerId: null,
        offer: null,
        systemType: null,
        systemPayload: null,
        isDeleted: false,
        clientMsgId,
        createdAt: new Date().toISOString(),
        localStatus: 'sending',
      };
      // Retry of a failed bubble → replace it.
      patchThread(conversationId, (items) => [optimistic, ...items.filter((m) => m.clientMsgId !== clientMsgId)]);
      try {
        const saved = await api.send(conversationId, { text, clientMsgId, attachmentIds: attachments.map((a) => a.id) });
        patchThread(conversationId, (items) => upsertMessage(items, saved));
      } catch {
        patchThread(conversationId, (items) =>
          items.map((m) => (m.clientMsgId === clientMsgId && m.localStatus ? { ...m, localStatus: 'failed' } : m)),
        );
      }
    },
    [patchThread],
  );

  /** Own message → deleted for everyone (placeholder); someone else's → hidden for me. Undone on error. */
  const deleteMessage = useCallback(
    async (conversationId: string, messageId: string, mine: boolean) => {
      const original = threadsRef.current[conversationId]?.items.find((m) => m.id === messageId);
      patchThread(conversationId, (items) =>
        mine
          ? items.map((m) => (m.id === messageId ? { ...m, isDeleted: true, text: '', attachments: [] } : m))
          : items.filter((m) => m.id !== messageId),
      );
      try {
        await api.deleteMessage(conversationId, messageId);
      } catch (error) {
        if (original) {
          patchThread(conversationId, (items) =>
            mine ? items.map((m) => (m.id === messageId ? original : m)) : insertByTime(items, original),
          );
        }
        throw error;
      }
    },
    [patchThread],
  );

  /** A saved message from a REST response (e.g. a custom offer just sent). */
  const insert = useCallback(
    (conversationId: string, message: ChatMessage) => patchThread(conversationId, (items) => upsertMessage(items, message)),
    [patchThread],
  );

  /** New offer status inside the thread's offer cards / notices. */
  const patchOffer = useCallback(
    (offer: Offer) =>
      patchThread(offer.conversationId, (items) =>
        items.map((m) => (m.offer?.id === offer.id ? { ...m, offer: { ...m.offer, ...offer, counterpart: undefined } } : m)),
      ),
    [patchThread],
  );

  useSocketEvent('message:new', ({ conversationId, message }) => insert(conversationId, message));
  // Deleted by its sender, or an offer card whose status changed.
  useSocketEvent('message:updated', ({ conversationId, message }) => insert(conversationId, message));
  // Hidden by me in another tab.
  useSocketEvent('message:removed', ({ conversationId, messageId }) =>
    patchThread(conversationId, (items) => items.filter((m) => m.id !== messageId)),
  );
  // Thread deleted by me in another tab.
  useSocketEvent('conversation:removed', ({ conversationId }) => drop(conversationId));

  // After a drop we may have missed events: reload the open thread, forget the others (reloaded on open).
  useOnReconnect(() => {
    const id = activeRef.current;
    setThreads((prev) => (id && prev[id] ? { [id]: prev[id] } : {}));
    setErrored({});
    if (id) void load(id);
  });

  return {
    /** Newest first. */
    messages: active?.items,
    loading: Boolean(activeId && !active && !errored[activeId]),
    hasMore: Boolean(active?.nextCursor),
    loadingOlder,
    loadOlder,
    refetch: load,
    send,
    deleteMessage,
    insert,
    patchOffer,
    drop,
  };
}
