import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentUser } from '../../shared/api/client';
import { errorMessage } from '../../shared/lib/errorMessage';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { formatCenterDate } from '../../shared/lib/centerTime';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import { chatRoleLabel, getConversations, openConversation, type ChatContact, type ChatConversation } from './chatApi';
import { subscribeChat, type ChatConnection } from './chatRealtime';
import { useChatConversation } from './useChatConversation';
import { ChatAvatar } from './ChatAvatar';
import { ChatContacts } from './ChatContacts';
import { ChatThread } from './ChatThread';
import { AiChatThread } from './AiChatThread';
import { AI_PEER } from './aiPeer';
import { useI18n } from '../../shared/i18n';
import './chat.css';

const connectionLabel: Record<ChatConnection, [string, string]> = {
  connecting: ['Đang kết nối cập nhật tin nhắn…', 'Connecting to message updates…'], connected: ['Cập nhật tin nhắn trực tiếp', 'Live message updates'],
  reconnecting: ['Mất kết nối trực tiếp · đang thử lại', 'Live connection lost · reconnecting'], disabled: ['Cập nhật trực tiếp chưa được cấu hình', 'Live updates are not configured'],
};

function formatRelativeChatTime(iso: string, t: (vi: string, en: string) => string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return formatCenterDate(iso);
  const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (diffSec < 60) return t('Vừa xong', 'Just now');
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t(`${diffMin} phút`, `${diffMin} min`);
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return t(`${diffHour} giờ`, `${diffHour} hr`);
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return t(`${diffDay} ngày`, `${diffDay} days`);
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 52) return t(`${diffWeek} tuần`, `${diffWeek} weeks`);
  return formatCenterDate(iso);
}

/** Khi nhúng trong widget, widget giữ kết nối realtime và truyền xuống để không mở hai kết nối. */
export interface ChatRealtimeFeed { connection: ChatConnection; tick: number; reconnect: () => void }

export function ChatPage({ embedded = false, visible = true, realtime, onPeersChange }: { embedded?: boolean; visible?: boolean; realtime?: ChatRealtimeFeed; onPeersChange?: (peers: ChatContact[]) => void }) {
  const { t } = useI18n();
  const user = getCurrentUser();
  if (!user || !['MEMBER', 'STAFF', 'COACH'].includes(user.role))
    return <div data-i18n-managed className="portal-container"><h1 className="portal-title">{t("Tin nhắn", "Messages")}</h1><p role="alert">{t("Bạn không có quyền truy cập chat riêng.", "You do not have access to private chat.")}</p></div>;
  return <ChatWorkspace member={user.role === 'MEMBER'} embedded={embedded} visible={visible} realtime={realtime} onPeersChange={onPeersChange} />;
}

