import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkoutHistory } from './WorkoutHistory';
import { memberCheckinApi } from './memberCheckinApi';
vi.mock('./memberCheckinApi', () => ({ memberCheckinApi: { history: vi.fn() } }));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-05T12:00:00+07:00'));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.mocked(memberCheckinApi.history).mockResolvedValue([
    { id: 1, checkInTime: '2026-11-01T08:00:00', checkOutTime: '2026-11-01T09:00:00', status: 'GRANTED', method: 'qr', gate: 'Cổng A1' },
    { id: 2, checkInTime: '2026-11-01T10:00:00', status: 'GRANTED', method: 'qr' },
    { id: 3, checkInTime: '2026-11-01T11:00:00', status: 'DENIED', method: 'qr' },
  ]);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function render() { await act(async () => root.render(<WorkoutHistory />)); }
async function click(label: string) { await act(async () => ([...host.querySelectorAll('button')].find(button => button.textContent === label || button.getAttribute('aria-label') === label) as HTMLButtonElement).click()); }
it('counts distinct days and valid entries, filters a date then restores the month', async () => {
  await render();
  expect(host.querySelector('.workout-stats')?.textContent).toBe('1Đã tập luyện4Không tập luyện2Lượt check-in thành công');
  expect(host.querySelectorAll('.workout-day-toggle')).toHaveLength(1);
  await act(async () => (host.querySelector('.workout-day-toggle') as HTMLButtonElement).click());
  expect(host.querySelectorAll('.workout-visits li')).toHaveLength(2);
  expect(host.querySelector('.workout-visits li')?.textContent).toContain('10:00');
  await click('02/11/2026, không ghi nhận tập luyện'); expect(host.textContent).toContain('Chưa có check-in thành công trong ngày này.');
  await click('Xem cả tháng'); expect(host.querySelectorAll('.workout-day-toggle')).toHaveLength(1);
});
it('requests complete months across years', async () => {
  await render(); await click('Tháng sau'); await click('Tháng sau');
  expect(memberCheckinApi.history).toHaveBeenLastCalledWith({ fromDate: '2027-01-01', toDate: '2027-01-31' });
  expect(host.querySelectorAll('.workout-calendar-day')).toHaveLength(31);
  expect(host.querySelector('.workout-stats')?.textContent).toBe('0Đã tập luyện—Không tập luyện0Lượt check-in thành công');
});
it('ignores a late response after changing month', async () => {
  let finish!: (rows: Awaited<ReturnType<typeof memberCheckinApi.history>>) => void;
  vi.mocked(memberCheckinApi.history).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render(); await click('Tháng sau');
  await act(async () => finish([{ id: 9, checkInTime: '2026-11-01T08:00:00', status: 'GRANTED', method: 'qr', gate: 'Old response' }]));
  expect(host.textContent).not.toContain('Old response');
  expect(host.textContent).toContain('Tháng 12 / 2026');
});
it('reloads on focus and remount, and reports errors instead of showing false zeroes', async () => {
  await render();
  vi.mocked(memberCheckinApi.history).mockRejectedValueOnce(new Error('offline'));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Không thể tải lịch sử');
  expect(host.querySelector('.workout-stats')).toBeNull();
  await click('Thử lại'); expect(host.querySelectorAll('.workout-day-toggle')).toHaveLength(1);
  await act(async () => root.render(null)); await render();
  expect(memberCheckinApi.history).toHaveBeenCalledTimes(4);
});
it('shows loading until the API confirms history', async () => {
  let finish!: (rows: []) => void;
  vi.mocked(memberCheckinApi.history).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render(); expect(host.textContent).toContain('Đang tải'); expect(host.querySelector('.workout-stats')).toBeNull();
  await act(async () => finish([])); expect(host.textContent).toContain('Chưa có check-in thành công trong tháng này.');
});

