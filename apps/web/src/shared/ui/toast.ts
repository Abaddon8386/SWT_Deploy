import { getLanguage, subscribeLanguage, type SourceMessage } from '../i18n/language';
// Toast ngắn ở góc màn hình: không phủ nền, không chặn thao tác; dùng chung style .sol-toast trong styles.css.
let activeToastTimer: number | null = null;
let unsubscribeLanguage: (() => void) | null = null;
let removeEscape: (() => void) | null = null;

function clearActive() {
  if (activeToastTimer !== null) {
    window.clearTimeout(activeToastTimer);
    activeToastTimer = null;
  }
  unsubscribeLanguage?.();
  unsubscribeLanguage = null;
  removeEscape?.();
  removeEscape = null;
  document.querySelectorAll('.sol-toast').forEach((t) => t.remove());
}

export function toast(message: string, type: 'success' | 'error' = 'success', translation?: SourceMessage) {
  clearActive();

  const el = document.createElement('div');
  if (translation) el.setAttribute('data-i18n-managed', '');
  el.className = `sol-toast sol-toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

  const card = document.createElement('div');
  card.className = 'sol-toast__card';

  const icon = document.createElement('span');
  icon.className = 'sol-toast__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML =
    type === 'error'
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

  const body = document.createElement('p');
  body.className = 'sol-toast__message';
  body.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'sol-toast__close';
  const renderLanguage = () => {
    const english = getLanguage() === 'en';
    if (translation) body.textContent = english ? translation.en : translation.vi;
    closeBtn.setAttribute('aria-label', english ? 'Close notification' : 'Đóng thông báo');
  };
  renderLanguage();
  unsubscribeLanguage = subscribeLanguage(renderLanguage);
  closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  closeBtn.addEventListener('click', clearActive);

  card.append(icon, body, closeBtn);
  el.append(card);

  // Esc đóng toast, nhưng nhường cho hộp thoại đang mở (Esc của hộp thoại vẫn chạy như cũ).
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) clearActive();
  };
  document.addEventListener('keydown', onKey);
  removeEscape = () => document.removeEventListener('keydown', onKey);

  // Nếu đang mở <dialog> (HTML5 Top Layer), gắn toast vào bên trong dialog để không bị lớp backdrop che.
  const activeDialog = document.querySelector<HTMLDialogElement>('dialog[open]');
  (activeDialog ?? document.body).append(el);

  // Giữ toast khi người dùng đang trỏ vào để kịp đọc.
  const schedule = () => { activeToastTimer = window.setTimeout(clearActive, type === 'error' ? 6000 : 3200); };
  card.addEventListener('pointerenter', () => { if (activeToastTimer !== null) window.clearTimeout(activeToastTimer); activeToastTimer = null; });
  card.addEventListener('pointerleave', schedule);
  schedule();
}

toast.success = (message: string, translation?: SourceMessage) => toast(message, 'success', translation);
toast.error = (message: string, translation?: SourceMessage) => toast(message, 'error', translation);
