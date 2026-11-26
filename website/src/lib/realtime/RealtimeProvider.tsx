'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { BACKEND_URL } from '@/lib/api/core';
import { http } from '@/lib/api/client';
import { authEndpoints } from '@/lib/api/endpoints/auth';
import { chatEndpoints, type ChatMessage, type Conversation } from '@/lib/api/endpoints/chat';
import { offersEndpoints } from '@/lib/api/endpoints/offers';

/**
 * One socket per tab, mounted in the workspace layouts. No global store: components subscribe to
 * events with `useSocketEvent` and keep their own state.
 *
 * Auth: the access token is an httpOnly cookie, so every (re)connect first gets a 60-second ticket
 * from POST /auth/socket-ticket and sends it in the handshake.
 *
 * Also keeps the two sidebar badges live: chat unread total and pending offers.
 */

/** Socket.io connects straight to the backend origin, not through the /api/v1 proxy. */
const SOCKET_URL = BACKEND_URL.replace(/\/api\/v\d+$/, '');

export type MessageNewEvent = { conversationId: string; message: ChatMessage; conversation: Conversation };
export type MessageUpdatedEvent = { conversationId: string; message: ChatMessage };
export type MessageRemovedEvent = { conversationId: string; messageId: string };
export type ConversationReadEvent = { conversationId: string; readerId: string; readAt: string };
export type ConversationRemovedEvent = { conversationId: string };

export interface SocketEvents {
  'message:new': MessageNewEvent;
  'message:updated': MessageUpdatedEvent;
  'message:removed': MessageRemovedEvent;
  'conversation:read': ConversationReadEvent;
  'conversation:removed': ConversationRemovedEvent;
  'chat:unread': { total: number };
}

interface RealtimeContextValue {
  socket: Socket | null;
  connected: boolean;
  /** Increments on every RE-connect (not the first connect): refetch what may have been missed. */
  reconnectCount: number;
  chatUnread: number;
  pendingOffers: number;
  /** Re-read the pending-offers badge (after accepting / declining an offer). */
  refreshPendingOffers: () => void;
  /** Local optimistic update of the chat badge (e.g. after opening a thread). */
  setChatUnread: (total: number) => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

const createSocket = () =>
  io(SOCKET_URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    // Called on every (re)connect → always a fresh ticket.
    auth: (cb) => {
      authEndpoints(http)
        .socketTicket()
        .then(({ ticket }) => cb({ ticket }))
        .catch(() => cb({}));
    },
  });

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [pendingOffers, setPendingOffers] = useState(0);

  const refreshPendingOffers = useCallback(() => {
    offersEndpoints(http)
      .pendingCount()
      .then(setPendingOffers)
      .catch(() => undefined);
  }, []);

  const refreshChatUnread = useCallback(() => {
    chatEndpoints(http)
      .unread()
      .then((r) => setChatUnread(r.total))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const s = createSocket();
    setSocket(s);
    let connectedBefore = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 2_000;

    const onConnect = () => {
      setConnected(true);
      retryDelay = 2_000;
      if (connectedBefore) {
        setReconnectCount((n) => n + 1);
        refreshChatUnread();
        refreshPendingOffers();
      }
      connectedBefore = true;
    };
    const onDisconnect = () => setConnected(false);
    // A handshake refused by the server (expired ticket, etc.) is not retried by socket.io itself.
    const onConnectError = () => {
      setConnected(false);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => s.connect(), retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30_000);
    };
    const onUnread = ({ total }: { total: number }) => setChatUnread(total);
    const onOfferActivity = ({ message }: { message: ChatMessage }) => {
      if (message.offerId) refreshPendingOffers();
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);
    s.on('chat:unread', onUnread);
    s.on('message:new', onOfferActivity);
    s.on('message:updated', onOfferActivity);
    s.connect();

    refreshChatUnread();
    refreshPendingOffers();

    return () => {
      clearTimeout(retryTimer);
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
    };
  }, [refreshChatUnread, refreshPendingOffers]);

  const value = useMemo<RealtimeContextValue>(
    () => ({ socket, connected, reconnectCount, chatUnread, pendingOffers, refreshPendingOffers, setChatUnread }),
    [socket, connected, reconnectCount, chatUnread, pendingOffers, refreshPendingOffers],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/** Realtime state. Outside a workspace (no provider) it returns a quiet default instead of throwing. */
export const useRealtime = (): RealtimeContextValue =>
  useContext(RealtimeContext) ?? {
    socket: null,
    connected: false,
    reconnectCount: 0,
    chatUnread: 0,
    pendingOffers: 0,
    refreshPendingOffers: () => undefined,
    setChatUnread: () => undefined,
  };

/**
 * Subscribe to one socket event for the component's lifetime. The handler can change every render
 * (it's kept in a ref), so no useCallback needed.
 *
 *   useSocketEvent('message:new', ({ conversationId, message }) => { ... });
 */
export function useSocketEvent<K extends keyof SocketEvents>(event: K, handler: (payload: SocketEvents[K]) => void) {
  const { socket } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!socket) return;
    const listener = (payload: SocketEvents[K]) => ref.current(payload);
    socket.on(event as string, listener);
    return () => {
      socket.off(event as string, listener);
    };
  }, [socket, event]);
}

/** Runs `callback` after every socket RE-connect (events may have been missed while offline). */
export function useOnReconnect(callback: () => void) {
  const { reconnectCount } = useRealtime();
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    if (reconnectCount > 0) ref.current();
  }, [reconnectCount]);
}