it('displays newly returned backend entries on focus without counting checkout again', async () => {
  await render();
  vi.mocked(memberCheckinApi.history).mockResolvedValueOnce([
    { id: 1, checkInTime: '2026-11-01T08:00:00', checkOutTime: '2026-11-01T09:00:00', status: 'GRANTED', method: 'qr' },
    { id: 2, checkInTime: '2026-11-01T10:00:00', checkOutTime: '2026-11-01T11:00:00', status: 'GRANTED', method: 'qr' },
    { id: 4, checkInTime: '2026-11-05T08:00:00', status: 'GRANTED', method: 'qr', gate: 'Cổng A2' },
    { id: 5, checkInTime: '2026-11-05T08:01:00', status: 'DENIED', method: 'qr' },
  ]);
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(host.querySelector('.workout-stats')?.textContent).toBe('2Đã tập luyện3Không tập luyện3Lượt check-in thành công');
  expect(host.querySelectorAll('.workout-day-toggle')).toHaveLength(2);
  expect(host.querySelector('.workout-day-toggle')?.textContent).toContain('05/11/2026');
  await act(async () => (host.querySelector('.workout-day-toggle') as HTMLButtonElement).click());
  expect(host.querySelector('.workout-visits li')?.textContent).toContain('08:00');
  expect(host.querySelector('.workout-visits li')?.textContent).toContain('Cổng A2');
});

it('loads fresh backend data when the document becomes visible', async () => {
  await render();
  vi.mocked(memberCheckinApi.history).mockResolvedValueOnce([]);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  try {
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(host.querySelectorAll('.workout-visits li')).toHaveLength(0);
    expect(host.textContent).toContain('Chưa có check-in thành công trong tháng này.');
  } finally { vi.restoreAllMocks(); }
});

it('counts calendar days through today without including future dates', async () => {
  await render();
  expect(host.querySelector('[data-stat="trained"] strong')?.textContent).toBe('1');
  expect(host.querySelector('[data-stat="missed"] strong')?.textContent).toBe('4');
  expect(host.textContent).not.toContain('Dữ liệu check-in tại trung tâm');
  expect(host.textContent).not.toContain('Màu salmon:');
  expect(host.querySelector('.workout-history-heading h3')?.textContent).toBe('Lịch sử tập luyện');
});

it('distinguishes trained, selected, today and future dates without color alone', async () => {
  await render();
  const trained = host.querySelector('[aria-label="01/11/2026, có check-in"]') as HTMLButtonElement;
  await act(async () => trained.click());
  expect(trained.getAttribute('aria-pressed')).toBe('true');
  expect(trained.textContent).toContain('✓');
  expect(trained.getAttribute('data-active')).toBe('true');
  expect(host.querySelector('[aria-current="date"]')?.getAttribute('data-day-state')).toBe('today');
  expect(host.querySelector('[aria-label="06/11/2026, ngày tương lai"]')?.getAttribute('data-day-state')).toBe('future');
  expect(host.querySelector('[aria-label="02/11/2026, không ghi nhận tập luyện"]')?.getAttribute('data-day-state')).toBe('missed');
});

it('keeps all visits for one day together without paginating those visits', async () => {
  vi.mocked(memberCheckinApi.history).mockResolvedValue(Array.from({ length: 12 }, (_, index) => ({
    id: index + 1, checkInTime: `2026-11-01T${String(index).padStart(2, '0')}:00:00`, status: 'GRANTED', method: 'qr', gate: `Cổng ${index + 1}`,
  })));
  await render();
  expect(host.querySelectorAll('.workout-day-toggle')).toHaveLength(1);
  expect(host.textContent).toContain('1–1 / 1 ngày');
  expect(host.querySelector('.workout-day-toggle')?.textContent).toContain('12 lượt check-in thành công');
  await act(async () => (host.querySelector('.workout-day-toggle') as HTMLButtonElement).click());
  expect(host.querySelectorAll('.workout-visits li')).toHaveLength(12);
  expect((host.querySelector('.workout-pagination button:last-child') as HTMLButtonElement).disabled).toBe(true);
  await click('01/11/2026, có check-in');
  expect(host.querySelector('.workout-day-toggle')?.getAttribute('aria-expanded')).toBe('false');
  await click('Xem cả tháng'); expect(host.textContent).toContain('1–1 / 1 ngày');
  await click('Tháng trước');
  expect(host.textContent).toContain('Chưa có check-in thành công trong tháng này.');
  expect(host.querySelector('.workout-pagination')).toBeNull();
});

