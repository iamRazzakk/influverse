import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessagesSquare, Paperclip, Send, X, FileText, Ticket, ChevronUp } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorBanner, FilterTabs } from '@/components/shared/ListControls';
import { getErrorMessage } from '@/lib/api/baseApi';
import {
  supportApi,
  useGetSupportConversationsQuery,
  useGetSupportMessagesQuery,
  useLazyGetSupportMessagesQuery,
  useMarkSupportConversationReadMutation,
  useSendSupportMessageMutation,
  type SupportAttachment,
  type SupportConversation,
  type SupportMessage,
} from '@/lib/api/supportApi';
import { useLazyGetAdminFileUrlQuery } from '@/lib/api/verificationApi';
import { useUploadFile, type UploadedFile } from '@/lib/api/uploadApi';
import { cn, formatDateTime, timeAgo } from '@/lib/utils';

/** No socket client in the dashboard yet, so the inbox and the open thread poll instead. */
const POLL_INTERVAL_MS = 10_000;
const POLL_OPTIONS = { pollingInterval: POLL_INTERVAL_MS, skipPollingIfUnfocused: true, refetchOnFocus: true } as const;
const MAX_TEXT_LENGTH = 4000;
const MAX_ATTACHMENTS = 10;

type InboxFilter = 'all' | 'unread';

/**
 * Support inbox: every user's "Influverse Support" thread (left) and the open chat (right).
 * The open thread id lives in the page URL (`?conv=`) so admin notifications can deep-link to it.
 */
