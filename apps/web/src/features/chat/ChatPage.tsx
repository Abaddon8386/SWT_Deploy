import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentUser } from '../../shared/api/client';
import { errorMessage } from '../../shared/lib/errorMessage';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { formatCenterDate } from '../../shared/lib/centerTime';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import { chatRoleLabel, getConversations, openConversation, type ChatContact, type ChatConversation } from './chatApi';
import { subscribeChat, type ChatConnection } from './chatRealtime';
import { useChatConversation } from './useChatConversation';
import { ChatContacts } from './ChatContacts';
import { ChatThread } from './ChatThread';
import './chat.css';

const connectionLabel: Record<ChatConnection, string> = {
  connecting: 'Đang kết nối cập nhật tin nhắn…', connected: 'Cập nhật tin nhắn trực tiếp',
  reconnecting: 'Mất kết nối trực tiếp · đang thử lại', disabled: 'Cập nhật trực tiếp chưa được cấu hình',
};

/** Khi nhúng trong widget, widget giữ kết nối realtime và truyền xuống để không mở hai kết nối. */
export interface ChatRealtimeFeed { connection: ChatConnection; tick: number; reconnect: () => void }

export function ChatPage({ embedded = false, visible = true, realtime }: { embedded?: boolean; visible?: boolean; realtime?: ChatRealtimeFeed }) {
  const user = getCurrentUser();
  if (!user || !['MEMBER', 'STAFF', 'COACH'].includes(user.role))
    return <div className="portal-container"><h1 className="portal-title">Tin nhắn</h1><p role="alert">Bạn không có quyền truy cập chat riêng.</p></div>;
  return <ChatWorkspace member={user.role === 'MEMBER'} embedded={embedded} visible={visible} realtime={realtime} />;
}

