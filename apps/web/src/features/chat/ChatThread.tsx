import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatCenterDateTime } from '../../shared/lib/centerTime';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { announceChatUnread, chatRoleLabel, markConversationRead, type ChatConversation } from './chatApi';
import type { useChatConversation } from './useChatConversation';

type ChatState = ReturnType<typeof useChatConversation>;

/** Bàn phím vật lý: Enter gửi, Shift + Enter xuống dòng. Màn hình cảm ứng giữ Enter để xuống dòng. */
const enterSends = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;

export function ChatThread({ conversation, chat, onBack, active = true, canMarkRead = active, onRead }: {
  conversation: ChatConversation; chat: ChatState; onBack: () => void; active?: boolean; canMarkRead?: boolean; onRead?: (conversationId: number) => void;
}) {
  const [quickSend] = useState(enterSends);
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
  return <section className="direct-chat__thread" aria-labelledby="chat-thread-title">
    <header className="direct-chat__thread-header">
      <button type="button" className="direct-chat__back direct-chat__link" onClick={onBack}>← Danh sách</button>
      <div><h2 id="chat-thread-title" data-thread-title tabIndex={-1} ref={title}>{conversation.peer.name}</h2>
        <p>{chatRoleLabel(conversation.peer.role)}{unavailable ? ' · Tài khoản không còn khả dụng' : ''}</p></div>
    </header>
    {chat.error && <div role="alert" className="direct-chat__error"><p>{chat.error}</p><button type="button" className="direct-chat__link" onClick={() => void chat.refresh()}>Thử lại tải tin nhắn</button></div>}
    <div className="direct-chat__transcript" ref={scroll} role="region" aria-label="Lịch sử tin nhắn" tabIndex={0} aria-busy={chat.loading || chat.olderLoading}
      onScroll={() => { const node = scroll.current; if (node) { atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64; if (atBottom.current) setNewBelow(false); } }}>
      {chat.hasOlder && <button type="button" className="direct-chat__older direct-chat__link" disabled={chat.olderLoading} onClick={() => void chat.loadOlder()}>{chat.olderLoading ? 'Đang tải…' : 'Tải tin nhắn cũ hơn'}</button>}
      {chat.olderLoading && <LoadingSkeleton label="Đang tải tin nhắn cũ hơn…" count={2} />}
      {chat.loading ? <LoadingSkeleton label="Đang tải tin nhắn…" count={4} />
        : chat.messages.length === 0 && !chat.error ? <p className="direct-chat__empty">Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện.</p> : null}
      <ol className="direct-chat__messages">{chat.messages.map(message => <li key={message.id} className={message.mine ? 'is-mine' : undefined}>
        <div className="direct-chat__bubble"><span className="direct-chat__sender">{message.mine ? 'Bạn' : conversation.peer.name}</span><p>{message.message}</p>
          <time dateTime={message.createdAt}>{formatCenterDateTime(message.createdAt)}</time></div>
      </li>)}</ol>
    </div>
    {newBelow && <button className="direct-chat__new direct-chat__link" type="button" onClick={() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; atBottom.current = true; setNewBelow(false); }}>Có tin nhắn mới · Xem ↓</button>}
    <p className="direct-chat__sr" role="status">{!chat.loading && chat.messages.length > 0 ? `Đang hiển thị ${chat.messages.length} tin nhắn.` : ''}</p>
    <form className="direct-chat__compose" onSubmit={event => { event.preventDefault(); if (!unavailable && !chat.loading) void chat.send(); }}>
      <label htmlFor="chat-message" className="portal-label">Tin nhắn cho {conversation.peer.name}</label>
      {unavailable && <p className="direct-chat__muted">Bạn vẫn có thể đọc lịch sử. Tài khoản này không thể nhận tin nhắn mới.</p>}
      <textarea id="chat-message" className="portal-textarea" value={chat.draft} maxLength={2000} rows={3}
        disabled={unavailable || chat.loading} onChange={event => chat.setDraft(event.target.value)} placeholder="Nhập tin nhắn…"
        aria-describedby={chat.sendError ? 'chat-send-error' : 'chat-compose-hint'}
        onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && (event.ctrlKey || event.metaKey || (quickSend && !event.shiftKey))) {
          event.preventDefault(); if (!unavailable && !chat.loading) void chat.send();
        } }} />
      {chat.sendError && <p id="chat-send-error" role="alert" className="direct-chat__error">{chat.sendError} Nội dung đã được giữ lại; bạn có thể gửi lại.</p>}
      <div className="direct-chat__compose-footer"><span id="chat-compose-hint">{chat.draft.length}/2000 · {quickSend ? 'Enter để gửi, Shift + Enter xuống dòng' : 'Ctrl + Enter để gửi'}</span>
        <button type="submit" className="btn-primary" disabled={unavailable || chat.loading || chat.sending || !chat.draft.trim()}>{chat.sending ? 'Đang gửi…' : chat.sendError ? 'Gửi lại' : 'Gửi tin nhắn'} <span aria-hidden="true">↗</span></button></div>
    </form>
  </section>;
}
