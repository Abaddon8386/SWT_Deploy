import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { formatCenterTime } from '../lib/centerTime';
import { announceFloatingPanel, useCloseWhenOtherPanelOpens } from '../lib/floatingPanels';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { LiquidGlassContainer } from './LiquidGlassContainer';
import { LiquidGlassButton } from './LiquidGlassButton';
import { createAiChatSession, getAiChatHistory, listAiChatSessions, sendAiChatMessage, type AiChatMessage, type AiChatSession } from './aiChatApi';
import './liquid-glass.css';

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    if (error.status === 0) return 'Kết nối bị gián đoạn. Hãy tải lại hội thoại để kiểm tra kết quả.';
    if (error.status === 403) return 'Bạn không có quyền truy cập phiên chat này.';
    return error.message;
  }
  return 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.';
}

function formatChatText(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\r?\n?/g, '').trim())
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*[*+-][ \t]+/gm, '• ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function LiquidGlassChatbot() {
  const [open, setOpen] = useState(false);
  useCloseWhenOtherPanelOpens('ai', () => setOpen(false));
  const [sessions, setSessions] = useState<AiChatSession[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'sending' | 'typing'>('idle');
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [pending, setPending] = useState<{ text: string; knownIds: number[] } | null>(null);
  const [needsSync, setNeedsSync] = useState(false);
  const [typed, setTyped] = useState(0);
  const busy = useRef(false);
  const alive = useRef(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView?.({ behavior: 'auto', block: 'nearest' });
  }, [messages, open, phase]);

  useEffect(() => {
    if (phase !== 'typing') return;
    const text = formatChatText(messages[messages.length - 1]?.message ?? '');
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const done = window.setTimeout(() => { setTyped(text.length); setPhase('idle'); busy.current = false; }, 0);
      return () => window.clearTimeout(done);
    }
    let count = 0;
    const timer = window.setInterval(() => {
      count = Math.min(text.length, count + Math.max(1, Math.ceil(text.length / 50)));
      setTyped(count);
      if (count >= text.length) { window.clearInterval(timer); setPhase('idle'); busy.current = false; }
    }, 25);
    return () => window.clearInterval(timer);
  }, [phase, messages]);

  async function loadSessions() {
    if (busy.current) return;
    busy.current = true; setPhase('loading'); setError('');
    try {
      const list = await listAiChatSessions();
      const latest = list[0];
      const history = latest ? await getAiChatHistory(latest.id) : [];
      if (!alive.current) return;
      setSessions(list); setSessionId(latest?.id ?? null); setMessages(history); setInitialized(true);
    } catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { busy.current = false; if (alive.current) setPhase('idle'); }
  }

  async function selectSession(id: number) {
    if (busy.current) return;
    busy.current = true; setPhase('loading'); setError('');
    try {
      const history = await getAiChatHistory(id);
      if (!alive.current) return;
      setSessionId(id); setMessages(history); setPending(null); setInput(''); setNeedsSync(false);
    } catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { busy.current = false; if (alive.current) setPhase('idle'); }
  }

  async function newChat() {
    if (busy.current) return;
    busy.current = true; setPhase('loading'); setError('');
    try {
      const created = await createAiChatSession();
      if (!alive.current) return;
      setSessions((previous) => [created, ...previous]); setSessionId(created.id);
      setMessages([]); setPending(null); setInput(''); setNeedsSync(false); setInitialized(true);
    } catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { busy.current = false; if (alive.current) setPhase('idle'); }
  }

  async function syncHistory() {
    if (busy.current || sessionId == null) return;
    busy.current = true; setPhase('loading'); setError('');
    try {
      const history = await getAiChatHistory(sessionId);
      if (!alive.current) return;
      setMessages(history);
      const saved = pending ? history.findIndex((message) => !pending.knownIds.includes(message.id) && message.sender === 'member' && message.message === pending.text) : -1;
      if (!pending || (saved >= 0 && history.slice(saved + 1).some((message) => message.sender === 'ai'))) {
        setPending(null); setNeedsSync(false);
      } else setError('Chưa xác nhận được kết quả. Bạn có thể tải lại hội thoại hoặc tạo chat mới.');
    } catch (cause) { if (alive.current) setError(errorText(cause)); }
    finally { busy.current = false; if (alive.current) setPhase('idle'); }
  }

  async function send() {
    const text = input.trim();
    if (!text || text.length > 2000 || !initialized || busy.current || needsSync) return;
    busy.current = true; setPhase('sending'); setError('');
    let messageRequested = false;
    try {
      let targetId = sessionId;
      if (targetId == null) {
        const created = await createAiChatSession();
        if (!alive.current) return;
        targetId = created.id;
        setSessions((previous) => [created, ...previous]); setSessionId(targetId);
      }
      setPending({ text, knownIds: messages.map((message) => message.id) }); setInput('');
      messageRequested = true;
      const result = await sendAiChatMessage(targetId, text);
      if (!alive.current) return;
      setMessages((previous) => [...previous, result.memberMessage, result.aiMessage]);
      setPending(null); setTyped(0); setPhase('typing');
    } catch (cause) {
      busy.current = false;
      if (!alive.current) return;
      setError(errorText(cause)); setPhase('idle');
      if (!messageRequested) { setInput(text); return; }
      const rolledBack = cause instanceof ApiError && ['AI_CHAT_NOT_CONFIGURED', 'AI_CHAT_UNAVAILABLE'].includes(cause.code ?? '');
      setNeedsSync(!rolledBack);
      if (rolledBack) setInput(text);
    }
  }

  const disabled = phase !== 'idle';
  return <div className="member-ai-chat">
    <div className="liquid-glass-chat-trigger">
      <LiquidGlassButton shape="circle" size={18} title={open ? 'Đóng trợ lý AI' : 'Mở trợ lý AI'} onClick={() => {
        if (!open) announceFloatingPanel('ai');
        setOpen(!open); if (!open && !initialized) void loadSessions();
      }} style={{ width: 56, height: 56 }}><span aria-hidden="true">✦ AI</span></LiquidGlassButton>
    </div>
    {open && <section className="liquid-glass-chat-window" aria-label="Trợ lý AI SÖL" onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>
      <LiquidGlassContainer shape="rounded" borderRadius={22} tintOpacity={0.28} className="liquid-glass-chat-container">
        <div className="liquid-glass-chat-header"><div><div className="liquid-glass-bot-name">SÖL AI</div><div className="liquid-glass-bot-status">Trợ lý tập luyện</div></div>
          <button type="button" className="suggestion-chip" disabled={disabled} onClick={() => void newChat()}>New Chat</button>
          <button type="button" className="liquid-glass-close-btn" aria-label="Đóng cửa sổ chat" onClick={() => setOpen(false)}>×</button>
        </div>
        {sessions.length > 0 && <label className="ai-chat-session-label">Phiên chat<select aria-label="Phiên chat" value={sessionId ?? ''} disabled={disabled} onChange={(event) => void selectSession(Number(event.target.value))}>{sessions.map((session) => <option key={session.id} value={session.id}>{session.topic} · #{session.id}</option>)}</select></label>}
        <div className="liquid-glass-chat-body" aria-label="Hội thoại">
          {initialized && messages.length === 0 && !pending && phase === 'idle' && <p className="ai-chat-empty">Bạn muốn trao đổi về điều gì?</p>}
          {messages.map((message, index) => { const cleanText = message.sender === 'ai' ? formatChatText(message.message) : message.message; return <div key={`${message.id}-${index}`} className={`chat-bubble-row ${message.sender === 'member' ? 'user-row' : 'bot-row'}`}><div className={`chat-bubble ${message.sender === 'member' ? 'user-bubble' : 'bot-bubble'}`}><div className="chat-bubble-text" style={{ whiteSpace: 'pre-wrap' }}>{phase === 'typing' && index === messages.length - 1 ? cleanText.slice(0, typed) : cleanText}</div><time className="chat-bubble-meta" dateTime={message.createdAt}>{formatCenterTime(message.createdAt)}</time></div></div>; })}
          {pending && <div className="chat-bubble-row user-row"><div className="chat-bubble user-bubble"><div className="chat-bubble-text">{pending.text}</div></div></div>}
          {phase === 'loading' && <LoadingSkeleton label="Đang tải hội thoại" count={2} />}
          {phase === 'sending' && <div className="chat-bubble bot-bubble typing-bubble" role="status" aria-label="AI đang trả lời"><span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" /></div>}
          {phase === 'typing' && <span className="ai-chat-empty" role="status">Đang hiển thị câu trả lời…</span>}
          <div ref={endRef} />
        </div>
        {error && <div className="ai-chat-error" role="alert">{error}<button type="button" disabled={disabled} onClick={() => void (initialized ? syncHistory() : loadSessions())}>Tải lại hội thoại</button></div>}
        <form className="liquid-glass-chat-input-bar" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <textarea className="liquid-glass-input" aria-label="Câu hỏi cho AI" placeholder="Hỏi về tập luyện…" rows={2} maxLength={2000} value={input} onChange={(event) => setInput(event.target.value)} disabled={disabled || !initialized || needsSync} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
          <button type="submit" className="liquid-glass-send-btn" aria-label="Gửi tin nhắn" disabled={disabled || !input.trim() || !initialized || needsSync}>→</button>
        </form>
      </LiquidGlassContainer>
    </section>}
  </div>;
}
