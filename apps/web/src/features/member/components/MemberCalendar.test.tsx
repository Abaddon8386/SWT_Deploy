import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberCalendar } from './MemberCalendar';
import { setLanguage } from '../../../shared/i18n/language';
import { clearNotices } from '../../../shared/lib/portalNotices';

const mocks = vi.hoisted(() => ({
  now: '2099-01-06T23:00:00Z', sessions: vi.fn(), bookings: vi.fn(), enrollments: vi.fn(), cancel: vi.fn(), cancelEnrollment: vi.fn(), courts: vi.fn(),
}));
vi.mock('../memberClassesApi', () => ({
  getSessionsBetween: mocks.sessions,
  getMyBookingsBetween: mocks.bookings,
  getMyEnrollments: mocks.enrollments,
  cancelBooking: mocks.cancel,
  cancelEnrollment: mocks.cancelEnrollment,
}));
vi.mock('../../courts/courtsApi', () => ({ courtsApi: { my: mocks.courts } }));
vi.mock('../../../shared/lib/centerTime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/lib/centerTime')>();
  return { ...actual, centerNowParts: () => actual.centerNowParts(new Date(mocks.now)) };
});

const booking = {
  id: 55, sessionId: 8, classId: 3, className: 'Yoga Flow', memberId: 1, sessionDate: '2099-01-08',
  startTime: '09:00:00', endTime: '10:30:00', roomName: 'Studio', coachName: 'An', status: 'booked',
  bookedAt: '', cancelledAt: null, cancelReason: null, batchId: null,
};
const court = {
  id: 91, roomId: 2, roomName: 'Sân Tennis 1', disciplineName: 'Tennis', memberId: 1, memberName: 'A',
  date: '2099-01-06', startTime: '14:00:00', endTime: '15:00:00', status: 'booked', createdAt: '',
  cancelledAt: null, cancelReason: null, canCancel: true, price: 0, paymentMethod: null, paymentStatus: null,
};

