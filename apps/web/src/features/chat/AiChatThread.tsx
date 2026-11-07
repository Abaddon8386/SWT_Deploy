import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { chatError, type ChatError } from './chatMessages';
import { formatCenterDateTime } from '../../shared/lib/centerTime';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { createAiChatSession, getAiChatHistory, listAiChatSessions, sendAiChatMessage, type AiChatMessage } from './aiChatApi';
import { AI_PEER, formatAiText } from './aiPeer';
import { ChatAvatar } from './ChatAvatar';
import { ChatComposer } from './ChatComposer';
import { useI18n } from '../../shared/i18n';

/** Lỗi mà máy chủ đã hoàn tác tin của người dùng: giữ lại nội dung để gửi lại. */
const ROLLED_BACK = ['AI_CHAT_NOT_CONFIGURED', 'AI_CHAT_UNAVAILABLE'];
const errorText = (cause: unknown) => chatError(cause, 'Không thể kết nối trợ lý AI. Vui lòng thử lại.', 'Unable to connect to the AI assistant. Please try again.');

/**
 * Hội thoại với SÖL AI trong cùng khung Tin nhắn: SÖL AI xuất hiện như một người trong danh sách.
 * Dùng phiên AI gần nhất; “Cuộc trò chuyện mới” mở phiên khác.
 */
export function AiChatThread({ onBack, active = true }: { onBack: () => void; active?: boolean }) {
  const { t } = useI18n();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ message: ChatError; reload?: boolean } | null>(null);
  const [sendError, setSendError] = useState<ChatError | null>(null);
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
    } catch (cause) { if (alive.current) setError({ message: errorText(cause) }); }
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
    } catch (cause) { if (alive.current) setError({ message: errorText(cause) }); }
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
      else setError({ message: errorText(cause), reload: true });
    } finally {
      busy.current = false;
      if (alive.current) setSending(false);
    }
  }

  return <section data-i18n-managed className="direct-chat__thread direct-chat__thread--ai" aria-labelledby="chat-thread-title">
    <header className="direct-chat__thread-header">
      <button type="button" data-i18n-managed className="direct-chat__back direct-chat__link" onClick={onBack} aria-label={t('Quay lại danh sách', 'Back to conversations')} title={t('Quay lại danh sách', 'Back to conversations')}>
        <svg className="direct-chat__back-chevron" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span className="direct-chat__back-label">{t('Danh sách', 'Conversations')}</span>
      </button>
      <div className="direct-chat__thread-peer">
        <ChatAvatar contact={AI_PEER} className="direct-chat__thread-avatar" />
        <div className="direct-chat__thread-meta">
          <h2 id="chat-thread-title" data-i18n-managed data-thread-title tabIndex={-1} ref={title}>{AI_PEER.name}</h2>
          <p>{t("Trợ lý AI · trả lời tự động", "AI assistant · automated replies")}</p>
        </div>
      </div>
      <button type="button" data-i18n-managed className="direct-chat__thread-action" aria-label={t('Cuộc trò chuyện mới với SÖL AI', 'New conversation with SÖL AI')} title={t('Cuộc trò chuyện mới', 'New conversation')}
        disabled={loading || sending} aria-busy={loading || undefined} onClick={() => void newSession()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
    </header>
    {error && <div role="alert" className="direct-chat__error"><p>{t(error.message)}{error.reload && <> {t('Hãy tải lại hội thoại để xem kết quả.', 'Reload the conversation to see the result.')}</>}</p><button type="button" className="direct-chat__link" disabled={loading} onClick={() => void load(sessionId)}>{t("Tải lại hội thoại", "Reload conversation")}</button></div>}
    <div className="direct-chat__transcript" ref={scroll} role="region" aria-label={t("Lịch sử trò chuyện với SÖL AI", "SÖL AI conversation history")} tabIndex={0} aria-busy={loading || sending}>
      {loading ? <LoadingSkeleton label={t("Đang tải hội thoại với SÖL AI…", "Loading SÖL AI conversation…")} count={3} />
        : messages.length === 0 && !pending && !error
          ? <div className="direct-chat__empty direct-chat__ai-intro"><ChatAvatar contact={AI_PEER} /><p><strong>SÖL AI</strong>{t(' trả lời về gói tập, lịch lớp, huấn luyện viên và tập luyện dựa trên dữ liệu của trung tâm.', ' answers questions about memberships, classes, coaches and training using center data.')}</p></div>
          : null}
      {!loading && <ol className="direct-chat__messages">
        {messages.map(message => {
          const mine = message.sender === 'member';
          return <li key={message.id} className={mine ? 'is-mine' : undefined}>
            <div className="direct-chat__bubble">
              <span data-i18n-managed className="direct-chat__sender">{mine ? t('Bạn', 'You') : AI_PEER.name}</span>
              <p data-i18n-managed>{mine ? message.message : formatAiText(message.message)}</p>
              <time dateTime={message.createdAt}>{formatCenterDateTime(message.createdAt)}</time>
            </div>
          </li>;
        })}
        {pending && <li className="is-mine"><div className="direct-chat__bubble is-pending"><span className="direct-chat__sender">{t("Bạn", "You")}</span><p data-i18n-managed>{pending}</p></div></li>}
        {sending && pending && <li><div className="direct-chat__bubble direct-chat__typing" role="status" aria-label={t("SÖL AI đang trả lời", "SÖL AI is replying")}><span /><span /><span /></div></li>}
      </ol>}
    </div>
    <ChatComposer id="chat-ai-message" label={t('Câu hỏi cho SÖL AI', 'Question for SÖL AI')} value={draft} onChange={text => { setDraft(text); setSendError(null); }}
      onSubmit={() => void send()} disabled={loading || sending} sending={sending} failed={!!sendError} error={sendError ? t(sendError) : null}
      placeholder={t('Hỏi SÖL AI về tập luyện…', 'Ask SÖL AI about training…')} />
  </section>;
}