export const SupportInbox: React.FC<{
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onOpenTicket: (ticketId: string) => void;
}> = ({ selectedConversationId, onSelectConversation, onOpenTicket }) => {
  const [filter, setFilter] = useState<InboxFilter>('all');
  const unreadOnly = filter === 'unread';

  // The first page is polled; older pages are fetched on demand and kept here.
  const firstPage = useGetSupportConversationsQuery({ unread: unreadOnly || undefined }, POLL_OPTIONS);
  const [fetchMoreConversations, { isFetching: isLoadingMore }] = supportApi.useLazyGetSupportConversationsQuery();
  const [olderConversations, setOlderConversations] = useState<SupportConversation[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null | undefined>(undefined);

  // A new filter starts from the first page again.
  useEffect(() => {
    setOlderConversations([]);
    setOlderCursor(undefined);
  }, [unreadOnly]);

  // Fresh first-page rows win over stale copies of the same thread from older pages.
  const conversations = useMemo(() => {
    const fresh = firstPage.data?.items ?? [];
    const freshIds = new Set(fresh.map((c) => c.id));
    return [...fresh, ...olderConversations.filter((c) => !freshIds.has(c.id))];
  }, [firstPage.data, olderConversations]);

  const nextCursor = olderCursor === undefined ? firstPage.data?.nextCursor ?? null : olderCursor;

  const loadMoreConversations = async () => {
    if (!nextCursor) return;
    try {
      const page = await fetchMoreConversations({ cursor: nextCursor, unread: unreadOnly || undefined }).unwrap();
      setOlderConversations((previous) => [...previous, ...page.items]);
      setOlderCursor(page.nextCursor);
    } catch {
      // The button stays visible so the admin can retry; the polled list keeps working.
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] min-h-[560px] lg:h-[640px]">
      {/* Conversation list */}
      <div className="border-b lg:border-b-0 lg:border-r border-neutral-200 flex flex-col min-h-0 max-h-[360px] lg:max-h-none">
        <div className="p-3 border-b border-neutral-100">
          <FilterTabs<InboxFilter>
            value={filter}
            onChange={setFilter}
            className="w-full"
            tabs={[
              { value: 'all', label: 'All' },
              { value: 'unread', label: 'Unread' },
            ]}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {firstPage.isLoading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
            </div>
          ) : firstPage.isError ? (
            <div className="p-4 text-center text-xs text-neutral-500 space-y-2">
              <p>{getErrorMessage(firstPage.error)}</p>
              <Button variant="outline" size="sm" onClick={() => firstPage.refetch()}>
                Try Again
              </Button>
            </div>
          ) : conversations.length === 0 ? (
            <p className="p-6 text-center text-xs text-neutral-500 font-medium">
              {unreadOnly ? 'No unread support chats.' : 'No support chats yet.'}
            </p>
          ) : (
            <>
              {conversations.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  isSelected={conversation.id === selectedConversationId}
                  onClick={() => onSelectConversation(conversation.id)}
                />
              ))}
              {nextCursor && (
                <div className="p-3 flex justify-center">
                  <Button variant="ghost" size="sm" onClick={() => void loadMoreConversations()} isLoading={isLoadingMore}>
                    Load more chats
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Chat panel — keyed so switching threads resets scroll position, older pages and the draft. */}
      <div className="flex flex-col min-h-0 min-w-0">
        {selectedConversationId ? (
          <SupportChatPanel key={selectedConversationId} conversationId={selectedConversationId} onOpenTicket={onOpenTicket} />
        ) : (
          <div className="flex-1 flex items-center justify-center p-6">
            <EmptyState
              icon={<MessagesSquare className="w-6 h-6" />}
              title="Pick a conversation"
              description="Choose a support chat on the left, or open one from a ticket."
              className="w-full max-w-md"
            />
          </div>
        )}
      </div>
    </div>
  );
};

const ConversationRow: React.FC<{ conversation: SupportConversation; isSelected: boolean; onClick: () => void }> = ({
  conversation,
  isSelected,
  onClick,
}) => {
  const fromUser = conversation.lastMessage?.senderId === conversation.user.id;
  const preview =
    conversation.lastMessage?.kind === 'system'
      ? conversation.lastMessage.text
      : conversation.lastMessage
        ? `${fromUser ? '' : 'You: '}${conversation.lastMessage.text}`
        : 'No messages yet';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-3.5 py-3 flex items-start gap-3 border-b border-neutral-100 transition-colors cursor-pointer',
        isSelected ? 'bg-neutral-100' : 'hover:bg-neutral-50'
      )}
    >
      <Avatar src={conversation.user.avatar} name={conversation.user.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn('text-sm truncate', conversation.unread > 0 ? 'font-black text-neutral-950' : 'font-bold text-neutral-800')}>
            {conversation.user.name}
          </span>
          <span className="text-[10px] text-neutral-400 font-semibold shrink-0">{timeAgo(conversation.lastMessageAt)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-[11px] text-neutral-500 truncate">
            <span className="uppercase font-bold text-[10px] text-neutral-400 mr-1">{conversation.user.role}</span>
            {preview}
          </span>
          {conversation.unread > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-500 text-white leading-none shrink-0">
              {conversation.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

/** Sorts oldest → newest for display; ObjectIds also sort by time, so they break ties. */
const byCreatedAt = (a: SupportMessage, b: SupportMessage) =>
  a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

const SupportChatPanel: React.FC<{ conversationId: string; onOpenTicket: (ticketId: string) => void }> = ({
  conversationId,
  onOpenTicket,
}) => {
  const latest = useGetSupportMessagesQuery({ conversationId }, POLL_OPTIONS);
  const [fetchOlder, { isFetching: isLoadingOlder }] = useLazyGetSupportMessagesQuery();
  const [olderMessages, setOlderMessages] = useState<SupportMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null | undefined>(undefined);
  const [markRead] = useMarkSupportConversationReadMutation();

  const conversation = latest.data?.conversation;
  const userId = conversation?.user.id;

  // The polled newest page + any older pages, de-duplicated and in reading order.
  const messages = useMemo(() => {
    const byId = new Map<string, SupportMessage>();
    for (const message of [...olderMessages, ...(latest.data?.items ?? [])]) byId.set(message.id, message);
    return [...byId.values()].sort(byCreatedAt);
  }, [olderMessages, latest.data]);

  const olderPageCursor = olderCursor === undefined ? latest.data?.nextCursor ?? null : olderCursor;

  // Opening a thread (and every poll that brings new user messages) clears the admin-side unread count.
  const unread = conversation?.unread ?? 0;
  const hasMarkedOnOpen = useRef(false);
  useEffect(() => {
    if (!conversation) return;
    if (!hasMarkedOnOpen.current || unread > 0) {
      hasMarkedOnOpen.current = true;
      void markRead(conversationId);
    }
  }, [conversation, unread, conversationId, markRead]);

  // Stick to the bottom when a new message arrives, but not when older history is prepended.
  const scrollRef = useRef<HTMLDivElement>(null);
  const newestId = messages[messages.length - 1]?.id;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newestId]);

  const loadOlder = async () => {
    if (!olderPageCursor) return;
    const el = scrollRef.current;
    const distanceFromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    try {
      const page = await fetchOlder({ conversationId, before: olderPageCursor }).unwrap();
      setOlderMessages((previous) => [...page.items, ...previous]);
      setOlderCursor(page.nextCursor);
      // Keep the message the admin was looking at in place after older ones are added above it.
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - distanceFromBottom;
      });
    } catch {
      // Leave the button so the admin can retry.
    }
  };

  if (latest.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
      </div>
    );
  }
  if (latest.isError || !conversation) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-neutral-500">
        {getErrorMessage(latest.error, 'Conversation not found.')}
      </div>
    );
  }

  const userLastReadAt = conversation.userLastReadAt ? new Date(conversation.userLastReadAt).getTime() : 0;
  const lastAdminMessage = [...messages].reverse().find((m) => m.kind !== 'system' && m.senderId !== userId);

  return (
    <>
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar src={conversation.user.avatar} name={conversation.user.name} size="sm" />
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-neutral-950 truncate">{conversation.user.name}</div>
            <div className="text-[11px] text-neutral-500 font-semibold truncate">
              <span className="capitalize">{conversation.user.role}</span>
              {conversation.user.handle && ` · @${conversation.user.handle}`}
              {!conversation.user.available && <span className="text-rose-600"> · account inactive</span>}
            </div>
          </div>
        </div>
        {latest.isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-300 shrink-0" />}
      </div>

      {/* The user's open tickets — quick jump to resolve them */}
      {latest.data!.openTickets.length > 0 && (
        <div className="px-4 py-2 border-b border-neutral-100 bg-amber-50/60 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-amber-800 mr-1">Open tickets:</span>
          {latest.data!.openTickets.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => onOpenTicket(ticket.id)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-amber-200 text-[11px] font-bold text-amber-900 hover:bg-amber-100 cursor-pointer"
              title={ticket.reason}
            >
              <Ticket className="w-3 h-3" />
              {ticket.code}
              {ticket.orderCode && <span className="font-mono text-amber-700">· {ticket.orderCode}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-neutral-50/60 min-h-[240px]">
        {olderPageCursor && (
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" leftIcon={<ChevronUp className="w-3.5 h-3.5" />} onClick={() => void loadOlder()} isLoading={isLoadingOlder}>
              Load older messages
            </Button>
          </div>
        )}
        {messages.length === 0 && <p className="text-center text-xs text-neutral-400 py-8">No messages in this thread yet.</p>}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            fromUser={message.senderId === userId}
            showSeen={message.id === lastAdminMessage?.id && userLastReadAt >= new Date(message.createdAt).getTime()}
          />
        ))}
      </div>

      <ChatComposer conversationId={conversationId} />
    </>
  );
};

const MessageBubble: React.FC<{ message: SupportMessage; fromUser: boolean; showSeen: boolean }> = ({ message, fromUser, showSeen }) => {
  // Ticket opened / resolved and similar notices are centred, not attributed to anyone.
  if (message.kind === 'system') {
    return (
      <div className="flex justify-center">
        <div className="max-w-[85%] px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-semibold text-center leading-relaxed">
          {message.text}
          <div className="text-[10px] text-amber-700/70 mt-0.5 font-medium">{formatDateTime(message.createdAt)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', fromUser ? 'items-start' : 'items-end')}>
      <div
        className={cn(
          'max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm',
          fromUser ? 'bg-white border border-neutral-200 text-neutral-900 rounded-bl-md' : 'bg-brand-black text-white rounded-br-md'
        )}
      >
        {message.isDeleted ? (
          <span className="italic opacity-60">This message was deleted</span>
        ) : (
          <>
            {message.kind === 'offer' && <span className="block text-[11px] font-bold opacity-70 mb-0.5">Offer card</span>}
            {message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}
            {message.attachments.length > 0 && (
              <div className={cn('space-y-1', message.text && 'mt-2')}>
                {message.attachments.map((attachment) => (
                  <AttachmentLink key={attachment.id} attachment={attachment} inverted={!fromUser} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <span className="text-[10px] text-neutral-400 font-semibold mt-1 px-1">
        {fromUser ? '' : 'Influverse Support · '}
        {formatDateTime(message.createdAt)}
        {showSeen && ' · Seen'}
      </span>
    </div>
  );
};

/** Chat files are private: ask the server for a short-lived signed URL when the admin clicks. */
const AttachmentLink: React.FC<{ attachment: SupportAttachment; inverted: boolean }> = ({ attachment, inverted }) => {
  const [getFileUrl, { isFetching }] = useLazyGetAdminFileUrlQuery();
  const [error, setError] = useState('');

  const open = async () => {
    setError('');
    try {
      const { url } = await getFileUrl(attachment.id).unwrap();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => void open()}
        disabled={isFetching}
        className={cn(
          'flex items-center gap-1.5 text-xs font-bold hover:underline disabled:opacity-50 text-left',
          inverted ? 'text-white' : 'text-neutral-900'
        )}
      >
        {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <FileText className="w-3.5 h-3.5 shrink-0" />}
        <span className="truncate">{attachment.name}</span>
        <span className="opacity-60 font-medium shrink-0">({Math.max(1, Math.round(attachment.size / 1024))} KB)</span>
      </button>
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
    </div>
  );
};

type PendingUpload = { localId: string; name: string; file: UploadedFile | null; error: string | null };

const ChatComposer: React.FC<{ conversationId: string }> = ({ conversationId }) => {
  const [text, setText] = useState('');
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [sendError, setSendError] = useState('');
  const [sendMessage, { isLoading: isSending }] = useSendSupportMessageMutation();
  const uploadFile = useUploadFile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isUploading = uploads.some((u) => !u.file && !u.error);
  const readyAttachmentIds = uploads.filter((u) => u.file).map((u) => u.file!.id);
  const canSend = !isSending && !isUploading && (text.trim().length > 0 || readyAttachmentIds.length > 0);

  // Files go straight to storage (presigned upload) before the message is sent with their ids.
  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const room = MAX_ATTACHMENTS - uploads.length;
    Array.from(files)
      .slice(0, Math.max(0, room))
      .forEach((file) => {
        const localId = crypto.randomUUID();
        setUploads((previous) => [...previous, { localId, name: file.name, file: null, error: null }]);
        uploadFile(file, 'chat_attachment')
          .then((uploaded) => setUploads((previous) => previous.map((u) => (u.localId === localId ? { ...u, file: uploaded } : u))))
          .catch((err) =>
            setUploads((previous) =>
              previous.map((u) => (u.localId === localId ? { ...u, error: getErrorMessage(err, err?.message || 'Upload failed') } : u))
            )
          );
      });
  };

  const send = async () => {
    if (!canSend) return;
    setSendError('');
    try {
      await sendMessage({
        conversationId,
        text: text.trim() || undefined,
        attachmentIds: readyAttachmentIds.length ? readyAttachmentIds : undefined,
        // Lets the server ignore a double-submitted message instead of posting it twice.
        clientMsgId: crypto.randomUUID(),
      }).unwrap();
      setText('');
      setUploads([]);
    } catch (err) {
      setSendError(getErrorMessage(err));
    }
  };

  return (
    <div className="border-t border-neutral-200 p-3 space-y-2 bg-white">
      <ErrorBanner message={sendError} onDismiss={() => setSendError('')} />
      {uploads.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {uploads.map((upload) => (
            <span
              key={upload.localId}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold max-w-[220px]',
                upload.error ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-neutral-50 border-neutral-200 text-neutral-700'
              )}
              title={upload.error ?? upload.name}
            >
              {!upload.file && !upload.error ? <Loader2 className="w-3 h-3 animate-spin shrink-0" /> : <FileText className="w-3 h-3 shrink-0" />}
              <span className="truncate">{upload.name}</span>
              <button
                type="button"
                onClick={() => setUploads((previous) => previous.filter((u) => u.localId !== upload.localId))}
                className="p-0.5 hover:text-neutral-950 shrink-0"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          title="Attach files"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploads.length >= MAX_ATTACHMENTS}
        >
          <Paperclip className="w-4 h-4" />
        </Button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT_LENGTH))}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter adds a line break.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder="Reply as Influverse Support…"
          className="flex-1 min-h-[44px] max-h-40 p-2.5 text-sm bg-white border border-neutral-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-brand-pink/20 focus:border-brand-pink placeholder:text-neutral-400"
        />
        <Button variant="primary" size="md" onClick={() => void send()} disabled={!canSend} isLoading={isSending} leftIcon={<Send className="w-4 h-4" />}>
          Send
        </Button>
      </div>
      {text.length > MAX_TEXT_LENGTH - 200 && (
        <p className="text-[11px] text-neutral-400 text-right">
          {text.length} / {MAX_TEXT_LENGTH}
        </p>
      )}
    </div>
  );
};