it('counts the full past month and does not conclude future months were missed', async () => {
  await render(); await click('Tháng trước');
  expect(host.querySelector('[data-stat="missed"] strong')?.textContent).toBe('31');
  await click('Tháng sau'); await click('Tháng sau');
  expect(host.querySelector('[data-stat="missed"] strong')?.textContent).toBe('—');
});


it('groups Vietnam dates, starts collapsed, and expands every valid entry newest first', async () => {
  vi.mocked(memberCheckinApi.history).mockResolvedValue([
    { id: 1, checkInTime: '2026-10-31T17:00:00Z', status: 'GRANTED', method: 'qr', gate: 'Cổng A1' },
    { id: 2, checkInTime: '2026-11-01T00:01:00', checkOutTime: '2026-11-01T01:00:00', status: 'GRANTED', method: 'qr', gate: 'Cổng A2' },
    { id: 3, checkInTime: '2026-10-31T16:59:59Z', status: 'GRANTED', method: 'qr' },
    { id: 4, checkInTime: '2026-11-01T02:00:00', status: 'DENIED', method: 'qr' },
    { id: 5, checkInTime: '2026-11-02T09:00:00', status: 'GRANTED', method: 'qr' },
  ]);
  await render();
  const triggers = [...host.querySelectorAll<HTMLButtonElement>('.workout-day-toggle')];
  expect(triggers).toHaveLength(2);
  expect(triggers[0].textContent).toContain('02/11/2026');
  expect(triggers[0].textContent).toContain('1 lượt check-in');
  expect(triggers[1].textContent).toContain('2 lượt check-in');
  expect(triggers.every(button => button.getAttribute('aria-expanded') === 'false')).toBe(true);
  expect(host.querySelectorAll('.workout-visits li')).toHaveLength(0);
  const button = triggers[1];
  button.focus(); expect(document.activeElement).toBe(button);
  expect(button.tagName).toBe('BUTTON');
  await act(async () => button.click());
  expect(button.getAttribute('aria-expanded')).toBe('true');
  const panel = document.getElementById(button.getAttribute('aria-controls')!);
  expect(panel?.hidden).toBe(false);
  const entries = panel!.querySelectorAll('.workout-visits li');
  expect(entries).toHaveLength(2);
  expect(entries[0].textContent).toContain('00:01');
  expect(entries[0].textContent).toContain('Cổng A2');
  expect(entries[0].textContent).toContain('Check-in thành công');
  expect(entries[1].textContent).toContain('00:00');
  await act(async () => button.click());
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(panel?.hidden).toBe(true);
});

it('paginates five days rather than visits and resets date filtering to page one', async () => {
  vi.mocked(memberCheckinApi.history).mockResolvedValue(Array.from({ length: 14 }, (_, index) => ({
    id: index + 1, checkInTime: `2026-10-${String(Math.floor(index / 2) + 1).padStart(2, '0')}T${index % 2 ? '10' : '08'}:00:00`, status: 'GRANTED', method: 'qr',
  })));
  await render(); await click('Tháng trước');
  expect(host.querySelectorAll('.workout-day-toggle')).toHaveLength(5);
  expect(host.querySelector('.workout-day-toggle')?.textContent).toContain('07/10/2026');
  expect(host.textContent).toContain('1–5 / 7 ngày');
  await click('Trang sau');
  expect(host.querySelectorAll('.workout-day-toggle')).toHaveLength(2);
  expect(host.textContent).toContain('6–7 / 7 ngày');
  await click('07/10/2026, có check-in');
  expect(host.querySelectorAll('.workout-day-toggle')).toHaveLength(1);
  expect(host.textContent).toContain('1–1 / 1 ngày');
  expect(host.querySelector('.workout-day-toggle')?.getAttribute('aria-expanded')).toBe('false');
  await click('Xem cả tháng'); expect(host.textContent).toContain('1–5 / 7 ngày');
  await click('Trang sau'); await click('Tháng sau');
  expect(host.textContent).toContain('Chưa có check-in thành công trong tháng này.');
  await click('Tháng trước'); expect(host.textContent).toContain('1–5 / 7 ngày');
});