describe('MemberCalendar', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } });
    clearNotices();
    Object.values(mocks).forEach((mock) => { if (vi.isMockFunction(mock)) mock.mockReset(); });
    mocks.now = '2099-01-06T23:00:00Z';
    setLanguage('vi');
    mocks.sessions.mockResolvedValue([]);
    mocks.bookings.mockResolvedValue([booking]);
    mocks.enrollments.mockResolvedValue([]);
    mocks.courts.mockResolvedValue({ content: [court], number: 0, totalPages: 1, totalElements: 1 });
    mocks.cancel.mockResolvedValue({});
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
  const render = (onBookingChange = vi.fn()) =>
    act(async () => root.render(<MemoryRouter><MemberCalendar onBookingChange={onBookingChange} /></MemoryRouter>));
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!;

  it('shows only my classes and court bookings for the week, without discipline filters', async () => {
    await render();
    expect(mocks.bookings).toHaveBeenCalledWith('2099-01-05', '2099-01-11');
    expect(host.querySelector('.mcal__range')!.textContent).toBe('05/01 - 11/01/2099');
    expect(host.querySelector('.mcal__event--class')!.textContent).toContain('Yoga Flow');
    expect(host.querySelector('.mcal__event--court')!.textContent).toContain('Sân Tennis 1');
    expect(host.querySelector('.mcal__event--court')!.classList).toContain('is-past');
    expect(host.querySelector('[aria-label="Lọc theo bộ môn"]')).toBeNull();
    expect(host.querySelector('.mcal__dayhead.is-today')!.textContent).toContain('07');
  });

  it.each([
    ['2026-11-01T16:59:59Z', '2026-10-26', '2026-11-01'],
    ['2026-11-01T17:00:00Z', '2026-11-02', '2026-11-08'],
    ['2026-12-31T17:00:00Z', '2026-12-28', '2027-01-03'],
    ['2027-01-03T17:00:00Z', '2027-01-04', '2027-01-10'],
  ])('resets month navigation to the real center-time week at %s', async (instant, from, to) => {
    mocks.now = instant;
    await render();
    await act(async () => button('Tháng').click());
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Tháng sau"]')!.click());
    await act(async () => button('Tuần này').click());
    expect(host.querySelector('.mcal__month')).toBeNull();
    expect(host.querySelectorAll('.mcal__dayhead')).toHaveLength(7);
    expect(mocks.bookings).toHaveBeenLastCalledWith(from, to);
    expect(mocks.sessions).toHaveBeenLastCalledWith(from, to);
  });
  it('labels both event types in week, month, and event details', async () => {
    await render();
    expect(host.querySelector('.mcal__event--class .mcal__type')!.textContent).toBe('Buổi học');
    expect(host.querySelector('.mcal__event--court .mcal__type')!.textContent).toBe('Đặt sân / phòng');
    await act(async () => button('Tháng').click());
    expect(host.querySelector('.mcal__chip--court .mcal__type')!.textContent).toBe('Đặt sân / phòng');
    await act(async () => host.querySelector<HTMLButtonElement>('.mcal__chip--court')!.click());
    expect(document.querySelector('dialog')!.textContent).toContain('Đặt sân / phòng');
    expect(document.querySelector('dialog a')!.getAttribute('href')).toBe('/member/courts');
  });
  it('keeps week empty state and removes only monthly message', async () => {
    mocks.bookings.mockResolvedValue([]);
    mocks.courts.mockResolvedValue({ content: [], totalPages: 1 });
    await render();
    expect(host.querySelector('.mcal__empty')!.textContent).toBe('Tuần này bạn chưa có lịch nào.');
    await act(async () => button('Tháng').click());
    expect(host.querySelector('.mcal__empty')).toBeNull();
    expect(host.querySelectorAll('.mcal__cell')).toHaveLength(42);
  });
  it('updates new labels when language changes', async () => {
    await render();
    await act(async () => setLanguage('en'));
    expect(button('This week')).toBeDefined();
    expect(button('Month')).toBeDefined();
    expect(host.querySelector('.mcal__dayhead')!.textContent).toContain('Monday');
    await act(async () => host.querySelector<HTMLButtonElement>('.mcal__event--class')!.click());
    expect(document.querySelector('dialog')!.textContent).toContain('Cancel this session');
    expect(document.querySelector('dialog')!.textContent).toContain('Coach');
    await act(async () => button('Close').click());
    expect(host.querySelector('.mcal__event--class .mcal__type')!.textContent).toBe('Class session');
    expect(host.querySelector('.mcal__event--court .mcal__type')!.textContent).toBe('Court / room');
  });
  it('keeps court load failures separate from a successfully empty week', async () => {
    mocks.bookings.mockResolvedValue([]);
    mocks.courts.mockRejectedValue(new Error('offline'));
    await render();
    expect(host.querySelector('.mcal__note')!.textContent).toContain('Chưa tải được lịch đặt sân.');
    expect(host.querySelector('.mcal__empty')).toBeNull();
  });
  it('filters the whole Monday–Sunday range and ignores public sessions without my seat', async () => {
    mocks.now = '2026-12-31T17:00:00Z';
    mocks.bookings.mockResolvedValue(['2026-12-27', '2026-12-28', '2027-01-03', '2027-01-04'].map((date, i) => ({ ...booking, id: i, sessionId: i, sessionDate: date, className: date })));
    mocks.sessions.mockResolvedValue([{ id: 99, classId: 90, className: 'Unbooked public class', sessionDate: '2027-01-02', startTime: '09:00', endTime: '10:00' }]);
    mocks.courts.mockResolvedValue({ content: [], totalPages: 1 });
    await render();
    expect([...host.querySelectorAll('.mcal__event-title')].map(node => node.textContent)).toEqual(['2026-12-28', '2027-01-03']);
    expect(host.textContent).not.toContain('Unbooked public class');
  });
  it('keeps enrollment cancellation routed to its own API', async () => {
    mocks.bookings.mockResolvedValue([]);
    mocks.enrollments.mockResolvedValue([{ id: 42, classId: 3, className: 'Yoga Flow', sessionId: 8, sessionDate: '2099-01-08', startTime: '09:00', endTime: '10:00', status: 'enrolled' }]);
    mocks.cancelEnrollment.mockResolvedValue({});
    await render();
    await act(async () => host.querySelector<HTMLButtonElement>('.mcal__event--class')!.click());
    await act(async () => button('Hủy đặt chỗ').click());
    await act(async () => button('Xác nhận hủy').click());
    expect(mocks.cancelEnrollment).toHaveBeenCalledWith(42);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it('keeps type labels visible in the mobile day view', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    await render();
    expect(host.querySelectorAll('.mcal__daychip')).toHaveLength(7);
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label^="Thứ 3 06/01"]')!.click());
    expect(host.querySelector('.mcal__event--court .mcal__type')!.textContent).toBe('Đặt sân / phòng');
  });
  it('shows the next upcoming item with a countdown', async () => {
    await render();
    const next = host.querySelector('.mcal__next')!;
    expect(next.textContent).toContain('Yoga Flow');
    expect(next.textContent).toContain('còn 1 ngày 3 giờ');
  });

  it('switches to month view and back to the week of a clicked day', async () => {
    await render();
    await act(async () => button('Tháng').click());
    expect(host.querySelector('.mcal__range')!.textContent).toBe('Tháng 1/2099');
    expect(host.querySelectorAll('.mcal__cell')).toHaveLength(42);
    expect(host.querySelector('.mcal__chip--class')!.textContent).toContain('Yoga Flow');
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label^="Xem tuần có Thứ 5 15/01"]')!.click());
    expect(host.querySelector('.mcal__range')!.textContent).toBe('12/01 - 18/01/2099');
  });

  it('cancels a booked class only after confirmation', async () => {
    const onBookingChange = vi.fn();
    await render(onBookingChange);
    await act(async () => host.querySelector<HTMLButtonElement>('.mcal__event--class')!.click());
    await act(async () => button('Hủy buổi này').click());
    expect(mocks.cancel).not.toHaveBeenCalled();
    await act(async () => button('Xác nhận hủy').click());
    expect(mocks.cancel).toHaveBeenCalledWith(55);
    expect(onBookingChange).toHaveBeenCalled();
  });

  it('reloads on its own when the member comes back to the window', async () => {
    await render();
    expect(host.querySelectorAll('.mcal__event--court')).toHaveLength(1);
    mocks.courts.mockResolvedValue({ content: [court, { ...court, id: 93, date: '2099-01-09', roomName: 'Sân Cầu lông 2' }], number: 0, totalPages: 1, totalElements: 2 });
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(host.querySelectorAll('.mcal__event--court')).toHaveLength(2);
    expect(host.textContent).toContain('Sân Cầu lông 2');
  });

  it('shows an error with retry when loading fails', async () => {
    mocks.sessions.mockRejectedValueOnce(new Error('Mất kết nối'));
    await render();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('Mất kết nối');
    await act(async () => button('Thử lại').click());
    expect(host.querySelector('.mcal__event--class')).not.toBeNull();
  });
});
