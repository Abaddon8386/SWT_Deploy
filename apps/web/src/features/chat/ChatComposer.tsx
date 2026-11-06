import { useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../../shared/i18n';

/** Bàn phím vật lý: Enter gửi, Shift + Enter xuống dòng. Màn hình cảm ứng giữ Enter để xuống dòng. */
const enterSends = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;
const QUICK_EMOJIS = ['❤️', '😂', '😍', '🔥', '🙌', '👏', '👍', '💪'];
const MAX_HEIGHT_PX = 96;

/**
 * Thanh soạn tin dùng chung cho hội thoại người–người và hội thoại với SÖL AI.
 * Bố cục cố định [emoji][ô nhập][Gửi]: không ẩn/hiện thành phần khi gõ để ô nhập không đổi bề rộng.
 */
export function ChatComposer({ id, label, value, onChange, onSubmit, disabled = false, sending = false, failed = false, error, placeholder, maxLength = 2000, notice }: {
  id: string; label: string; value: string; onChange: (text: string) => void; onSubmit: () => void;
  disabled?: boolean; sending?: boolean; failed?: boolean; error?: string | null; placeholder?: string; maxLength?: number; notice?: string;
}) {
  const { t } = useI18n();
  const [quickSend] = useState(enterSends);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const canSend = !disabled && !sending && value.trim().length > 0;

  // Ô nhập tự giãn theo nội dung tới tối đa ~4 dòng rồi cuộn bên trong.
  useLayoutEffect(() => {
    const node = input.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  function submit() {
    setEmojiOpen(false);
    if (canSend) onSubmit();
  }
  function insert(emoji: string) {
    onChange(`${value}${emoji}`);
    setEmojiOpen(false);
    input.current?.focus();
  }

  const errorId = `${id}-error`, hintId = `${id}-hint`;
  return <form data-i18n-managed className="direct-chat__compose" onSubmit={event => { event.preventDefault(); submit(); }}>
    <label htmlFor={id} className="direct-chat__sr">{label}</label>
    {notice && <p className="direct-chat__muted">{notice}</p>}
    {emojiOpen && !disabled && <div className="direct-chat__emoji-bar" role="group" id={`${id}-emojis`} aria-label={t('Biểu tượng cảm xúc', 'Emoji')}>
      {QUICK_EMOJIS.map(emoji => <button key={emoji} type="button" className="direct-chat__emoji-item" aria-label={`${t('Chèn', 'Insert')} ${emoji}`} title={`${t('Chèn', 'Insert')} ${emoji}`} onClick={() => insert(emoji)}>{emoji}</button>)}
    </div>}
    <div className="direct-chat__compose-pill">
      <button type="button" className="direct-chat__composer-icon" aria-label={t('Chọn biểu tượng cảm xúc', 'Choose emoji')} title={t('Chọn biểu tượng cảm xúc', 'Choose emoji')} aria-expanded={emojiOpen} aria-controls={`${id}-emojis`} disabled={disabled} onClick={() => setEmojiOpen(open => !open)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2.5" />
          <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2.5" />
        </svg>
      </button>
      <textarea ref={input} id={id} className="direct-chat__input" value={value} maxLength={maxLength} rows={1}
        disabled={disabled} onChange={event => onChange(event.target.value)} placeholder={placeholder ?? t('Nhắn tin...', 'Message...')}
        aria-describedby={error ? errorId : hintId}
        onKeyDown={event => {
          if (event.key === 'Escape' && emojiOpen) { event.stopPropagation(); setEmojiOpen(false); return; }
          if (event.key === 'Enter' && !event.nativeEvent.isComposing && (event.ctrlKey || event.metaKey || (quickSend && !event.shiftKey))) {
            event.preventDefault(); submit();
          }
        }} />
      {/* Nhãn ngắn và bề rộng cố định để nút không đẩy ô nhập; trạng thái đang gửi đọc qua aria-busy/chữ ẩn. */}
      <button type="submit" className="direct-chat__send-btn" disabled={!canSend} aria-busy={sending || undefined} title={sending ? t('Đang gửi…', 'Sending…') : failed ? t('Gửi lại', 'Retry') : t('Gửi', 'Send')}>
        {sending && <span className="direct-chat__sending-dot" aria-hidden="true" />}
        {failed && !sending ? t('Gửi lại', 'Retry') : t('Gửi', 'Send')}{sending && <span className="direct-chat__sr"> {t('(đang gửi…)', '(sending…)')}</span>}
      </button>
    </div>
    {error && <p id={errorId} role="alert" className="direct-chat__error">{error}</p>}
    <span id={hintId} className="direct-chat__sr">{value.length}/{maxLength} · {quickSend ? t('Enter để gửi, Shift + Enter xuống dòng', 'Enter to send, Shift + Enter for a new line') : t('Ctrl + Enter để gửi', 'Ctrl + Enter to send')}</span>
  </form>;
}
