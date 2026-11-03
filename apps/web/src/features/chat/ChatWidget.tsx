import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCurrentUser } from '../../shared/api/client';
import { announceFloatingPanel, useCloseWhenOtherPanelOpens } from '../../shared/lib/floatingPanels';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import { ChatPage, type ChatRealtimeFeed } from './ChatPage';
import { CHAT_UNREAD_EVENT, getChatUnreadCount } from './chatApi';
import { subscribeChat, type ChatConnection } from './chatRealtime';
import './chat-widget.css';

const connectionLabel: Record<ChatConnection, string> = {
  connecting: 'Đang kết nối…', connected: 'Cập nhật trực tiếp',
  reconnecting: 'Mất kết nối · đang thử lại', disabled: 'Bấm làm mới để xem tin mới',
};

export function ChatWidget() {
  const user = getCurrentUser();
  const allowed = !user || ['MEMBER', 'STAFF', 'COACH'].includes(user.role);
  if (!allowed) return null;
  return user ? <SignedInChatWidget /> : <ChatShell unread={0} feed={null} onOpen={() => {}} />;
}

/** Widget giữ một kết nối realtime duy nhất: vừa cập nhật badge chưa đọc, vừa báo cho khung chat tải lại. */
function SignedInChatWidget() {
  const [unread, setUnread] = useState(0);
  const [connection, setConnection] = useState<ChatConnection>('connecting');
  const [tick, setTick] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const refreshUnread = useCallback(() => {
    void getChatUnreadCount().then(data => setUnread(data.count)).catch(() => {});
  }, []);
  useEffect(() => subscribeChat(() => { setTick(n => n + 1); refreshUnread(); }, setConnection), [refreshUnread, attempt]);
  useEffect(() => {
    refreshUnread();
    const onCount = (event: Event) => setUnread((event as CustomEvent<number>).detail);
    window.addEventListener(CHAT_UNREAD_EVENT, onCount);
    return () => window.removeEventListener(CHAT_UNREAD_EVENT, onCount);
  }, [refreshUnread]);
  const feed: ChatRealtimeFeed = { connection, tick, reconnect: () => setAttempt(n => n + 1) };
  return <ChatShell unread={unread} feed={feed} onOpen={refreshUnread} onRefresh={() => { setTick(n => n + 1); refreshUnread(); }} />;
}

function ChatShell({ unread, feed, onOpen, onRefresh }: { unread: number; feed: ChatRealtimeFeed | null; onOpen: () => void; onRefresh?: () => void }) {
  const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useCloseWhenOtherPanelOpens('chat', () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const close = () => { setOpen(false); trigger.current?.focus(); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const label = unread > 0 ? `Tin nhắn · ${unread} chưa đọc` : 'Tin nhắn';
  return <div className="chat-widget">
    <button ref={trigger} type="button" className="chat-widget__trigger" title={label} aria-label={open ? 'Đóng tin nhắn' : `Mở ${label.toLowerCase()}`} aria-haspopup="dialog" aria-expanded={open} aria-controls="sol-direct-chat"
      onClick={() => {
        setVisited(true);
        if (!open) { announceFloatingPanel('chat'); onOpen(); }
        setOpen(value => !value);
      }}>
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9 9 0 0 1 18 0Z" /><path d="M7 10h8M7 14h5" /></svg>
      {unread > 0 && <span className="chat-widget__badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {visited && <section ref={panel} id="sol-direct-chat" className="chat-widget__panel" role="dialog" aria-label="Tin nhắn SÖL" hidden={!open}>
      <header className="chat-widget__header">
        <div><strong>Tin nhắn</strong>
          {feed && <p className={`chat-widget__status is-${feed.connection}`} role="status">{connectionLabel[feed.connection]}
            {feed.connection === 'reconnecting' && <button type="button" className="direct-chat__link" onClick={feed.reconnect}>Thử lại</button>}</p>}
        </div>
        <div className="chat-widget__header-actions">
          {onRefresh && <RefreshButton label="Làm mới tin nhắn" onClick={onRefresh} />}
          <button ref={closeButton} type="button" className="chat-widget__close" aria-label="Đóng cửa sổ tin nhắn" onClick={() => { setOpen(false); trigger.current?.focus(); }}>×</button>
        </div>
      </header>
      {feed ? <ChatPage embedded visible={open} realtime={feed} /> : <div className="chat-widget__login"><p>Đăng nhập để trao đổi riêng với lễ tân và huấn luyện viên.</p><Link to="/login" className="btn-primary">Đăng nhập để nhắn tin</Link></div>}
    </section>}
  </div>;
}
