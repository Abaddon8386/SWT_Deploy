import { act, useMemo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearAuthSession, setCurrentUser } from '../api/client';
import { clearMissingTranslations, getLanguage, getMissingTranslations, LANGUAGE_STORAGE_KEY, setLanguage, sourceMessage, translateSource, useI18n } from './language';
import { DatePicker } from '../ui/DatePicker';
import { TimePicker } from '../ui/TimePicker';
import { RecurrenceFields } from '../ui/RecurrenceFields';
import { RouteLoading } from '../ui/RouteState';
import { useConfirm } from '../ui/ConfirmDialog';
import { ChatComposer } from '../../features/chat/ChatComposer';
import { ChatContacts } from '../../features/chat/ChatContacts';
import { getContacts } from '../../features/chat/chatApi';

vi.mock('../../features/chat/chatApi', async (original) => ({ ...await original<typeof import('../../features/chat/chatApi')>(), getContacts: vi.fn() }));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); setLanguage('vi'); clearMissingTranslations();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); setLanguage('vi'); });

function MemoProbe() {
  const { t } = useI18n();
  const label = useMemo(() => t('Trang chủ', 'Home'), [t]);
  return <p>{label}</p>;
}
it('updates memoized React labels VI → EN → VI without a DOM translator', async () => {
  await act(async () => root.render(<MemoProbe />)); expect(host.textContent).toBe('Trang chủ');
  await act(async () => setLanguage('en')); expect(host.textContent).toBe('Home');
  await act(async () => setLanguage('vi')); expect(host.textContent).toBe('Trang chủ');
});
it('retains one preference through login, logout, a remount and a storage update', async () => {
  setLanguage('en');
  setCurrentUser({ id: 'qa-local-only', name: 'Đóng', identifier: 'qa', role: 'MEMBER' });
  clearAuthSession(); expect(getLanguage()).toBe('en');
  await act(async () => root.render(<MemoProbe />)); expect(host.textContent).toBe('Home');
  await act(async () => root.unmount()); root = createRoot(host);
  await act(async () => root.render(<MemoProbe />)); expect(host.textContent).toBe('Home');
  await act(async () => { localStorage.setItem(LANGUAGE_STORAGE_KEY, 'vi'); window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_STORAGE_KEY, newValue: 'vi' })); });
  expect(host.textContent).toBe('Trang chủ'); expect(document.documentElement.lang).toBe('vi');
});
it('makes missing source translations observable and leaves explicitly tagged content alone', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  translateSource('Một nhãn QA bị thiếu', undefined, 'en');
  translateSource('Một nhãn QA bị thiếu', undefined, 'en');
  expect(getMissingTranslations()).toEqual(['Một nhãn QA bị thiếu']); expect(warn).toHaveBeenCalledTimes(1);
  clearMissingTranslations(); translateSource('Đóng', 'Close', 'en'); expect(getMissingTranslations()).toEqual([]);
});
it('switches shared calendar, time picker, recurrence, loading and send controls while open', async () => {
  await act(async () => root.render(<>
    <DatePicker value="" onChange={() => {}} /><TimePicker value="" onChange={() => {}} />
    <RecurrenceFields startDate="2026-11-02" value={{ period: 'week', days: [1] }} onChange={() => {}} />
    <RouteLoading /><ChatComposer id="qa-message" label="QA" value="" onChange={() => {}} onSubmit={() => {}} />
  </>));
  await act(async () => host.querySelector<HTMLButtonElement>('.luxury-datepicker-trigger')!.click());
  expect(host.textContent).toContain('Tần suất buổi tập');
  await act(async () => setLanguage('en'));
  expect(host.querySelector('[role=dialog]')?.getAttribute('aria-label')).toBe('Select date');
  expect(host.textContent).toContain('Session frequency'); expect(host.textContent).toContain('Weekly');
  expect(host.textContent).toContain('Mon'); expect(host.textContent).toContain('Loading page');
  expect(host.querySelector('.direct-chat__send-btn')?.textContent).toBe('Send');
  expect(host.querySelector('textarea')?.placeholder).toBe('Message...');
  expect(host.querySelector('.luxury-timepicker-value')?.textContent).toBe('Select time...');
  await act(async () => setLanguage('vi'));
  expect(host.textContent).toContain('Tần suất buổi tập'); expect(host.querySelector('.direct-chat__send-btn')?.textContent).toBe('Gửi');
});
function ConfirmProbe() {
  const [confirm, dialog] = useConfirm();
  return <><button onClick={() => void confirm({ title: sourceMessage('Xác nhận thao tác', 'Confirm action'), message: sourceMessage('Tiếp tục?', 'Continue?'), confirmLabel: sourceMessage('Tiếp tục', 'Continue') })}>open</button>{dialog}</>;
}
it('keeps the same open confirmation and translates its preserved source labels', async () => {
  await act(async () => root.render(<ConfirmProbe />)); await act(async () => host.querySelector('button')!.click());
  const dialog = host.querySelector('dialog'); expect(dialog?.textContent).toContain('Xác nhận thao tác');
  await act(async () => setLanguage('en')); expect(host.querySelector('dialog')).toBe(dialog); expect(dialog?.textContent).toContain('Confirm action'); expect(dialog?.textContent).toContain('Continue?');
  await act(async () => setLanguage('vi')); expect(dialog?.textContent).toContain('Xác nhận thao tác');
});
it('translates a stored client chat failure immediately and preserves recipient names', async () => {
  vi.mocked(getContacts).mockRejectedValueOnce(new TypeError('offline'));
  await act(async () => root.render(<ChatContacts pending={null} onChoose={() => {}} />));
  expect(host.textContent).toContain('Không thể tải danh bạ.');
  await act(async () => setLanguage('en')); expect(host.textContent).toContain('Unable to load contacts.');
  vi.mocked(getContacts).mockResolvedValueOnce({ content: [{ id: 7, name: 'Đóng', role: 'COACH', available: true, avatarUrl: null }], totalPages: 1, number: 0 });
  await act(async () => host.querySelector<HTMLButtonElement>('[role=alert] button')!.click());
  expect(host.querySelector('.direct-chat__person-info strong')?.textContent).toBe('Đóng'); expect(host.textContent).toContain('Coach');
  await act(async () => setLanguage('vi')); expect(host.querySelector('.direct-chat__person-info strong')?.textContent).toBe('Đóng'); expect(host.textContent).toContain('Huấn luyện viên');
});