function ChatWorkspace({ member, embedded, visible, realtime }: { member: boolean; embedded: boolean; visible: boolean; realtime?: ChatRealtimeFeed }) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selected, setSelected] = useState<ChatConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [showContacts, setShowContacts] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [ownConnection, setConnection] = useState<ChatConnection>('connecting');
  const connection = realtime?.connection ?? ownConnection;
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [mobileThread, setMobileThread] = useState(false);
  const pageRef = useRef(0), listSequence = useRef(0), opening = useRef(false), mounted = useRef(true);
  const listTitle = useRef<HTMLHeadingElement>(null);

  const loadInbox = useCallback(async (nextPage: number, background = false) => {
    const request = ++listSequence.current;
    if (!background) setLoading(true);
    try {
      const data = await getConversations(nextPage);
      if (!mounted.current || request !== listSequence.current) return;
      setConversations(data.content); setPage(nextPage); pageRef.current = nextPage; setTotalPages(data.totalPages); setListError(null);
      setSelected(old => data.content.find(c => c.id === old?.id) ?? old);
    } catch (e) { if (mounted.current && request === listSequence.current) setListError(errorMessage(e, 'Không thể tải hội thoại.')); }
    finally { if (mounted.current && request === listSequence.current) setLoading(false); }
  }, []);
  const onSent = useCallback(() => { void loadInbox(0, true); }, [loadInbox]);
  const chat = useChatConversation(onSent);
  const { refresh } = chat;
  useEffect(() => {
    mounted.current = true; void loadInbox(0);
    return () => { mounted.current = false; };
  }, [loadInbox]);
  const ownFeed = !realtime;
  useEffect(() => {
    if (!ownFeed) return;
    return subscribeChat(() => { void loadInbox(pageRef.current, true); void refresh(); }, setConnection);
  }, [ownFeed, loadInbox, refresh, connectionAttempt]);
  const tick = realtime?.tick ?? 0;
  useEffect(() => {
    if (tick === 0) return;
    void loadInbox(pageRef.current, true); void refresh();
  }, [tick, loadInbox, refresh]);
  const onRead = useCallback((conversationId: number) => {
    setConversations(list => list.map(c => c.id === conversationId ? { ...c, unreadCount: 0 } : c));
  }, []);

  function select(conversation: ChatConversation) {
    setSelected(conversation); chat.select(conversation.id); setMobileThread(true);
  }
  async function choose(contact: ChatContact) {
    if (opening.current) return;
    opening.current = true; setPending(contact.id); setOpenError(null);
    try {
      const conversation = await openConversation(contact.id);
      if (!mounted.current) return;
      select(conversation); setShowContacts(false); void loadInbox(0, true);
    } catch (e) { if (mounted.current) setOpenError(errorMessage(e, 'Không thể mở hội thoại.')); }
    finally { opening.current = false; if (mounted.current) setPending(null); }
  }

  return <div className={`portal-container direct-chat${mobileThread ? ' direct-chat--thread-open' : ''}`}>
    {/* Trong widget, tiêu đề, trạng thái kết nối và nút làm mới nằm ở header của widget. */}
    {!embedded && <header className="portal-header"><div><p className="portal-eyebrow">Kết nối tại SÖL</p><h1 className="portal-title">Tin nhắn</h1>
      <p className="direct-chat__intro">{member ? 'Trao đổi riêng với lễ tân và huấn luyện viên.' : 'Trao đổi riêng với hội viên của bạn.'}</p></div>
      <div className="direct-chat__connection"><span role="status" className={`direct-chat__connection-label is-${connection}`}>{connectionLabel[connection]}</span>
        {connection === 'reconnecting' && <button type="button" className="direct-chat__link" onClick={() => setConnectionAttempt(n => n + 1)}>Thử kết nối lại</button>}
        <RefreshButton label="Làm mới tin nhắn" onClick={() => { void loadInbox(pageRef.current); void refresh(); }} disabled={loading} /></div>
    </header>}
    <div className="direct-chat__workspace">
      <aside className="direct-chat__inbox" aria-labelledby="chat-inbox-title">
        <div className="direct-chat__inbox-heading"><h2 id="chat-inbox-title" tabIndex={-1} ref={listTitle}>Hội thoại của bạn</h2>
          {member && <button type="button" className="direct-chat__link" aria-expanded={showContacts} aria-controls="chat-directory" onClick={() => setShowContacts(v => !v)}>{showContacts ? 'Đóng danh bạ' : 'Cuộc trò chuyện mới'} <span aria-hidden="true">＋</span></button>}</div>
        {showContacts && <div id="chat-directory">{openError && <p role="alert" className="direct-chat__error">{openError}</p>}<ChatContacts onChoose={contact => void choose(contact)} pending={pending} /></div>}
        {listError && <div role="alert" className="direct-chat__error"><p>{listError}</p><button type="button" className="direct-chat__link" onClick={() => void loadInbox(page)}>Thử lại</button></div>}
        {loading ? <LoadingSkeleton label="Đang tải hội thoại…" count={4} />
          : conversations.length === 0 && !listError ? <p className="direct-chat__empty">{member ? 'Chưa có hội thoại. Chọn “Cuộc trò chuyện mới” để bắt đầu.' : 'Chưa có hội thoại. Tin nhắn của hội viên gửi cho bạn sẽ xuất hiện tại đây.'}</p>
            : <ul className="direct-chat__list">{conversations.map(c => <li key={c.id}><button type="button" className={`direct-chat__person${chat.selectedId === c.id ? ' is-selected' : ''}`} onClick={() => select(c)} aria-current={chat.selectedId === c.id ? 'true' : undefined}>
              <span className="direct-chat__avatar" aria-hidden="true">{c.peer.name.slice(0, 1)}</span>
              <span><strong>{c.peer.name}</strong><small>{chatRoleLabel(c.peer.role)}{!c.peer.available ? ' · Không khả dụng' : ''}</small>
                {c.lastMessage && <small className={`direct-chat__preview${c.unreadCount ? ' is-unread' : ''}`}>{c.lastMessageMine ? 'Bạn: ' : ''}{c.lastMessage}</small>}</span>
              <span className="direct-chat__meta"><time dateTime={c.lastActivityAt}>{formatCenterDate(c.lastActivityAt)}</time>
                {!!c.unreadCount && <span className="direct-chat__unread" aria-label={`${c.unreadCount} tin chưa đọc`}>{c.unreadCount > 99 ? '99+' : c.unreadCount}</span>}</span>
            </button></li>)}</ul>}
        {!loading && totalPages > 1 && <nav className="direct-chat__pagination" aria-label="Trang hội thoại">
          <button type="button" className="direct-chat__link" disabled={page === 0} onClick={() => void loadInbox(page - 1)}>Trước</button><span>{page + 1}/{totalPages}</span>
          <button type="button" className="direct-chat__link" disabled={page + 1 >= totalPages} onClick={() => void loadInbox(page + 1)}>Sau</button>
        </nav>}
      </aside>
      {selected ? <ChatThread key={selected.id} conversation={selected} chat={chat} active={mobileThread} canMarkRead={visible && mobileThread} onRead={onRead} onBack={() => { setMobileThread(false); requestAnimationFrame(() => listTitle.current?.focus({ preventScroll: true })); }} />
        : <section className="direct-chat__placeholder"><h2>Chọn một cuộc trò chuyện</h2><p>Tin nhắn riêng của bạn được lưu tại đây.</p></section>}
    </div>
  </div>;
}