function ChatWorkspace({ member, embedded, visible, realtime, onPeersChange }: { member: boolean; embedded: boolean; visible: boolean; realtime?: ChatRealtimeFeed; onPeersChange?: (peers: ChatContact[]) => void }) {
  const { t } = useI18n();
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
  const [aiOpen, setAiOpen] = useState(false);
  const pageRef = useRef(0), listSequence = useRef(0), opening = useRef(false), mounted = useRef(true);
  const onPeersRef = useRef(onPeersChange);
  const listTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => { onPeersRef.current = onPeersChange; }, [onPeersChange]);

  const loadInbox = useCallback(async (nextPage: number, background = false) => {
    const request = ++listSequence.current;
    if (!background) setLoading(true);
    try {
      const data = await getConversations(nextPage);
      if (!mounted.current || request !== listSequence.current) return;
      setConversations(data.content); setPage(nextPage); pageRef.current = nextPage; setTotalPages(data.totalPages); setListError(null);
      if (nextPage === 0) onPeersRef.current?.(data.content.slice(0, 3).map(c => c.peer));
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
    setAiOpen(false); setSelected(conversation); chat.select(conversation.id); setMobileThread(true);
  }
  function selectAi() {
    setAiOpen(true); setMobileThread(true);
  }
  const backToList = () => { setMobileThread(false); requestAnimationFrame(() => listTitle.current?.focus({ preventScroll: true })); };
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

  return <div data-i18n-managed className={`portal-container direct-chat${mobileThread ? ' direct-chat--thread-open' : ''}`}>
    {/* Trong widget, tiêu đề, trạng thái kết nối và nút làm mới nằm ở header của widget. */}
    {!embedded && <header className="portal-header"><div><p className="portal-eyebrow">{t("Kết nối tại SÖL", "Connect at SÖL")}</p><h1 className="portal-title">{t("Tin nhắn", "Messages")}</h1></div>
      <div className="direct-chat__connection"><span role="status" className={`direct-chat__connection-label is-${connection}`}>{t(...connectionLabel[connection])}</span>
        {connection === 'reconnecting' && <button type="button" className="direct-chat__link" onClick={() => setConnectionAttempt(n => n + 1)}>{t("Thử kết nối lại", "Reconnect")}</button>}
        <RefreshButton label={t("Làm mới tin nhắn", "Refresh messages")} onClick={() => { void loadInbox(pageRef.current); void refresh(); }} disabled={loading} /></div>
    </header>}
    <div className="direct-chat__workspace">
      <aside className="direct-chat__inbox" aria-labelledby="chat-inbox-title">
        <div className="direct-chat__inbox-heading">
          <h2 id="chat-inbox-title" tabIndex={-1} ref={listTitle}>{t("Hội thoại của bạn", "Your conversations")}</h2>
          {member && (
            <button
              type="button"
              data-i18n-managed
              className={`direct-chat__link direct-chat__compose-fab${showContacts ? ' is-active' : ''}`}
              aria-expanded={showContacts}
              aria-controls="chat-directory"
              title={showContacts ? t('Đóng danh bạ', 'Close contacts') : t('Cuộc trò chuyện mới', 'New conversation')}
              aria-label={showContacts ? t('Đóng danh bạ', 'Close contacts') : t('Cuộc trò chuyện mới', 'New conversation')}
              onClick={() => setShowContacts(v => !v)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span className="direct-chat__compose-fab-label">{showContacts ? t('Đóng danh bạ', 'Close contacts') : t('Cuộc trò chuyện mới', 'New conversation')}</span>
            </button>
          )}
        </div>
        {showContacts && <div id="chat-directory">{openError && <p role="alert" className="direct-chat__error">{openError}</p>}<ChatContacts onChoose={contact => void choose(contact)} pending={pending} /></div>}
        {listError && <div role="alert" className="direct-chat__error"><p>{listError}</p><button type="button" className="direct-chat__link" onClick={() => void loadInbox(page)}>{t("Thử lại", "Retry")}</button></div>}
        {loading && <LoadingSkeleton label={t("Đang tải hội thoại…", "Loading conversations…")} count={4} />}
        {/* SÖL AI luôn ghim đầu danh sách như một người để trò chuyện, không còn nút AI riêng. */}
        {!loading && <ul className="direct-chat__list">
          <li><button type="button" className={`direct-chat__person direct-chat__person--ai${aiOpen ? ' is-selected' : ''}`} onClick={selectAi} aria-current={aiOpen ? 'true' : undefined}>
            <ChatAvatar contact={AI_PEER} />
            <span className="direct-chat__person-info">
              <strong>{AI_PEER.name}</strong>
              <span className="direct-chat__person-sub"><small className="direct-chat__preview">{t("Trợ lý AI · Hỏi về gói tập, lịch lớp, tập luyện", "AI assistant · Ask about memberships, classes and training")}</small></span>
            </span>
          </button></li>
          {conversations.map(c => <li key={c.id}><button type="button" className={`direct-chat__person${!aiOpen && chat.selectedId === c.id ? ' is-selected' : ''}${c.unreadCount ? ' has-unread' : ''}`} onClick={() => select(c)} aria-current={!aiOpen && chat.selectedId === c.id ? 'true' : undefined}>
              <ChatAvatar contact={c.peer} />
              <span className="direct-chat__person-info">
                <strong data-i18n-managed>{c.peer.name}</strong>
                <small className="direct-chat__role">{chatRoleLabel(c.peer.role, t)}{!c.peer.available ? t(' · Không khả dụng', ' · Unavailable') : ''}</small>
                <span className="direct-chat__person-sub">
                  {c.lastMessage && <small data-i18n-managed className={`direct-chat__preview${c.unreadCount ? ' is-unread' : ''}`}>{c.lastMessageMine ? t('Bạn: ', 'You: ') : ''}{c.lastMessage}</small>}
                  {c.lastMessage && <span className="direct-chat__dot" aria-hidden="true">·</span>}
                  <time dateTime={c.lastActivityAt}>{formatRelativeChatTime(c.lastActivityAt, t)}</time>
                </span>
              </span>
              <span className="direct-chat__meta">
                {!!c.unreadCount && <span className="direct-chat__unread" aria-label={t(`${c.unreadCount} tin chưa đọc`, `${c.unreadCount} unread messages`)}>{c.unreadCount > 99 ? '99+' : c.unreadCount}</span>}
                <span className="direct-chat__more" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="1.8" />
                    <circle cx="12" cy="12" r="1.8" />
                    <circle cx="19" cy="12" r="1.8" />
                  </svg>
                </span>
              </span>
            </button></li>)}</ul>}
        {!loading && conversations.length === 0 && !listError && <p className="direct-chat__empty direct-chat__empty--inbox">{member ? t('Chưa có hội thoại với lễ tân hoặc huấn luyện viên. Chọn “Cuộc trò chuyện mới” để bắt đầu.', 'No conversations with receptionists or coaches yet. Choose “New conversation” to start.') : t('Chưa có hội thoại. Tin nhắn của hội viên gửi cho bạn sẽ xuất hiện tại đây.', 'No conversations yet. Messages from members will appear here.')}</p>}
        {!loading && totalPages > 1 && <nav className="direct-chat__pagination" aria-label={t("Trang hội thoại", "Conversation pages")}>
          <button type="button" className="direct-chat__link" disabled={page === 0} onClick={() => void loadInbox(page - 1)}>{t("Trước", "Previous")}</button><span>{page + 1}/{totalPages}</span>
          <button type="button" className="direct-chat__link" disabled={page + 1 >= totalPages} onClick={() => void loadInbox(page + 1)}>{t("Sau", "Next")}</button>
        </nav>}
      </aside>
      {aiOpen ? <AiChatThread active={mobileThread} onBack={backToList} />
        : selected ? <ChatThread key={selected.id} conversation={selected} chat={chat} active={mobileThread} canMarkRead={visible && mobileThread} onRead={onRead} onBack={backToList} />
        : <section className="direct-chat__placeholder"><h2>{t("Chọn một cuộc trò chuyện", "Choose a conversation")}</h2><p>{t("Tin nhắn riêng của bạn được lưu tại đây.", "Your private messages are saved here.")}</p></section>}
    </div>
  </div>;
}
