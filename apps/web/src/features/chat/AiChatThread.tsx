import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { errorMessage } from '../../shared/lib/errorMessage';
import { formatCenterDateTime } from '../../shared/lib/centerTime';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { createAiChatSession, getAiChatHistory, listAiChatSessions, sendAiChatMessage, type AiChatMessage } from './aiChatApi';
import { AI_PEER, formatAiText } from './aiPeer';
import { ChatAvatar } from './ChatAvatar';
import { ChatComposer } from './ChatComposer';

/** Lỗi mà máy chủ đã hoàn tác tin của người dùng: giữ lại nội dung để gửi lại. */
const ROLLED_BACK = ['AI_CHAT_NOT_CONFIGURED', 'AI_CHAT_UNAVAILABLE'];
const errorText = (cause: unknown) => errorMessage(cause, 'Không thể kết nối trợ lý AI. Vui lòng thử lại.');

/**
 * Hội thoại với SÖL AI trong cùng khung Tin nhắn: SÖL AI xuất hiện như một người trong danh sách.
 * Dùng phiên AI gần nhất; “Cuộc trò chuyện mới” mở phiên khác.
 */
export function AiChatThread({ onBack, active = true }: { onBack: () => void; active?: boolean }) {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const scroll = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (active) title.current?.focus({ preventScroll: true }); }, [active]);
  useLayoutEffect(() => {
    const node = scroll.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, pending, sending, loading]);

  const load = useCallback(async (id?: number | null) => {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError(null);
    try {
      const target = id ?? (await listAiChatSessions())[0]?.id ?? null;
      const history = target != null ? await getAiChatHistory(target) : [];
      if (!alive.current) return;
      setSessionId(target); setMessages(history); setPending(null);
    } catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { busy.current = false; if (alive.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function newSession() {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError(null); setSendError(null);
    try {
      const created = await createAiChatSession();
      if (!alive.current) return;
      setSessionId(created.id); setMessages([]); setPending(null); setDraft('');
    } catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { busy.current = false; if (alive.current) setLoading(false); }
  }

  async function send() {
    const text = draft.trim();
    if (!text || text.length > 2000 || busy.current) return;
    busy.current = true; setSending(true); setSendError(null); setError(null);
    let requested = false;
    try {
      let target = sessionId;
      if (target == null) {
        target = (await createAiChatSession()).id;
        if (!alive.current) return;
        setSessionId(target);
      }
      setPending(text); setDraft('');
      requested = true;
      const reply = await sendAiChatMessage(target, text);
      if (!alive.current) return;
      setMessages(previous => [...previous, reply.memberMessage, reply.aiMessage]);
      setPending(null);
    } catch (cause) {
      if (!alive.current) return;
      const rolledBack = !requested || (cause instanceof ApiError && ROLLED_BACK.includes(cause.code ?? ''));
      setPending(null);
      if (rolledBack) { setDraft(text); setSendError(errorText(cause)); }
      // Không rõ máy chủ đã lưu tin hay chưa: tải lại lịch sử thay vì đoán.
      else setError(`${errorText(cause)} Hãy tải lại hội thoại để xem kết quả.`);
    } finally {
      busy.current = false;
      if (alive.current) setSending(false);
    }
  }

  return <section className="direct-chat__thread direct-chat__thread--ai" aria-labelledby="chat-thread-title">
    <header className="direct-chat__thread-header">
      <button type="button" className="direct-chat__back direct-chat__link" onClick={onBack} aria-label="Quay lại danh sách">
        <svg className="direct-chat__back-chevron" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span className="direct-chat__back-label">Danh sách</span>
      </button>
      <div className="direct-chat__thread-peer">
        <ChatAvatar contact={AI_PEER} className="direct-chat__thread-avatar" />
        <div className="direct-chat__thread-meta">
          <h2 id="chat-thread-title" data-thread-title tabIndex={-1} ref={title}>{AI_PEER.name}</h2>
          <p>Trợ lý AI · trả lời tự động</p>
        </div>
      </div>
      <button type="button" className="direct-chat__thread-action" aria-label="Cuộc trò chuyện mới với SÖL AI" title="Cuộc trò chuyện mới"
        disabled={loading || sending} onClick={() => void newSession()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
    </header>
    {error && <div role="alert" className="direct-chat__error"><p>{error}</p><button type="button" className="direct-chat__link" disabled={loading} onClick={() => void load(sessionId)}>Tải lại hội thoại</button></div>}
    <div className="direct-chat__transcript" ref={scroll} role="region" aria-label="Lịch sử trò chuyện với SÖL AI" tabIndex={0} aria-busy={loading || sending}>
      {loading ? <LoadingSkeleton label="Đang tải hội thoại với SÖL AI…" count={3} />
        : messages.length === 0 && !pending && !error
          ? <div className="direct-chat__empty direct-chat__ai-intro"><ChatAvatar contact={AI_PEER} /><p><strong>SÖL AI</strong> trả lời về gói tập, lịch lớp, huấn luyện viên và tập luyện dựa trên dữ liệu của trung tâm.</p></div>
          : null}
      {!loading && <ol className="direct-chat__messages">
        {messages.map(message => {
          const mine = message.sender === 'member';
          return <li key={message.id} className={mine ? 'is-mine' : undefined}>
            <div className="direct-chat__bubble">
              <span className="direct-chat__sender">{mine ? 'Bạn' : AI_PEER.name}</span>
              <p>{mine ? message.message : formatAiText(message.message)}</p>
              <time dateTime={message.createdAt}>{formatCenterDateTime(message.createdAt)}</time>
            </div>
          </li>;
        })}
        {pending && <li className="is-mine"><div className="direct-chat__bubble is-pending"><span className="direct-chat__sender">Bạn</span><p>{pending}</p></div></li>}
        {sending && pending && <li><div className="direct-chat__bubble direct-chat__typing" role="status" aria-label="SÖL AI đang trả lời"><span /><span /><span /></div></li>}
      </ol>}
    </div>
    <ChatComposer id="chat-ai-message" label="Câu hỏi cho SÖL AI" value={draft} onChange={text => { setDraft(text); setSendError(null); }}
      onSubmit={() => void send()} disabled={loading} sending={sending} failed={!!sendError} error={sendError}
      placeholder="Hỏi SÖL AI về tập luyện…" />
  </section>;
}
