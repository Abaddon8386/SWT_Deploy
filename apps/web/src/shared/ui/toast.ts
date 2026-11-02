// Thông báo popup chính giữa màn hình kèm làm mờ nền xung quanh (dùng chung style .sol-toast trong styles.css).
let activeToastTimer: number | null = null;

export function toast(message: string, type: 'success' | 'error' = 'success') {
  if (activeToastTimer !== null) {
    window.clearTimeout(activeToastTimer);
    activeToastTimer = null;
  }
  document.querySelectorAll('.sol-toast').forEach((t) => t.remove());

  const el = document.createElement('div');
  el.className = `sol-toast sol-toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  el.style.zIndex = '2147483647';

  const dismiss = () => {
    if (activeToastTimer !== null) {
      window.clearTimeout(activeToastTimer);
      activeToastTimer = null;
    }
    el.remove();
  };

  const card = document.createElement('div');
  card.className = 'sol-toast__card';
  card.addEventListener('click', (event) => event.stopPropagation());

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'sol-toast__close';
  closeBtn.setAttribute('aria-label', 'Đóng thông báo');
  closeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  closeBtn.addEventListener('click', dismiss);

  const icon = document.createElement('span');
  icon.className = 'sol-toast__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML =
    type === 'error'
      ? `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
      : `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

  const eyebrow = document.createElement('div');
  eyebrow.className = 'sol-toast__eyebrow';
  eyebrow.setAttribute('aria-hidden', 'true');

  const body = document.createElement('p');
  body.className = 'sol-toast__message';
  body.textContent = message;

  const actionBtn = document.createElement('button');
  actionBtn.type = 'button';
  actionBtn.className = 'sol-toast__action';
  actionBtn.setAttribute('aria-label', 'Đóng');
  actionBtn.addEventListener('click', dismiss);

  card.append(closeBtn, icon, eyebrow, body, actionBtn);
  el.append(card);
  el.addEventListener('click', dismiss);

  // Nếu đang mở <dialog> (HTML5 Top Layer), gắn toast vào bên trong dialog để không bị lớp backdrop che mờ
  const activeDialog = document.querySelector<HTMLDialogElement>('dialog[open]');
  if (activeDialog) {
    activeDialog.append(el);
  } else {
    document.body.append(el);
  }

  activeToastTimer = window.setTimeout(dismiss, type === 'error' ? 5000 : 3200);
}

toast.success = (message: string) => toast(message, 'success');
toast.error = (message: string) => toast(message, 'error');
