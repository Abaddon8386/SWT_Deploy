import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TrainingExerciseFields } from '../coaching/TrainingExerciseFields';
import { GateQrPanel } from '../reception/GateQrPanel';
import { StaffAccountsPage } from '../manager/StaffAccountsPage';
import { checkinApi } from '../reception/checkinApi';
import { listStaffAccounts } from '../manager/staffAccountsApi';
import { setLanguage } from '../../shared/i18n/language';
import { coachSessionEvents, ptBookingEvents } from '../coaching/coachTimetable';

vi.mock('../reception/checkinApi', () => ({ checkinApi: { gateQr: vi.fn() } }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,current') } }));
vi.mock('../manager/staffAccountsApi', () => ({ listStaffAccounts: vi.fn(), createStaffAccount: vi.fn(), setStaffAccountLocked: vi.fn() }));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  setLanguage('vi');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.mocked(listStaffAccounts).mockResolvedValue([]);
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); setLanguage('vi'); vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals();
});
const language = async (next: 'vi' | 'en') => act(async () => setLanguage(next));

it('switches coach form metadata VI → EN → VI without translating entered exercise content', async () => {
  await act(async () => root.render(<TrainingExerciseFields prefix="language" value={{ exerciseName: 'Đóng', description: 'Lưu thay đổi', dayOfWeek: 1 }} onChange={() => {}} />));
  expect(host.textContent).toContain('Tên bài tập');
  await language('en');
  expect(host.textContent).toContain('Exercise name');
  expect(host.textContent).toContain('Rest between sets (seconds)');
  expect(host.querySelector('option[value="1"]')?.textContent).toBe('Monday');
  expect(host.querySelector<HTMLInputElement>('#language-name')?.value).toBe('Đóng');
  expect(host.querySelector('textarea')?.value).toBe('Lưu thay đổi');
  await language('vi');
  expect(host.textContent).toContain('Tên bài tập');
  expect(host.querySelector('option[value="1"]')?.textContent).toBe('Thứ 2');
});

it('retranslates an already displayed reception client fallback without regenerating gate QR', async () => {
  vi.mocked(checkinApi.gateQr).mockRejectedValue(new TypeError('network unavailable'));
  await act(async () => root.render(<GateQrPanel gateId="A1" />));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Không thể tạo mã QR cổng');
  await language('en');
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('Unable to generate gate QR code. Check your connection and try again.');
  expect(host.querySelector('section')?.getAttribute('aria-label')).toBe('Gate QR code for members');
  expect(checkinApi.gateQr).toHaveBeenCalledOnce();
  await language('vi');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Không thể tạo mã QR cổng');
});

it('switches manager labels and an open confirmation while preserving staff names', async () => {
  vi.mocked(listStaffAccounts).mockResolvedValue([{ id: 8, fullName: 'Đóng', email: 'member@example.com', roleCode: 'COACH', status: 'active' }]);
  await act(async () => root.render(<StaffAccountsPage />));
  await act(async () => host.querySelector<HTMLButtonElement>('tbody button')!.click());
  expect(host.querySelector('dialog')?.textContent).toContain('Khóa tài khoản nhân sự?');
  await language('en');
  expect(host.textContent).toContain('Staff accounts');
  expect(host.querySelector('dialog')?.textContent).toContain('Lock staff account?');
  expect(host.querySelector('dialog')?.textContent).toContain('Đóng (member@example.com)');
  expect(host.querySelector('tbody')?.textContent).toContain('Đóng');
  expect(listStaffAccounts).toHaveBeenCalledOnce();
  await language('vi');
  expect(host.querySelector('dialog')?.textContent).toContain('Khóa tài khoản nhân sự?');
});

it('never translates a backend error even if its text matches source-owned UI copy', async () => {
  vi.mocked(listStaffAccounts).mockRejectedValue(new Error('Đóng'));
  await act(async () => root.render(<StaffAccountsPage />));
  await language('en');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Đóng');
  expect(host.querySelector('[role="alert"]')?.textContent).not.toContain('Close');
  await language('vi');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Đóng');
});

it('translates coach timetable status and accessible labels at invocation, keeping member/class names raw', () => {
  const session = { id: 1, className: 'Đóng', roomName: 'Lưu thay đổi', sessionDate: '2026-11-06', startTime: '08:00', endTime: '09:00', bookedCount: 3, capacity: 5, status: 'cancelled' };
  setLanguage('en');
  const events = coachSessionEvents([session], 'schedule');
  expect(events[0].badge).toBe('Cancelled');
  expect(events[0].title).toBe('Đóng');
  expect(events[0].meta).toBe('Lưu thay đổi');
  expect(events[0].ariaLabel).toContain('members, cancelled');
  expect(ptBookingEvents([{ id: 1, memberName: 'Đóng', bookingDate: '2026-11-06', startTime: '08:00', endTime: '09:00', status: 'confirmed' }])[0].ariaLabel).toContain('One-to-one coaching with Đóng');
  setLanguage('vi');
  expect(coachSessionEvents([session], 'schedule')[0].badge).toBe('Đã hủy');
});
