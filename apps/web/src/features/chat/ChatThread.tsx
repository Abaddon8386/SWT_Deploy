import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatCenterDateTime } from '../../shared/lib/centerTime';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { announceChatUnread, chatRoleLabel, markConversationRead, type ChatConversation } from './chatApi';
import { ChatAvatar } from './ChatAvatar';
import { ChatComposer } from './ChatComposer';
import { useI18n } from '../../shared/i18n';
import type { useChatConversation } from './useChatConversation';

type ChatState = ReturnType<typeof useChatConversation>;


export function ChatThread({ conversation, chat, onBack, active = true, canMarkRead = active, onRead }: {
  conversation: ChatConversation; chat: ChatState; onBack: () => void; active?: boolean; canMarkRead?: boolean; onRead?: (conversationId: number) => void;
}) {
  const { t } = useI18n();
  const [likedIds, setLikedIds] = useState<Set<number>>(() => new Set());
  const reported = useRef(0);
  const scroll = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const atBottom = useRef(true);
  const previous = useRef<{ first?: number; last?: number; height: number }>({ height: 0 });
  const [newBelow, setNewBelow] = useState(false);
  useEffect(() => { if (active) title.current?.focus({ preventScroll: true }); }, [active]);
  useLayoutEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const first = chat.messages[0]?.id, last = chat.messages.at(-1)?.id;
    const old = previous.current;
    if (old.first !== undefined && first !== undefined && first < old.first) {
      node.scrollTop += node.scrollHeight - old.height;
    } else if (atBottom.current) node.scrollTop = node.scrollHeight;
    else if (last !== undefined && old.last !== undefined && last > old.last) setNewBelow(true);
    previous.current = { first, last, height: node.scrollHeight };
  }, [chat.messages]);

  // Chỉ đánh dấu đã đọc khi người dùng đang thật sự nhìn thấy hội thoại.
  const lastPeerId = chat.messages.reduce((latest, message) => message.mine ? latest : Math.max(latest, message.id), 0);
  useEffect(() => {
    if (!canMarkRead || chat.loading || lastPeerId <= reported.current || document.visibilityState === 'hidden') return;
    reported.current = lastPeerId;
    onRead?.(conversation.id);
    void markConversationRead(conversation.id, lastPeerId).then(result => announceChatUnread(result.count)).catch(() => { reported.current = 0; });
  }, [canMarkRead, chat.loading, lastPeerId, conversation.id, onRead]);

  const unavailable = !conversation.peer.available;

  function toggleLike(id: number) {
    setLikedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return <section data-i18n-managed className="direct-chat__thread" aria-labelledby="chat-thread-title">
    <header className="direct-chat__thread-header">
      <button type="button" data-i18n-managed className="direct-chat__back direct-chat__link" onClick={onBack} aria-label={t('Quay lại danh sách', 'Back to conversations')} title={t('Quay lại danh sách', 'Back to conversations')}>
        <svg className="direct-chat__back-chevron" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span className="direct-chat__back-label">{t('Danh sách', 'Conversations')}</span>
      </button>
      <div className="direct-chat__thread-peer">
        <ChatAvatar contact={conversation.peer} className="direct-chat__thread-avatar" />
        <div className="direct-chat__thread-meta">
          <h2 id="chat-thread-title" data-i18n-managed data-thread-title tabIndex={-1} ref={title}>{conversation.peer.name}</h2>
          <p className={unavailable ? 'is-unavailable' : undefined}>{chatRoleLabel(conversation.peer.role, t)}{unavailable ? t(' · Tài khoản không còn khả dụng', ' · Account unavailable') : ''}</p>
        </div>
      </div>
    </header>
    {chat.error && <div role="alert" className="direct-chat__error"><p>{chat.error}</p><button type="button" className="direct-chat__link" onClick={() => void chat.refresh()}>{t("Thử lại tải tin nhắn", "Retry loading messages")}</button></div>}
    <div className="direct-chat__transcript" ref={scroll} role="region" aria-label={t("Lịch sử tin nhắn", "Message history")} tabIndex={0} aria-busy={chat.loading || chat.olderLoading}
      onScroll={() => { const node = scroll.current; if (node) { atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64; if (atBottom.current) setNewBelow(false); } }}>
      {chat.hasOlder && <button type="button" className="direct-chat__older direct-chat__link" disabled={chat.olderLoading} onClick={() => void chat.loadOlder()}>{chat.olderLoading ? t('Đang tải…', 'Loading…') : t('Tải tin nhắn cũ hơn', 'Load older messages')}</button>}
      {chat.olderLoading && <LoadingSkeleton label={t("Đang tải tin nhắn cũ hơn…", "Loading older messages…")} count={2} />}
      {chat.loading ? <LoadingSkeleton label={t("Đang tải tin nhắn…", "Loading messages…")} count={4} />
        : chat.messages.length === 0 && !chat.error ? <p className="direct-chat__empty">{t("Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện.", "No messages yet. Start the conversation.")}</p> : null}
      <ol className="direct-chat__messages">{chat.messages.map(message => {
        const liked = likedIds.has(message.id);
        return <li key={message.id} className={message.mine ? 'is-mine' : undefined}>
          <div className={`direct-chat__bubble${liked ? ' has-reaction' : ''}`} onDoubleClick={() => toggleLike(message.id)}>
            <span data-i18n-managed className="direct-chat__sender">{message.mine ? t('Bạn', 'You') : conversation.peer.name}</span>
            <p data-i18n-managed>{message.message}</p>
            <time dateTime={message.createdAt}>{formatCenterDateTime(message.createdAt)}</time>
            {liked && <span className="direct-chat__reaction-pill" aria-hidden="true">❤️</span>}
          </div>
          <button type="button" className={`direct-chat__react-trigger${liked ? ' is-liked' : ''}`} aria-pressed={liked} aria-label={t('Thả tim tin nhắn', 'Like message')} title={t('Thả tim tin nhắn', 'Like message')} onClick={() => toggleLike(message.id)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={liked ? '#ff3040' : 'none'} stroke={liked ? '#ff3040' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </li>;
      })}</ol>
    </div>
    {newBelow && <button className="direct-chat__new direct-chat__link" type="button" onClick={() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; atBottom.current = true; setNewBelow(false); }}>{t("Có tin nhắn mới · Xem ↓", "New messages · View ↓")}</button>}
    <p className="direct-chat__sr" role="status">{!chat.loading && chat.messages.length > 0 ? t(`Đang hiển thị ${chat.messages.length} tin nhắn.`, `Showing ${chat.messages.length} messages.`) : ''}</p>
    <ChatComposer id="chat-message" label={t('Tin nhắn cho', 'Message to') + ' ' + conversation.peer.name}
      value={chat.draft} onChange={chat.setDraft} onSubmit={() => void chat.send()}
      disabled={unavailable || chat.loading} sending={chat.sending} failed={!!chat.sendError}
      error={chat.sendError ? chat.sendError + ' ' + t('Nội dung đã được giữ lại; bạn có thể gửi lại.', 'Your message was kept; you can retry.') : null}
      notice={unavailable ? t('Bạn vẫn có thể đọc lịch sử. Tài khoản này không thể nhận tin nhắn mới.', 'You can still read the history. This account cannot receive new messages.') : undefined} />
  </section>;
}
