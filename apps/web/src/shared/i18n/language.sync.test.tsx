import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { getLanguage, setLanguage, useDomLanguageSync, useI18n } from './language';
import { Modal } from '../ui/Modal';
function Probe() { const { t } = useI18n(); useDomLanguageSync(); return <><span data-content>Active</span><span data-protected data-i18n-managed>Đóng</span><span data-fallback>{t('toString')}</span><Modal title={t('Gói tập')} onClose={() => {}}><span data-label>{t('Đang chờ thanh toán')}</span><input placeholder={t('Tóm tắt vấn đề')} /></Modal></>; }
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); setLanguage('vi'); });
it('switches labels, attributes and modal chrome both ways without modifying content', async () => {
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
 vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
 const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
 try {
 await act(async () => root.render(<Probe />)); expect(host.querySelector('[data-content]')?.textContent).toBe('Active');
 await act(async () => setLanguage('en')); expect(host.querySelector('[data-label]')?.textContent).toBe('Pending payment'); expect(host.querySelector('input')?.placeholder).toBe('Summarize the issue'); expect(host.querySelector('[data-protected]')?.textContent).toBe('Đóng'); expect(host.querySelector('[data-fallback]')?.textContent).toBe('toString'); expect(host.querySelector('.portal-dialog__close')?.getAttribute('aria-label')).toBe('Close dialog');
 await act(async () => setLanguage('vi')); expect(host.querySelector('[data-label]')?.textContent).toBe('Đang chờ thanh toán'); expect(host.querySelector('input')?.placeholder).toBe('Tóm tắt vấn đề'); expect(host.querySelector('[data-content]')?.textContent).toBe('Active');
 } finally { await act(async () => root.unmount()); host.remove(); }
});
it('falls back to Vietnamese for absent and unsupported preference values', () => { for(const value of ['', 'fr', 'unsupported', 'english', 'enemy']) { localStorage.setItem('scms_lang', value); expect(getLanguage()).toBe('vi'); } localStorage.removeItem('scms_lang'); expect(getLanguage()).toBe('vi'); });
