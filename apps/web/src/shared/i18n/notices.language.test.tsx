import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { clearNotices, getNotices, notify, usePortalNotices } from '../lib/portalNotices';
import { ApiError } from '../api/client';
import { sourceMessage, setLanguage, useI18n } from './language';
import { localizableError } from '../lib/errorMessage';
function Notices() { const notices = usePortalNotices(); const { t } = useI18n(); return <>{notices.map(n => <p key={n.id}>{n.translation ? t(n.translation) : n.message}</p>)}</>; }
afterEach(() => { clearNotices(); setLanguage('vi'); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('updates already-visible source notices/toasts, preserving untagged API content and stored message strings', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers(); setLanguage('vi');
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<Notices />));
    await act(async () => notify('Gói tập', 'success', { record: true, translation: sourceMessage('Gói tập') }));
    const stored = getNotices()[0].message;
    await act(async () => notify('Gói tập', 'info', { record: true }));
    await act(async () => setLanguage('en'));
    expect(host.textContent).toBe('Gói tậpMemberships');
    expect(document.querySelector('.sol-toast__message')?.textContent).toBe('Memberships');
    expect(document.querySelector('.sol-toast__close')?.getAttribute('aria-label')).toBe('Close notification');
    expect(getNotices().find(n => n.translation)?.message).toBe(stored);
    await act(async () => setLanguage('vi'));
    expect(host.textContent).toBe('Gói tậpGói tập');
    expect(document.querySelector('.sol-toast__message')?.textContent).toBe('Gói tập');
  } finally { await act(async () => root.unmount()); host.remove(); vi.runAllTimers(); }
});
it('marks only source-owned fallback errors as translatable', () => {
  const apiError = new ApiError('Gói tập', 400);
  expect(localizableError(apiError, 'Thử lại')).toBe(apiError);
  expect(localizableError(new TypeError('implementation detail'), 'Thử lại')).toBe('Thử lại');
});
