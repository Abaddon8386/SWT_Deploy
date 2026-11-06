import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { apiFetch, apiFetchPdf, ApiError } from '../api/client';
import { setLanguage, useI18n } from './language';
let reason: Error;
function ErrorProbe() { const { t } = useI18n(); return <p>{t(reason)}</p>; }
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); setLanguage('vi'); });
it('requests JSON and PDF using the same language and updates local network errors without translating API messages', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network'));
  setLanguage('en');
  reason = await apiFetch<never>('/profile').catch((error: Error) => error);
  expect(reason).toBeInstanceOf(ApiError);
  expect(reason.message).toContain('Unable to connect to the server.');
  await apiFetchPdf('/invoices/1/pdf').catch(() => {});
  expect(fetch.mock.calls.every(([, init]) => (init?.headers as Record<string, string>)['Accept-Language'] === 'en')).toBe(true);
  const host = document.createElement('div'); const root = createRoot(host);
  try {
    await act(async () => root.render(<ErrorProbe />));
    expect(host.textContent).toContain('Unable to connect to the server.');
    await act(async () => setLanguage('vi'));
    expect(host.textContent).toContain('Không thể kết nối tới máy chủ.');
    reason = new ApiError('Gói tập', 400);
    await act(async () => setLanguage('en'));
    expect(host.textContent).toBe('Gói tập');
  } finally { await act(async () => root.unmount()); }
});
