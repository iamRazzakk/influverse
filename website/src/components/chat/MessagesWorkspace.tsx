'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  MessageSquare,
  Search,
  Send,
  PlusCircle,
  ExternalLink,
  Paperclip,
  FileText,
  Film,
  Download,
  X,
  UploadCloud,
  Check,
  CheckCheck,
  Trash2,
  MoreVertical,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Ban,
  ShoppingBag,
  Tag,
  Loader2,
  AlertCircle,
  LifeBuoy,
} from 'lucide-react';
import { Popconfirm, message, Dropdown, Modal, Input, Select } from 'antd';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { CustomOfferCard } from '@/components/shared/CustomOfferCard';
import { AccountAvatar } from '@/components/auth/AccountAvatar';
import { useAuth } from '@/lib/session/AuthProvider';
import { getErrorMessage } from '@/lib/api/errors';
import { http } from '@/lib/api/client';
import { chatEndpoints, newClientMsgId, type ChatAttachment, type ChatMessage, type ChatRole, type Conversation } from '@/lib/api/endpoints/chat';
import { offersEndpoints, type Offer, type OfferPlatform } from '@/lib/api/endpoints/offers';
import { ordersEndpoints } from '@/lib/api/endpoints/orders';
import { uploadEndpoints, uploadFileWith } from '@/lib/api/endpoints/upload';
import { useRequest } from '@/lib/hooks/useRequest';
import { useRealtime, useSocketEvent } from '@/lib/realtime/RealtimeProvider';
import type { BrandProfile, CreatorProfile } from '@/types/api';
import { formatBubbleTime, formatInboxTime } from './chatFormat';
import { useInbox, useThreads, type ChatInitialData } from './useChatState';
import { usePaymentReturn } from '@/components/shared/usePaymentReturn';
import { RemoteImage } from '@/components/shared/RemoteImage';

/**
 * Brand ↔ creator chat — the original Messages design (website git HEAD), now on the real API:
 * conversations / messages over REST, live updates over the socket (RealtimeProvider + useChatState).
 * The server page preloads the inbox, the support thread and the selected thread's first messages.
 *
 * URL: `?conv=<id>` selects a thread (`?c=` also works); `?creatorId=<userId>` (brand) opens the thread
 * with that creator. Creators can send a custom offer from the composer; brands answer it on the card.
 */

type PendingAttachment = ChatAttachment & { status: 'uploading' | 'ready' | 'failed'; localKey: string };

const MAX_FILES = 10;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

