import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/api/client';
import { courtsApi } from './courtsApi';
import { MemberCourtsPage, StaffCourtsPage } from './CourtBookingsPage';

vi.mock('./courtsApi', async original => ({ ...(await original<typeof import('./courtsApi')>()), courtsApi: {
  courts: vi.fn(), availability: vi.fn(), my: vi.fn(), list: vi.fn(), book: vi.fn(), bookRecurring: vi.fn(), cancel: vi.fn(),
} }));
vi.mock('../manager/catalogApi', () => ({ catalogApi: { rooms: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../shared/lib/portalNotices', () => ({ notify: vi.fn() }));
const court = { id: 5, name: 'Sân A', location: 'Tầng 1', disciplineId: 2, disciplineName: 'Tennis', openTime: '06:00', closeTime: '22:00' };
const empty = { content: [], totalPages: 0, totalElements: 0, number: 0 };
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  vi.mocked(courtsApi.courts).mockResolvedValue([court]);
  vi.mocked(courtsApi.availability).mockResolvedValue([{ startTime: '09:00', endTime: '10:00', status: 'free' }, { startTime: '10:00', endTime: '11:00', status: 'class' }]);
  vi.mocked(courtsApi.my).mockResolvedValue(empty);
  vi.mocked(courtsApi.list).mockResolvedValue(empty);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const render = (staff = false) => act(async () => root.render(<MemoryRouter initialEntries={['/member/courts?discipline=Tennis']}>{staff ? <StaffCourtsPage /> : <MemberCourtsPage />}</MemoryRouter>));
const click = async (text: string) => act(async () => { const button = [...host.querySelectorAll('button')].find(item => item.textContent?.includes(text)); expect(button).toBeTruthy(); button!.click(); });

it('shows loading then an empty court state without invented courts', async () => {
  let resolve!: (value: []) => void;
  vi.mocked(courtsApi.courts).mockReturnValue(new Promise(r => { resolve = r; }));
  await render();
  expect(host.textContent).toContain('Đang tải sân');
  await act(async () => resolve([]));
  expect(host.textContent).toContain('Chưa có sân cho bộ môn này');
});

it('retries a failed grid request and disables class slots', async () => {
  vi.mocked(courtsApi.courts).mockRejectedValueOnce(new Error('Mất kết nối'));
  await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Mất kết nối');
  await click('Thử lại');
  expect(host.textContent).toContain('Sân A');
  expect([...host.querySelectorAll('button')].find(item => item.textContent?.includes('Đang có lớp'))?.disabled).toBe(true);
});

it('refreshes availability after 409 and retains the translated conflict in the dialog', async () => {
  vi.mocked(courtsApi.book).mockRejectedValueOnce(new ApiError('SQL must not display', 409, 'COURT_BOOKING_SLOT_TAKEN'));
  await render();
  await click('Trống'); await click('Xác nhận đặt');
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Khung giờ vừa được đặt');
  expect(host.textContent).not.toContain('SQL must not display');
  expect(courtsApi.availability).toHaveBeenCalledTimes(2);
});

it('offers the packages page only when the API says the membership is the problem', async () => {
  vi.mocked(courtsApi.book)
    .mockRejectedValueOnce(new ApiError('Bạn chưa có gói tập', 403, 'COURT_BOOKING_MEMBERSHIP_INVALID'))
    .mockRejectedValueOnce(new ApiError('Hết khung này, hãy chọn gói tập khác', 409, 'COURT_BOOKING_SLOT_TAKEN'));
  await render();
  await click('Trống'); await click('Xác nhận đặt');
  const dialog = () => host.querySelector('[role="dialog"]')!;
  expect(dialog().querySelector('a[href="/member/packages"]')).not.toBeNull();
  // Reopening and failing for another reason must not keep the stale package link.
  await click('Quay lại'); await click('Trống'); await click('Xác nhận đặt');
  expect(dialog().querySelector('a[href="/member/packages"]')).toBeNull();
});

it('shows staff daily empty state and queries the paginated daily endpoint', async () => {
  await render(true);
  expect(courtsApi.list).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), '', 0);
  expect(host.textContent).toContain('Chưa có lượt đặt trong ngày này');
});

it('books a standing week on the chosen weekdays and reports the skipped day with its reason', async () => {
  const booking = { id: 1, roomId: 5, roomName: 'Sân A', disciplineName: 'Tennis', memberId: 1, memberName: 'M', date: '2099-01-05', startTime: '09:00', endTime: '10:00', status: 'booked' as const, createdAt: '', cancelledAt: null, cancelReason: null, canCancel: true };
  vi.mocked(courtsApi.bookRecurring).mockResolvedValue({ booked: [booking], skipped: [{ date: '2099-01-07', code: 'COURT_BOOKING_SLOT_TAKEN', message: 'Khung giờ đã có lượt đặt' }] });
  await render();
  await click('Trống');
  expect(host.querySelector('[role="status"]')).toBeNull();
  await click('Cả tuần');
  expect(host.textContent).toContain('Sẽ đặt 1 buổi');
  await click('Xác nhận đặt định kỳ');
  expect(courtsApi.book).not.toHaveBeenCalled();
  expect(courtsApi.bookRecurring).toHaveBeenCalledWith(expect.objectContaining({ roomId: 5, startTime: '09:00', period: 'week', daysOfWeek: [expect.any(Number)] }));
  expect(host.textContent).toContain('Đã đặt 1 buổi, bỏ qua 1 buổi');
  expect(host.textContent).toContain('07/01: Khung giờ đã có lượt đặt');
  await click('Đóng');
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});
