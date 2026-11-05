import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCurrentUser } from '../../shared/api/client';
import { announceFloatingPanel, useCloseWhenOtherPanelOpens } from '../../shared/lib/floatingPanels';
import type { ChatRealtimeFeed } from './ChatPage';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { CHAT_UNREAD_EVENT, getChatUnreadCount, type ChatContact } from './chatApi';
import { subscribeChat, type ChatConnection } from './chatRealtime';
import { LiquidGlassContainer } from '../../shared/liquid-glass/LiquidGlassContainer';
import './chat-widget.css';

// Khung hội thoại (danh sách, hội thoại, SÖL AI) chỉ tải khi mở widget lần đầu.
const ChatPage = lazy(() => import('./ChatPage').then(module => ({ default: module.ChatPage })));

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
  const [expanded, setExpanded] = useState(false);
  const [peers, setPeers] = useState<ChatContact[]>([]);
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
    <button
      ref={trigger}
      type="button"
      className={`chat-widget__trigger${open ? ' is-open' : ''}`}
      title={label}
      aria-label={open ? 'Đóng tin nhắn' : `Mở ${label.toLowerCase()}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls="sol-direct-chat"
      onClick={() => {
        setVisited(true);
        if (!open) { announceFloatingPanel('chat'); onOpen(); }
        setOpen(value => !value);
      }}
    >
      <span className="chat-widget__trigger-main" aria-hidden="true">
        <span className="chat-widget__trigger-icon">
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="3" x2="9.218" y2="10.083" />
            <polygon points="11.698 20.334 22 3.001 2 3.001 9.218 10.084 11.698 20.334" />
          </svg>
          {unread > 0 && <span className="chat-widget__badge">{unread > 99 ? '99+' : unread}</span>}
        </span>
        <span className="chat-widget__trigger-label">Tin nhắn</span>
      </span>
      <span className="chat-widget__trigger-avatars" aria-hidden="true">
        {[0, 1, 2].map(index => {
          const peer = peers[index];
          return (
            <span key={peer?.id ?? `slot-${index}`} className={`chat-widget__mini-avatar is-slot-${index}`}>
              {peer?.avatarUrl ? (
                <img src={peer.avatarUrl} alt="" />
              ) : (
                <svg viewBox="0 0 36 36" fill="none">
                  <circle cx="18" cy="13.5" r="6" fill="currentColor" />
                  <path d="M7 31.5c1.8-5.5 5.8-8.2 11-8.2s9.2 2.7 11 8.2" fill="currentColor" />
                </svg>
              )}
            </span>
          );
        })}
      </span>
    </button>
    {visited && <section ref={panel} id="sol-direct-chat" className={`chat-widget__panel${expanded ? ' is-expanded' : ''}`} role="dialog" aria-label="Tin nhắn SÖL" hidden={!open}>
      <LiquidGlassContainer shape="rounded" borderRadius={16} tintOpacity={0.12} className="chat-widget__glass" />
      <header className="chat-widget__header">
        <div className="chat-widget__header-title">
          <strong>Tin nhắn</strong>
          {feed && <p className={`chat-widget__status is-${feed.connection}`} role="status">{connectionLabel[feed.connection]}
            {feed.connection === 'reconnecting' && <button type="button" className="direct-chat__link" onClick={feed.reconnect}>Thử lại</button>}</p>}
        </div>
        <div className="chat-widget__header-actions">
          <button
            type="button"
            className="chat-widget__icon-btn"
            aria-label={expanded ? 'Thu nhỏ cửa sổ tin nhắn' : 'Mở rộng cửa sổ tin nhắn'}
            title={expanded ? 'Thu nhỏ' : 'Mở rộng'}
            onClick={() => { setExpanded(v => !v); onRefresh?.(); }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
          <button ref={closeButton} type="button" className="chat-widget__close" aria-label="Đóng cửa sổ tin nhắn" onClick={() => { setOpen(false); trigger.current?.focus(); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </header>
      {feed ? <Suspense fallback={<div className="chat-widget__loading"><LoadingSkeleton label="Đang mở tin nhắn…" count={4} /></div>}>
        <ChatPage embedded visible={open} realtime={feed} onPeersChange={setPeers} />
      </Suspense> : <div className="chat-widget__login"><p>Đăng nhập để trao đổi với lễ tân, huấn luyện viên và trợ lý SÖL AI.</p><Link to="/login" className="btn-primary">Đăng nhập để nhắn tin</Link></div>}
    </section>}
  </div>;
}
