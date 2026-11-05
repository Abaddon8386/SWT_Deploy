import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatCenterDateTime } from '../../shared/lib/centerTime';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { announceChatUnread, chatRoleLabel, markConversationRead, type ChatConversation } from './chatApi';
import { ChatAvatar } from './ChatAvatar';
import type { useChatConversation } from './useChatConversation';

type ChatState = ReturnType<typeof useChatConversation>;

/** Bàn phím vật lý: Enter gửi, Shift + Enter xuống dòng. Màn hình cảm ứng giữ Enter để xuống dòng. */
const enterSends = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;

const QUICK_EMOJIS = ['❤️', '😂', '😆', '😍', '🔥', '🙌', '👏', '👍'];

export function ChatThread({ conversation, chat, onBack, active = true, canMarkRead = active, onRead }: {
  conversation: ChatConversation; chat: ChatState; onBack: () => void; active?: boolean; canMarkRead?: boolean; onRead?: (conversationId: number) => void;
}) {
  const [quickSend] = useState(enterSends);
  const [emojiOpen, setEmojiOpen] = useState(false);
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
  const hasDraft = chat.draft.trim().length > 0 || !!chat.sendError || chat.sending;

  function toggleLike(id: number) {
    setLikedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return <section className="direct-chat__thread" aria-labelledby="chat-thread-title">
    <header className="direct-chat__thread-header">
      <button type="button" className="direct-chat__back direct-chat__link" onClick={onBack} aria-label="Quay lại danh sách">
        <svg className="direct-chat__back-chevron" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span className="direct-chat__back-label">Danh sách</span>
      </button>
      <div className="direct-chat__thread-peer">
        <ChatAvatar contact={conversation.peer} className="direct-chat__thread-avatar" />
        <div className="direct-chat__thread-meta">
          <h2 id="chat-thread-title" data-thread-title tabIndex={-1} ref={title}>{conversation.peer.name}</h2>
          <p className={unavailable ? 'is-unavailable' : undefined}>{chatRoleLabel(conversation.peer.role)}{unavailable ? ' · Tài khoản không còn khả dụng' : ''}</p>
        </div>
      </div>
    </header>
    {chat.error && <div role="alert" className="direct-chat__error"><p>{chat.error}</p><button type="button" className="direct-chat__link" onClick={() => void chat.refresh()}>Thử lại tải tin nhắn</button></div>}
    <div className="direct-chat__transcript" ref={scroll} role="region" aria-label="Lịch sử tin nhắn" tabIndex={0} aria-busy={chat.loading || chat.olderLoading}
      onScroll={() => { const node = scroll.current; if (node) { atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64; if (atBottom.current) setNewBelow(false); } }}>
      {chat.hasOlder && <button type="button" className="direct-chat__older direct-chat__link" disabled={chat.olderLoading} onClick={() => void chat.loadOlder()}>{chat.olderLoading ? 'Đang tải…' : 'Tải tin nhắn cũ hơn'}</button>}
      {chat.olderLoading && <LoadingSkeleton label="Đang tải tin nhắn cũ hơn…" count={2} />}
      {chat.loading ? <LoadingSkeleton label="Đang tải tin nhắn…" count={4} />
        : chat.messages.length === 0 && !chat.error ? <p className="direct-chat__empty">Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện.</p> : null}
      <ol className="direct-chat__messages">{chat.messages.map(message => {
        const liked = likedIds.has(message.id);
        return <li key={message.id} className={message.mine ? 'is-mine' : undefined}>
          <div className={`direct-chat__bubble${liked ? ' has-reaction' : ''}`} onDoubleClick={() => toggleLike(message.id)}>
            <span className="direct-chat__sender">{message.mine ? 'Bạn' : conversation.peer.name}</span>
            <p>{message.message}</p>
            <time dateTime={message.createdAt}>{formatCenterDateTime(message.createdAt)}</time>
            {liked && <span className="direct-chat__reaction-pill" aria-hidden="true">❤️</span>}
          </div>
          <span className={`direct-chat__react-trigger${liked ? ' is-liked' : ''}`} role="presentation" aria-hidden="true" title="Thả tim tin nhắn" onClick={() => toggleLike(message.id)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={liked ? '#ff3040' : 'none'} stroke={liked ? '#ff3040' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </span>
        </li>;
      })}</ol>
    </div>
    {newBelow && <button className="direct-chat__new direct-chat__link" type="button" onClick={() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; atBottom.current = true; setNewBelow(false); }}>Có tin nhắn mới · Xem ↓</button>}
    <p className="direct-chat__sr" role="status">{!chat.loading && chat.messages.length > 0 ? `Đang hiển thị ${chat.messages.length} tin nhắn.` : ''}</p>
    <form className="direct-chat__compose" onSubmit={event => { event.preventDefault(); setEmojiOpen(false); if (!unavailable && !chat.loading) void chat.send(); }}>
      <label htmlFor="chat-message" className="portal-label">Tin nhắn cho {conversation.peer.name}</label>
      {unavailable && <p className="direct-chat__muted">Bạn vẫn có thể đọc lịch sử. Tài khoản này không thể nhận tin nhắn mới.</p>}
      {emojiOpen && !unavailable && (
        <div className="direct-chat__emoji-bar" aria-hidden="true">
          {QUICK_EMOJIS.map(emoji => (
            <span key={emoji} className="direct-chat__emoji-item" role="presentation" onClick={() => { chat.setDraft(`${chat.draft}${emoji}`); setEmojiOpen(false); }}>
              {emoji}
            </span>
          ))}
        </div>
      )}
      <div className="direct-chat__compose-pill">
        <span className="direct-chat__composer-icon" role="presentation" aria-hidden="true" title="Biểu tượng cảm xúc" onClick={() => { if (!unavailable && !chat.loading) setEmojiOpen(v => !v); }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2.5" />
            <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2.5" />
          </svg>
        </span>
        <textarea id="chat-message" className="portal-textarea" value={chat.draft} maxLength={2000} rows={1}
          disabled={unavailable || chat.loading} onChange={event => chat.setDraft(event.target.value)} placeholder="Nhắn tin..."
          aria-describedby={chat.sendError ? 'chat-send-error' : 'chat-compose-hint'}
          onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && (event.ctrlKey || event.metaKey || (quickSend && !event.shiftKey))) {
            event.preventDefault(); setEmojiOpen(false); if (!unavailable && !chat.loading) void chat.send();
          } }} />
        {!hasDraft && (
          <span className="direct-chat__composer-tools" aria-hidden="true">
            <span className="direct-chat__composer-icon" role="presentation" title="Ghi âm">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </span>
            <span className="direct-chat__composer-icon" role="presentation" title="Đính kèm hình ảnh">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3" ry="3" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </span>
            <span className="direct-chat__composer-icon" role="presentation" title="Gửi nhãn dán / tim" onClick={() => { if (!unavailable && !chat.loading) chat.setDraft(`${chat.draft}❤️`); }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
                <path d="M14 3v4a2 2 0 0 0 2 2h4" />
                <path d="M8 13h.01" />
                <path d="M16 13h.01" />
                <path d="M10 16s.8 1 2 1 2-1 2-1" />
              </svg>
            </span>
          </span>
        )}
        <button type="submit" className={`btn-primary direct-chat__send-btn${hasDraft ? ' is-visible' : ''}`} disabled={unavailable || chat.loading || chat.sending || !chat.draft.trim()}>
          {chat.sending ? 'Đang gửi…' : chat.sendError ? 'Gửi lại' : 'Gửi'}
        </button>
      </div>
      {chat.sendError && <p id="chat-send-error" role="alert" className="direct-chat__error">{chat.sendError} Nội dung đã được giữ lại; bạn có thể gửi lại.</p>}
      <div className="direct-chat__compose-footer"><span id="chat-compose-hint">{chat.draft.length}/2000 · {quickSend ? 'Enter để gửi, Shift + Enter xuống dòng' : 'Ctrl + Enter để gửi'}</span></div>
    </form>
  </section>;
}
