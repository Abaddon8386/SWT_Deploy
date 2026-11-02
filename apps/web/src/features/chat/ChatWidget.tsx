import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCurrentUser } from '../../shared/api/client';
import { ChatPage } from './ChatPage';
import './chat-widget.css';

export function ChatWidget() {
  const user = getCurrentUser();
  const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const allowed = !user || ['MEMBER', 'STAFF', 'COACH'].includes(user.role);

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

  if (!allowed) return null;
  return <div className="chat-widget">
    <button ref={trigger} type="button" className="chat-widget__trigger" aria-label={open ? 'Đóng tin nhắn' : 'Mở tin nhắn'} aria-haspopup="dialog" aria-expanded={open} aria-controls="sol-direct-chat" onClick={() => { setVisited(true); setOpen(value => !value); }}>
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9 9 0 0 1 18 0Z" /><path d="M7 10h8M7 14h5" /></svg>
      <span>Tin nhắn</span>
    </button>
    {visited && <section ref={panel} id="sol-direct-chat" className="chat-widget__panel" role="dialog" aria-label="Tin nhắn SÖL" hidden={!open}>
      <header className="chat-widget__header"><div><strong>SÖL · Tin nhắn</strong><p>Trao đổi trực tiếp tại câu lạc bộ</p></div>
        <button ref={closeButton} type="button" className="chat-widget__close" aria-label="Đóng cửa sổ tin nhắn" onClick={() => { setOpen(false); trigger.current?.focus(); }}>×</button>
      </header>
      {user ? <ChatPage embedded /> : <div className="chat-widget__login"><p>Đăng nhập để trao đổi riêng với lễ tân và huấn luyện viên.</p><Link to="/login" className="btn-primary">Đăng nhập để nhắn tin</Link></div>}
    </section>}
  </div>;
}