const formatSize = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024) || 1} KB`;

const attachmentType = (mime: string, name: string): 'image' | 'video' | 'pdf' | 'archive' | 'document' => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return 'pdf';
  if (/\.(zip|rar)$/i.test(name)) return 'archive';
  return 'document';
};

const EMPTY_INITIAL: ChatInitialData = { inbox: null, support: null, active: null, thread: null };

export function MessagesWorkspace({ viewer, initial = EMPTY_INITIAL }: { viewer: ChatRole; initial?: ChatInitialData }) {
  const isBrandViewer = viewer === 'brand';
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { currentUser, profile } = useAuth();
  const { chatUnread, setChatUnread } = useRealtime();
  const meId = currentUser?.id ?? '';
  const myAvatar = isBrandViewer
    ? (profile as BrandProfile | null)?.logo || currentUser?.avatar
    : (profile as CreatorProfile | null)?.avatar || currentUser?.avatar;
  const myName = isBrandViewer ? (profile as BrandProfile | null)?.companyName || currentUser?.name : currentUser?.name;

  const [searchQuery, setSearchQuery] = useState('');
  // Phones show the list OR the thread. A `?conv=` link opens on the thread straight away, so the
  // thread is visible on the first paint and the scroll-to-newest below can measure it.
  const [mobilePane, setMobilePane] = useState<'list' | 'thread'>(() =>
    searchParams.get('conv') || searchParams.get('c') ? 'thread' : 'list',
  );
  const [inputText, setInputText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isOfferOpen, setIsOfferOpen] = useState(false);
  const [offerTitle, setOfferTitle] = useState('');
  const [offerDeliverables, setOfferDeliverables] = useState('');
  const [offerPrice, setOfferPrice] = useState<number | null>(null);
  const [offerPlatforms, setOfferPlatforms] = useState<OfferPlatform[]>(['instagram']);
  const [sendingOffer, setSendingOffer] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* ------------------------------------------------------------ conversations */

  const urlConversationId = searchParams.get('conv') || searchParams.get('c');
  const creatorIdParam = isBrandViewer ? searchParams.get('creatorId') : null;
  // Same pick as the server page: the URL's thread, else the newest one (see the auto-select below).
  const [activeId, setActiveId] = useState<string | null>(
    () => urlConversationId ?? (creatorIdParam ? null : initial.inbox?.items[0]?.id ?? null),
  );

  const {
    inbox,
    hasMore: inboxHasMore,
    loadingMore: loadingMoreInbox,
    loadMore: fetchMoreInbox,
    refetch: refetchInbox,
    support: supportConv,
    detail: detailRow,
    setDetail,
    markReadLocal,
    removeFromInbox,
  } = useInbox(initial);

  useEffect(() => {
    if (urlConversationId) {
      setActiveId(urlConversationId);
      setMobilePane('thread');
    }
  }, [urlConversationId]);

  // "Message" on a creator profile → open (or create) that thread.
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!creatorIdParam || openedFor.current === creatorIdParam) return;
    openedFor.current = creatorIdParam;
    chatEndpoints(http)
      .open(creatorIdParam)
      .then((conversation) => {
        setDetail(conversation);
        setActiveId(conversation.id);
        setMobilePane('thread');
        router.replace(`${pathname}?conv=${conversation.id}`, { scroll: false });
      })
      .catch((error) => message.error(getErrorMessage(error, 'Could not open this conversation.')));
  }, [creatorIdParam, pathname, router, setDetail]);

  // A thread with no messages yet is not in the inbox — show it on top while it's open.
  const activeDetail = detailRow && detailRow.id === activeId ? detailRow : undefined;
  // "Influverse Support" is always in the inbox (original design), even before the first message.
  const withSupport: Conversation[] = supportConv && !inbox.some((c) => c.id === supportConv.id) ? [supportConv, ...inbox] : inbox;
  const conversations: Conversation[] =
    activeId && !withSupport.some((c) => c.id === activeId) && activeDetail ? [activeDetail, ...withSupport] : withSupport;

  // The open thread isn't in the list and wasn't preloaded → load its row.
  const activeKnown = Boolean(activeId && (withSupport.some((c) => c.id === activeId) || activeDetail));
  const detailRequested = useRef<string | null>(null);
  useEffect(() => {
    if (!activeId || activeKnown || detailRequested.current === activeId) return;
    detailRequested.current = activeId;
    chatEndpoints(http)
      .conversation(activeId)
      .then(setDetail)
      .catch(() => undefined);
  }, [activeId, activeKnown, setDetail]);

  const activeConv = (activeId ? conversations.find((c) => c.id === activeId) ?? activeDetail : conversations[0]) ?? null;
  const counterpart = activeConv?.counterpart ?? null;
  const isSupportConv = activeConv?.kind === 'support';

  // Header "Campaign #…" button: the latest live order with this counterpart (same chat thread).
  const ordersSkip = !activeConv || isSupportConv;
  const { data: myOrders, refetch: refetchOrders } = useRequest(() => ordersEndpoints(http).list(), [], { skip: ordersSkip });
  const activeOrder = useMemo(
    () =>
      activeConv && !isSupportConv
        ? (myOrders?.items ?? []).find(
            (o) => o.conversationId === activeConv.id && !['cancelled', 'completed'].includes(o.status),
          ) ?? null
        : null,
    [activeConv, isSupportConv, myOrders],
  );

  // Auto-select the newest thread (desktop shows the first one, like before).
  useEffect(() => {
    if (!activeId && !creatorIdParam && inbox.length > 0) setActiveId(inbox[0].id);
  }, [activeId, creatorIdParam, inbox]);

  const selectConversation = (id: string) => {
    setActiveId(id);
    setMobilePane('thread');
    router.replace(`${pathname}?conv=${id}`, { scroll: false });
  };

  const filteredConversations = conversations.filter((c) => {
    const query = searchQuery.toLowerCase();
    return (
      (c.counterpart?.name ?? '').toLowerCase().includes(query) ||
      (c.counterpart?.handle ?? '').toLowerCase().includes(query) ||
      (c.lastMessage?.text ?? '').toLowerCase().includes(query)
    );
  });

  /* ------------------------------------------------------------ messages */

  const thread = useThreads(activeConv?.id ?? null, initial.thread);
  const { messages: threadData, loading: threadLoading, hasMore: threadHasMore, loadOlder: fetchOlder, loadingOlder } = thread;
  const threadMessages = useMemo(() => (threadData ?? []).slice().reverse(), [threadData]);

  // A new offer card / offer notice can start or change an order → refresh the header's campaign button.
  const onOfferActivity = ({ message: msg }: { message: ChatMessage }) => {
    if (msg.offerId && !ordersSkip) void refetchOrders();
  };
  useSocketEvent('message:new', onOfferActivity);
  useSocketEvent('message:updated', onOfferActivity);

  // Back from Stripe after accepting a custom offer (?payment=success|cancelled) → reload this screen's data.
  usePaymentReturn(() => {
    void refetchInbox();
    if (activeConv) void thread.refetch(activeConv.id);
    if (!ordersSkip) void refetchOrders();
  });

  // Offer declined / accepted on a card → new status in the thread right away (the socket confirms it).
  const handleOfferChange = (offer: Offer) => {
    thread.patchOffer(offer);
    if (!ordersSkip) void refetchOrders();
  };

  // Mark incoming messages as read when viewing this conversation.
  const activeUnread = activeConv?.unread ?? 0;
  useEffect(() => {
    if (!activeConv || activeUnread <= 0) return;
    const clear = () => {
      if (document.visibilityState !== 'visible') return;
      // Clear the row badge right away; the server pushes the exact sidebar total (`chat:unread`) afterwards.
      markReadLocal(activeConv.id);
      setChatUnread(Math.max(0, chatUnread - activeUnread));
      chatEndpoints(http)
        .markRead(activeConv.id)
        .catch(() => undefined);
    };
    clear();
    document.addEventListener('visibilitychange', clear);
    return () => document.removeEventListener('visibilitychange', clear);
  }, [activeConv?.id, activeUnread, markReadLocal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll: bottom on open / new message; keep position when older messages load above.
  const scrollSnapshot = useRef({ conversationId: '', newestId: '', oldestId: '', height: 0, top: 0 });
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !threadMessages.length) return;
    const prev = scrollSnapshot.current;
    const newestId = threadMessages[threadMessages.length - 1].id;
    const oldestId = threadMessages[0].id;
    if (prev.conversationId !== activeConv?.id || newestId !== prev.newestId) {
      el.scrollTop = el.scrollHeight;
    } else if (oldestId !== prev.oldestId) {
      el.scrollTop = el.scrollHeight - prev.height + prev.top;
    }
    scrollSnapshot.current = { conversationId: activeConv?.id ?? '', newestId, oldestId, height: el.scrollHeight, top: el.scrollTop };
  }, [threadMessages, activeConv?.id, pendingAttachments.length]);

  const handleThreadScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    scrollSnapshot.current.top = el.scrollTop;
    scrollSnapshot.current.height = el.scrollHeight;
    if (el.scrollTop < 80 && threadHasMore && !loadingOlder) void fetchOlder();
  };

  /* ------------------------------------------------------------ attachments */

  const processFiles = (files: File[]) => {
    const room = MAX_FILES - pendingAttachments.length;
    if (room <= 0) {
      message.warning(`Up to ${MAX_FILES} files per message.`);
      return;
    }
    for (const file of files.slice(0, room)) {
      if (file.size > MAX_FILE_BYTES) {
        message.error(`${file.name} is larger than 100 MB.`);
        continue;
      }
      const localKey = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const item: PendingAttachment = {
        id: '',
        url: '',
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        localUrl: URL.createObjectURL(file),
        status: 'uploading',
        localKey,
      };
      setPendingAttachments((prev) => [...prev, item]);
      uploadFileWith(http, file, 'chat_attachment')
        .then((uploaded) =>
          setPendingAttachments((prev) =>
            prev.map((a) => (a.localKey === localKey ? { ...a, id: uploaded.id, url: uploaded.url ?? `/files/${uploaded.id}/url`, status: 'ready' } : a)),
          ),
        )
        .catch((error) => {
          message.error(getErrorMessage(error, `Could not upload ${file.name}.`));
          setPendingAttachments((prev) => prev.filter((a) => a.localKey !== localKey));
        });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processFiles(Array.from(files));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removePendingAttachment = (localKey: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.localKey !== localKey));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  /* ------------------------------------------------------------ sending */

  const stillUploading = pendingAttachments.some((a) => a.status === 'uploading');

  const handleSendMessage = () => {
    const text = inputText.trim();
    if ((!text && pendingAttachments.length === 0) || !activeConv || stillUploading) return;
    const attachments: ChatAttachment[] = pendingAttachments
      .filter((a) => a.status === 'ready')
      .map(({ id, url, name, mime, size, localUrl }) => ({ id, url, name, mime, size, localUrl }));

    void thread.send({ conversationId: activeConv.id, text, clientMsgId: newClientMsgId(), senderId: meId, attachments });
    setInputText('');
    setPendingAttachments([]);
  };

  const retrySend = (msg: ChatMessage) => {
    if (!activeConv) return;
    void thread.send({
      conversationId: activeConv.id,
      text: msg.text,
      clientMsgId: msg.clientMsgId ?? newClientMsgId(),
      senderId: meId,
      attachments: msg.attachments,
    });
  };

  const handleSendOffer = async () => {
    if (!activeConv) return;
    const title = offerTitle.trim();
    const deliverables = offerDeliverables
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!title || deliverables.length === 0 || !offerPrice || offerPrice <= 0) {
      message.error('Add a title, at least one deliverable, and a price.');
      return;
    }
    if (offerPlatforms.length === 0) {
      message.error('Choose at least one platform.');
      return;
    }

    setSendingOffer(true);
    try {
      const sent = await offersEndpoints(http).sendCustom({
        conversationId: activeConv.id,
        title,
        deliverables,
        platforms: offerPlatforms,
        priceCents: Math.round(offerPrice * 100),
      });
      thread.insert(activeConv.id, sent);
      if (!ordersSkip) void refetchOrders();
      setIsOfferOpen(false);
      setOfferTitle('');
      setOfferDeliverables('');
      setOfferPrice(null);
      setOfferPlatforms(['instagram']);
      message.success('Custom offer sent.');
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setSendingOffer(false);
    }
  };

  /* ------------------------------------------------------------ render helpers */

  const profileHref = counterpart
    ? counterpart.role === 'creator'
      ? `/creators/${counterpart.handle || counterpart.id}`
      : `/brands/${counterpart.handle || counterpart.id}`
    : '#';

  const isReadByCounterpart = (msg: ChatMessage) =>
    Boolean(activeConv?.counterpartLastReadAt && msg.createdAt <= activeConv.counterpartLastReadAt);

  return (
    // Fills the workspace <main> (which is already 100dvh minus the phone top bar): the inbox and the
    // thread scroll inside, so the composer stays pinned at the bottom, also above the mobile keyboard.
    <div className="flex h-full min-h-0 flex-col font-sans">
      {/* Phones: an open thread gets the whole height (its header has the back button). */}
      <div className={mobilePane === 'thread' ? 'hidden md:block' : undefined}>
        <WorkspaceHeader
          title="Messages"
          subtitle={isBrandViewer ? 'Chat with creators.' : 'Direct conversations with brands.'}
        />
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col sm:px-6 sm:py-6 lg:px-8">
        <div className="flex min-h-[360px] flex-1 flex-col overflow-hidden bg-white sm:rounded-xl sm:border sm:border-[#E7E7E2] sm:shadow-2xs md:flex-row">
          {/* LEFT COLUMN: Conversation List (phones: list OR thread; md+: side by side) */}
          <div className={`${mobilePane === 'thread' ? 'hidden' : 'flex'} min-h-0 w-full flex-1 flex-col bg-[#FAFAF8] md:flex md:w-72 md:flex-none md:border-r md:border-[#E7E7E2] xl:w-96`}>
            {/* Search Header */}
            <div className="p-3 sm:p-4 border-b border-[#E7E7E2] bg-white space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-[#66665E]">
                  Conversations
                </span>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 text-[#66665E] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={isBrandViewer ? 'Search creators...' : 'Search brands...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 text-base sm:text-sm font-medium rounded-lg border border-[#E7E7E2] bg-[#FAFAF8] outline-none focus:border-[#0A0A0A] focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Conversations Scrollable List */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 space-y-1">
              {filteredConversations.length > 0 ? (
                filteredConversations.map((conv) => {
                  const isSelected = activeConv?.id === conv.id;
                  const name = conv.counterpart?.name ?? 'Unknown';
                  return (
                    <div
                      key={conv.id}
                      onClick={() => selectConversation(conv.id)}
                      className={`group w-full p-3 flex items-start gap-3 text-left rounded-lg border transition-all cursor-pointer relative ${
                        isSelected
                          ? 'bg-white border-[#E7E7E2] shadow-2xs md:border-[#0A0A0A]/15'
                          : 'border-transparent hover:bg-[#F4F4F0]'
                      }`}
                    >
                      <div className="relative shrink-0">
                        <AccountAvatar src={conv.counterpart?.avatar} name={name} className="w-11 h-11 rounded-full" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className={`text-sm truncate ${conv.unread > 0 ? 'font-black text-[#0A0A0A]' : 'font-bold text-[#0A0A0A]'}`}>
                              {name}
                            </span>
                            {isBrandViewer && conv.counterpart?.verified && <VerifiedBadge size="xs" />}
                          </div>
                          <span className={`text-[11px] shrink-0 font-medium ${conv.unread > 0 ? 'text-[#FF2D78] font-bold' : 'text-[#8E8E85]'}`}>
                            {formatInboxTime(conv.lastMessageAt)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-xs truncate leading-snug ${conv.unread > 0 ? 'font-bold text-[#0A0A0A]' : 'font-medium text-[#66665E]'}`}>
                            {conv.lastMessage?.text ??
                              (conv.kind === 'support'
                                ? 'Need help with an order brief, deliverable review, or escrow settlement? Support is here.'
                                : 'No messages yet')}
                          </p>
                          {conv.unread > 0 && (
                            <span className="min-w-4 h-4 px-1 rounded-full bg-[#FF2D78] text-white text-[10px] font-black flex items-center justify-center shrink-0 shadow-2xs">
                              {conv.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-sm text-[#66665E] font-medium">
                  No conversations match your search.
                </div>
              )}
              {inboxHasMore && !searchQuery && (
                <button
                  type="button"
                  onClick={() => fetchMoreInbox()}
                  disabled={loadingMoreInbox}
                  className="w-full p-3 rounded-lg text-xs font-bold text-[#66665E] hover:text-[#0A0A0A] hover:bg-[#F4F4F0] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {loadingMoreInbox && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Load more conversations
                </button>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Active Chat Thread */}
          {activeConv ? (
            <div className={`${mobilePane === 'list' ? 'hidden' : 'flex'} min-h-0 min-w-0 flex-1 flex-col bg-white md:flex`}>
              {/* Chat Thread Header */}
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#E7E7E2] bg-white px-3 py-3 sm:gap-4 sm:px-5 lg:px-6">
                <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setMobilePane('list')}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#E7E7E2] text-[#0A0A0A] hover:bg-[#F4F4F0] md:hidden"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  {isSupportConv ? (
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-[#0A0A0A] text-white flex items-center justify-center shrink-0">
                        <LifeBuoy className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <h2 className="text-sm sm:text-base font-bold text-[#0A0A0A] truncate">{counterpart?.name}</h2>
                          <VerifiedBadge size="xs" />
                        </div>
                        <div className="truncate text-xs text-[#66665E]">Official Support Desk</div>
                      </div>
                    </div>
                  ) : (
                  <Link
                    href={profileHref}
                    className="flex items-center gap-3 min-w-0 group hover:opacity-90"
                    title={isBrandViewer ? 'View Creator Profile' : 'View Brand Profile'}
                  >
                    <AccountAvatar
                      src={counterpart?.avatar}
                      name={counterpart?.name}
                      className="w-10 h-10 rounded-full group-hover:scale-105 transition-transform"
                    />
                    <div className="min-w-0">
                      {isBrandViewer ? (
                        <>
                          <div className="flex min-w-0 items-center gap-1.5">
                            <h2 className="text-sm sm:text-base font-bold text-[#0A0A0A] group-hover:text-[#FF2D78] transition-colors truncate">
                              {counterpart?.name}
                            </h2>
                            {counterpart?.verified && <VerifiedBadge size="xs" />}
                          </div>
                          {counterpart?.handle && <div className="truncate text-xs text-[#66665E]">@{counterpart.handle}</div>}
                        </>
                      ) : (
                        <>
                          <h2 className="text-sm sm:text-base font-bold text-[#0A0A0A] group-hover:text-[#FF2D78] transition-colors flex min-w-0 items-center gap-1.5">
                            <span className="truncate">{counterpart?.name}</span>
                            <ExternalLink className="w-3.5 h-3.5 shrink-0 text-[#A3A39C] opacity-0 group-hover:opacity-100 transition-opacity" />
                          </h2>
                          <div className="truncate text-xs text-[#66665E]">{counterpart?.verified ? 'Verified Brand Partner' : 'Brand Partner'}</div>
                        </>
                      )}
                    </div>
                  </Link>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {activeOrder && (
                    <button
                      type="button"
                      onClick={() => router.push(`/${viewer}/orders/${activeOrder.id}`)}
                      // Shown where the thread pane is wide enough (also in the ⋮ menu everywhere).
                      className="hidden sm:inline-flex md:hidden xl:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#FAFAF8] hover:bg-[#F4F4F0] border border-[#E7E7E2] hover:border-[#0A0A0A] text-xs font-bold text-[#0A0A0A] transition-all cursor-pointer shadow-2xs"
                      title="View active campaign details"
                    >
                      <ShoppingBag className="w-3.5 h-3.5 text-[#FF2D78]" />
                      <span>Campaign #{activeOrder.code.replace(/^ORD-/, '')}</span>
                    </button>
                  )}

                  {/* 3-Dot Options Dropdown */}
                  <Dropdown
                    menu={{
                      items: [
                        ...(isSupportConv
                          ? []
                          : isBrandViewer
                          ? [
                              {
                                key: 'campaign',
                                icon: <ShoppingBag className="w-4 h-4" />,
                                label: activeOrder ? 'Active Campaign Details' : 'Campaigns',
                                onClick: () => router.push(activeOrder ? `/brand/orders/${activeOrder.id}` : '/brand/campaigns'),
                              },
                              {
                                key: 'offer',
                                icon: <PlusCircle className="w-4 h-4" />,
                                label: 'New Campaign',
                                onClick: () =>
                                  router.push(`/brand/hire/new?creator=${encodeURIComponent(counterpart?.handle || counterpart?.id || '')}`),
                              },
                            ]
                          : [
                              {
                                key: 'orders',
                                icon: <ShoppingBag className="w-4 h-4" />,
                                label: activeOrder ? 'Active Campaign Details' : 'Active Orders',
                                onClick: () => router.push(activeOrder ? `/creator/orders/${activeOrder.id}` : '/creator/campaigns'),
                              },
                            ]),
                        {
                          type: 'divider' as const,
                        },
                        {
                          key: 'delete',
                          icon: <Trash2 className="w-4 h-4" />,
                          label: 'Delete Thread',
                          danger: true,
                          onClick: () => {
                            Modal.confirm({
                              title: 'Delete entire conversation?',
                              content:
                                'This removes the conversation and its message history from your inbox. The other person keeps their copy. This action cannot be undone.',
                              okText: 'Delete Thread',
                              okType: 'danger',
                              cancelText: 'Cancel',
                              onOk: async () => {
                                try {
                                  await chatEndpoints(http).clear(activeConv.id);
                                  removeFromInbox(activeConv.id);
                                  thread.drop(activeConv.id);
                                  setActiveId(null);
                                  setMobilePane('list');
                                  router.replace(pathname, { scroll: false });
                                  message.success('Conversation deleted');
                                } catch (error) {
                                  message.error(getErrorMessage(error));
                                }
                              },
                            });
                          },
                        },
                      ],
                    }}
                    trigger={['click']}
                    placement="bottomRight"
                  >
                    <button
                      type="button"
                      className="w-10 h-10 md:w-9 md:h-9 rounded-lg border border-[#E7E7E2] hover:border-[#0A0A0A] bg-white hover:bg-[#FAFAF8] text-[#66665E] hover:text-[#0A0A0A] flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                      title="More options"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </Dropdown>
                </div>
              </div>

              {/* Message Stream */}
              <div
                ref={scrollRef}
                onScroll={handleThreadScroll}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:p-5 lg:p-6 space-y-4 bg-[#FAFAF8] relative transition-colors ${
                  isDragging ? 'bg-[#FFF0F5]/60 border-2 border-dashed border-[#FF2D78]' : ''
                }`}
              >
                {isDragging && (
                  <div className="absolute inset-0 bg-white/85 backdrop-blur-xs z-20 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
                    <div className="w-16 h-16 rounded-xl bg-[#FFF0F5] text-[#FF2D78] flex items-center justify-center mb-3 animate-bounce">
                      <UploadCloud className="w-8 h-8" />
                    </div>
                    <p className="font-bold text-base text-[#0A0A0A]">{isBrandViewer ? 'Drop Files Here to Share' : 'Drop Files Here to Submit'}</p>
                    <p className="text-sm text-[#66665E] mt-1">
                      {isBrandViewer
                        ? 'Upload campaign briefs, moodboards, contract drafts, or brand guidelines'
                        : 'Upload campaign briefs, raw footage, video edits, images, or documents'}
                    </p>
                  </div>
                )}

                {threadLoading && (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-[#8E8E85]" />
                  </div>
                )}

                {(threadHasMore || loadingOlder) && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => fetchOlder()}
                      disabled={loadingOlder}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#E7E7E2] text-xs font-bold text-[#66665E] hover:text-[#0A0A0A] shadow-2xs cursor-pointer"
                    >
                      {loadingOlder && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Load earlier messages
                    </button>
                  </div>
                )}

                {threadMessages.map((msg) => {
                  const isMine = msg.senderId === meId;
                  const isSystem = msg.kind === 'system';

                  if (isSystem) {
                    const isAccepted = msg.systemType === 'offer_accepted' || msg.systemType === 'ticket_resolved';
                    const isDeclined = msg.systemType === 'offer_declined';
                    const isTicket = msg.systemType === 'ticket_opened' || msg.systemType === 'ticket_resolved';
                    const ticketOrderId = (msg.systemPayload as { orderId?: string } | null)?.orderId;

                    return (
                      <div key={msg.id} className="flex justify-center my-3 sm:my-4 sm:px-4">
                        <div
                          className={`max-w-md w-full px-3.5 py-3 sm:px-4 rounded-xl border text-center shadow-xs transition-all ${
                            isAccepted
                              ? 'bg-[#EEF7F2] border-[#C8E8D5] text-[#23744D]'
                              : isDeclined
                              ? 'bg-[#FFF0F0] border-[#FFD6D6] text-[#D9383A]'
                              : 'bg-[#FAFAF8] border-[#E7E7E2] text-[#0A0A0A]'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 mb-1">
                            {isAccepted ? (
                              <CheckCircle2 className="w-4 h-4 text-[#23744D] shrink-0" />
                            ) : isDeclined ? (
                              <XCircle className="w-4 h-4 text-[#D9383A] shrink-0" />
                            ) : (
                              <FileText className="w-4 h-4 text-[#0A0A0A] shrink-0" />
                            )}
                            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider">
                              {msg.systemType === 'ticket_opened'
                                ? 'Support Ticket Opened'
                                : msg.systemType === 'ticket_resolved'
                                ? 'Support Ticket Resolved'
                                : isAccepted
                                ? 'System Notification • Offer Accepted'
                                : isDeclined
                                ? 'System Notification • Offer Declined'
                                : 'System Notification • Offer Update'}
                            </span>
                            <span className="text-[10px] text-[#66665E] font-medium ml-1">
                              • {formatBubbleTime(msg.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs sm:text-[13px] font-semibold leading-relaxed text-[#0A0A0A]">
                            {msg.text}
                          </p>
                          {isTicket && ticketOrderId && (
                            <Link
                              href={`/${viewer}/orders/${ticketOrderId}`}
                              className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-[#0A0A0A] underline underline-offset-2 hover:text-[#FF2D78]"
                            >
                              View order
                            </Link>
                          )}
                          {/* Brand offers are answered on the Offers page. */}
                          {!isBrandViewer && msg.systemType === 'offer_sent' && msg.offer?.status === 'pending' && (
                            <Link
                              href="/creator/offers"
                              className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-[#0A0A0A] underline underline-offset-2 hover:text-[#FF2D78]"
                            >
                              Review offer
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  }

                  const senderAvatar = isMine ? myAvatar : counterpart?.avatar;
                  const senderName = isMine ? myName : counterpart?.name;

                  return (
                    <div
                      key={msg.id}
                      className={`group flex gap-2 sm:gap-3 max-w-[92%] sm:max-w-[80%] xl:max-w-[70%] relative ${
                        isMine ? 'ml-auto flex-row-reverse' : 'mr-auto'
                      }`}
                    >
                      <AccountAvatar src={senderAvatar} name={senderName} className="w-8 h-8 rounded-full mt-1 shrink-0" />

                      <div className={`min-w-0 space-y-1.5 ${isMine ? 'text-right' : 'text-left'}`}>
                        {/* Header: Sender name, timestamp, and read status for outgoing messages */}
                        <div
                          className={`flex min-w-0 items-center gap-1.5 text-xs text-[#66665E] font-medium px-1 ${
                            isMine ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          {!isMine && (
                            <>
                              <span className="min-w-0 truncate font-bold text-[#0A0A0A]">{senderName}</span>
                              <span className="shrink-0">•</span>
                            </>
                          )}
                          <span className="shrink-0 whitespace-nowrap">{msg.localStatus ? 'Just now' : formatBubbleTime(msg.createdAt)}</span>

                          {/* Read / Sent status badge for own messages */}
                          {isMine && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 ml-1">
                              {msg.localStatus === 'sending' ? (
                                <span className="inline-flex items-center gap-0.5 text-zinc-400" title="Sending">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span className="text-[10px]">Sending</span>
                                </span>
                              ) : msg.localStatus === 'failed' ? (
                                <button
                                  type="button"
                                  onClick={() => retrySend(msg)}
                                  className="inline-flex items-center gap-0.5 text-rose-600 font-semibold cursor-pointer"
                                  title="Not sent — click to retry"
                                >
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  <span className="text-[10px]">Not sent · Retry</span>
                                </button>
                              ) : isReadByCounterpart(msg) ? (
                                <span
                                  className="inline-flex items-center gap-0.5 text-sky-500 font-semibold"
                                  title={isBrandViewer ? 'Read by creator' : 'Read by brand'}
                                >
                                  <CheckCheck className="w-3.5 h-3.5" />
                                  <span className="text-[10px]">Read</span>
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-0.5 text-zinc-400"
                                  title="Sent"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span className="text-[10px]">Sent</span>
                                </span>
                              )}
                            </span>
                          )}
                        </div>

                        {/* Message content wrapper with Delete action on hover */}
                        <div
                          className={`flex min-w-0 items-center gap-2 ${
                            isMine ? 'flex-row-reverse' : 'flex-row'
                          }`}
                        >
                          {msg.isDeleted ? (
                            <div className="py-2.5 px-3.5 rounded-xl text-sm italic flex items-center gap-2 select-none border border-dashed bg-[#FAFAF8] text-[#8E8E85] border-[#D2D2CA]">
                              <Ban className="w-3.5 h-3.5 text-[#8E8E85] shrink-0" />
                              <span>This message was deleted</span>
                            </div>
                          ) : (
                            <>
                              <div className="min-w-0 space-y-2">
                                {msg.kind === 'offer' && msg.offer && (
                                  <div className={`min-w-0 ${isMine ? 'flex justify-end' : 'flex justify-start'}`}>
                                    <CustomOfferCard offer={msg.offer} viewer={viewer} onOfferChange={handleOfferChange} />
                                  </div>
                                )}

                                {msg.text && (
                                  <div
                                    className={`px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-xl text-left text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
                                      isMine
                                        ? 'bg-[#0A0A0A] text-white rounded-tr-md'
                                        : 'bg-white text-[#0A0A0A] border border-[#E7E7E2] shadow-2xs rounded-tl-md'
                                    }`}
                                  >
                                    {msg.text}
                                  </div>
                                )}

                                {/* File Attachments */}
                                {msg.attachments.length > 0 && (
                                  <div
                                    className={`flex flex-col gap-2 ${
                                      isMine ? 'items-end' : 'items-start'
                                    }`}
                                  >
                                    {msg.attachments.map((att) => (
                                      <div key={att.id || att.name} className="w-[min(320px,100%)] sm:w-[340px] max-w-full">
                                        <AttachmentView attachment={att} isMine={isMine} />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Delete Single Message Action */}
                              {!msg.localStatus && (
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center shrink-0">
                                  <Popconfirm
                                    title="Delete message?"
                                    description={
                                      isMine && msg.kind === 'text'
                                        ? 'Remove this message for everyone in this chat?'
                                        : 'Remove this message from your chat history?'
                                    }
                                    okText="Delete"
                                    cancelText="Cancel"
                                    okButtonProps={{ danger: true, size: 'small' }}
                                    cancelButtonProps={{ size: 'small' }}
                                    onConfirm={async () => {
                                      try {
                                        await thread.deleteMessage(activeConv.id, msg.id, isMine && msg.kind === 'text');
                                        message.success('Message deleted');
                                      } catch (error) {
                                        message.error(getErrorMessage(error));
                                      }
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                      title="Delete message"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </Popconfirm>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pending Attachments Preview Tray */}
              {pendingAttachments.length > 0 && (
                <div className="shrink-0 px-3 sm:px-4 py-2.5 bg-[#FAFAF8] border-t border-[#E7E7E2] flex items-center gap-2 overflow-x-auto">
                  <span className="hidden sm:inline text-xs font-bold uppercase tracking-wider text-[#66665E] shrink-0">
                    {isBrandViewer ? 'Files to Send' : 'Files to Submit'} ({pendingAttachments.length}):
                  </span>
                  <div className="flex items-center gap-2 sm:flex-wrap">
                    {pendingAttachments.map((att) => {
                      const type = attachmentType(att.mime, att.name);
                      return (
                        <div
                          key={att.localKey}
                          className="flex shrink-0 items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-[#E7E7E2] shadow-2xs text-xs"
                        >
                          {type === 'image' ? (
                            <div className="w-6 h-6 rounded overflow-hidden bg-zinc-100 shrink-0 border border-[#E7E7E2]">
                              <RemoteImage src={att.localUrl} alt={att.name ?? ''} className="w-full h-full object-cover" width={800} height={800} sizes="(min-width: 1024px) 50vw, 100vw" />
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded bg-zinc-100 flex items-center justify-center shrink-0">
                              {type === 'pdf' ? (
                                <FileText className="w-3.5 h-3.5 text-rose-500" />
                              ) : type === 'video' ? (
                                <Film className="w-3.5 h-3.5 text-purple-500" />
                              ) : (
                                <Paperclip className="w-3.5 h-3.5 text-zinc-600" />
                              )}
                            </div>
                          )}
                          <div className="max-w-[130px] truncate">
                            <p className="font-bold text-[#0A0A0A] truncate text-xs">{att.name}</p>
                            <p className="text-xs text-[#66665E] flex items-center gap-1">
                              {att.status === 'uploading' ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" /> Uploading
                                </>
                              ) : (
                                formatSize(att.size)
                              )}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removePendingAttachment(att.localKey)}
                            aria-label={`Remove ${att.name}`}
                            className="p-1 rounded-md hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Message Input Box */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="shrink-0 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 border-t border-[#E7E7E2] bg-white flex items-center gap-2 sm:gap-3"
              >
                {/* Hidden File Picker */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  accept="image/*,video/*,.pdf,.doc,.docx,.zip,.txt"
                  className="hidden"
                />

                {/* File Attachment / Submit Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title={
                    isBrandViewer
                      ? 'Attach Campaign Brief, Moodboard or Files (PDF, Images, Video, Zip)'
                      : 'Submit File or Deliverables (PDF, Images, Video, Zip)'
                  }
                  aria-label="Attach files"
                  className="w-11 h-11 rounded-lg bg-[#FAFAF8] hover:bg-[#F4F4F0] border border-[#E7E7E2] hover:border-[#0A0A0A] text-[#66665E] hover:text-[#0A0A0A] flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs group"
                >
                  <Paperclip className="w-4 h-4 group-hover:rotate-45 transition-transform duration-200" />
                </button>

                {!isBrandViewer && !isSupportConv && (
                  <button
                    type="button"
                    onClick={() => setIsOfferOpen(true)}
                    title="Send a custom offer"
                    aria-label="Send a custom offer"
                    className="h-11 w-11 justify-center sm:w-auto sm:px-3.5 rounded-lg bg-[#FAFAF8] hover:bg-[#F4F4F0] border border-[#E7E7E2] hover:border-[#0A0A0A] text-[#0A0A0A] flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shrink-0"
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Offer</span>
                  </button>
                )}

                <input
                  type="text"
                  placeholder={isBrandViewer ? `Write a message to ${counterpart?.name ?? ''}...` : `Write a reply to ${counterpart?.name ?? ''}...`}
                  value={inputText}
                  maxLength={4000}
                  onChange={(e) => setInputText(e.target.value)}
                  className={
                    isBrandViewer
                      ? 'min-w-0 flex-1 h-11 px-3.5 sm:px-4 text-base sm:text-sm font-sans rounded-lg bg-[#FAFAF8] border border-[#E7E7E2] outline-none focus:border-[#0A0A0A] focus:bg-white transition-all'
                      : 'min-w-0 flex-1 h-11 px-3.5 sm:px-4 text-base sm:text-sm font-sans rounded-lg bg-[#FAFAF8] border border-[#D2D2CA] outline-none focus:border-[#0A0A0A] focus:bg-white text-[#0A0A0A] placeholder:text-[#66665E] transition-all'
                  }
                />

                <button
                  type="submit"
                  disabled={(!inputText.trim() && pendingAttachments.length === 0) || stillUploading}
                  aria-label="Send message"
                  className="h-11 w-11 justify-center sm:w-auto sm:px-5 rounded-lg font-bold text-xs bg-[#0A0A0A] hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center gap-1.5 transition-all shadow-xs cursor-pointer shrink-0"
                >
                  <span className="hidden sm:inline">Send</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          ) : (
            <div className={`${mobilePane === 'list' ? 'hidden' : 'flex'} flex-1 items-center justify-center p-6 sm:p-8 bg-white md:flex`}>
              <EmptyState
                color="neutral"
                icon={<MessageSquare className="w-8 h-8" />}
                badge="Inbox Clear"
                title={isBrandViewer ? 'No Conversation Selected' : 'No Brand Conversations Yet'}
                description={
                  isBrandViewer
                    ? 'Select a creator from the left list or click Message on any creator card to start a direct inquiry.'
                    : 'When brands inquire about your packages, their chat threads will appear here.'
                }
                variant="dashed"
              />
            </div>
          )}
        </div>
      </div>

      {!isBrandViewer && (
        <Modal
          open={isOfferOpen}
          onCancel={() => setIsOfferOpen(false)}
          footer={null}
          centered
          width={440}
          title={<span className="text-base font-extrabold text-[#0A0A0A]">Custom offer</span>}
        >
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-[#0A0A0A]">Title</label>
              <Input
                value={offerTitle}
                onChange={(e) => setOfferTitle(e.target.value)}
                placeholder="Reel and 3 stories"
                className="rounded-lg h-11 text-base sm:text-sm font-semibold text-[#0A0A0A] placeholder:text-[#66665E] placeholder:font-normal border-[#D2D2CA] hover:border-[#0A0A0A] focus:border-[#0A0A0A]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-[#0A0A0A]">Deliverables</label>
              <Input.TextArea
                rows={4}
                value={offerDeliverables}
                onChange={(e) => setOfferDeliverables(e.target.value)}
                placeholder={'1 Reel\n3 Stories\nUsage rights for 30 days'}
                className="rounded-lg text-base sm:text-sm font-semibold text-[#0A0A0A] placeholder:text-[#66665E] placeholder:font-normal border-[#D2D2CA] hover:border-[#0A0A0A] focus:border-[#0A0A0A] p-3 leading-relaxed"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-[#0A0A0A]">Price (EUR)</label>
              <Input
                type="number"
                prefix={<span className="text-[#0A0A0A] font-bold text-sm">€</span>}
                value={offerPrice ?? ''}
                onChange={(e) => setOfferPrice(e.target.value ? Number(e.target.value) : null)}
                placeholder="950"
                className="rounded-lg h-11 text-base sm:text-sm font-semibold text-[#0A0A0A] placeholder:text-[#66665E] placeholder:font-normal border-[#D2D2CA] hover:border-[#0A0A0A] focus:border-[#0A0A0A]"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-bold text-[#0A0A0A]">Platforms</label>
                <span className="text-[11px] font-medium text-[#66665E]">Select one or more</span>
              </div>
              <Select
                mode="multiple"
                value={offerPlatforms}
                onChange={(values: OfferPlatform[]) => setOfferPlatforms(values)}
                className="w-full text-sm font-semibold text-[#0A0A0A] [&_.ant-select-selector]:min-h-11 [&_.ant-select-selector]:rounded-lg [&_.ant-select-selector]:px-2"
                placeholder="Choose platforms"
                options={[
                  { value: 'instagram', label: 'Instagram' },
                  { value: 'tiktok', label: 'TikTok' },
                  { value: 'youtube', label: 'YouTube' },
                  { value: 'ugc', label: 'UGC Ads' },
                ]}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsOfferOpen(false)}
                className="h-10 px-4 rounded-lg text-sm font-bold border border-[#E7E7E2] text-[#0A0A0A] hover:border-[#0A0A0A] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendOffer}
                disabled={sendingOffer}
                className="h-10 px-5 rounded-lg text-sm font-bold bg-[#0A0A0A] text-white hover:bg-zinc-800 disabled:opacity-60 cursor-pointer"
              >
                Send Offer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * One file in a message — the original image / file tile. Private chat files get a fresh
 * 10-minute signed link from the server; a message still sending uses its local preview.
 */
function AttachmentView({ attachment, isMine }: { attachment: ChatAttachment; isMine: boolean }) {
  const isPrivate = attachment.url.startsWith('/files/');
  const { data: signed } = useRequest((signal) => uploadEndpoints(http).fileUrl(attachment.id, signal), [attachment.id], {
    skip: !isPrivate || !attachment.id || Boolean(attachment.localUrl),
  });
  const href = attachment.localUrl || (isPrivate ? signed?.url : attachment.url) || undefined;
  const type = attachmentType(attachment.mime, attachment.name);
  const size = formatSize(attachment.size);

  if (type === 'image') {
    return (
      <div className="rounded-lg overflow-hidden border border-[#E7E7E2] bg-white shadow-2xs group/img relative">
        {href ? (
          <img
            src={href}
            alt={attachment.name}
            className="w-full max-h-56 object-cover group-hover/img:scale-102 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-40 bg-[#F4F4F0] animate-pulse" />
        )}
        <div className="p-2.5 bg-white border-t border-[#E7E7E2] flex items-center justify-between gap-2">
          <div className="min-w-0 text-left">
            <p className="text-sm font-bold text-[#0A0A0A] truncate">{attachment.name}</p>
            <p className="text-xs text-[#66665E]">{size}</p>
          </div>
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="p-1.5 rounded-md bg-[#FAFAF8] hover:bg-zinc-200 text-[#0A0A0A] transition-colors"
            title="Open full size"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`p-2.5 sm:p-3 rounded-lg flex items-center gap-3 transition-all ${
        isMine
          ? 'bg-[#18181B] text-white border border-zinc-800'
          : 'bg-white text-[#0A0A0A] border border-[#E7E7E2] shadow-2xs'
      }`}
    >
      <div
        className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${
          type === 'pdf'
            ? 'bg-rose-50 text-rose-600 border border-rose-200'
            : type === 'video'
            ? 'bg-purple-50 text-purple-600 border border-purple-200'
            : 'bg-blue-50 text-blue-600 border border-blue-200'
        }`}
      >
        {type === 'pdf' ? <FileText className="w-5 h-5" /> : type === 'video' ? <Film className="w-5 h-5" /> : <Paperclip className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-bold truncate leading-tight">{attachment.name}</p>
        <p className={`text-xs font-sans mt-0.5 ${isMine ? 'text-zinc-400' : 'text-[#66665E]'}`}>
          {size} • {type.toUpperCase()}
        </p>
      </div>
      <a
        href={href}
        download={attachment.name}
        target="_blank"
        rel="noreferrer"
        className={`p-2 rounded-md transition-all shrink-0 cursor-pointer ${
          isMine
            ? 'bg-white/10 hover:bg-white/20 text-white'
            : 'bg-[#FAFAF8] hover:bg-[#F4F4F0] text-[#0A0A0A] border border-[#E7E7E2]'
        }`}
        title="Download file"
      >
        <Download className="w-4 h-4" />
      </a>
    </div>
  );
}
