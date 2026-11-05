import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberCalendar } from './MemberCalendar';
import { clearNotices } from '../../../shared/lib/portalNotices';

const mocks = vi.hoisted(() => ({
  sessions: vi.fn(), bookings: vi.fn(), enrollments: vi.fn(), cancel: vi.fn(), cancelEnrollment: vi.fn(), courts: vi.fn(),
}));
vi.mock('../memberClassesApi', () => ({
  getSessionsBetween: mocks.sessions,
  getMyBookingsBetween: mocks.bookings,
  getMyEnrollments: mocks.enrollments,
  cancelBooking: mocks.cancel,
  cancelEnrollment: mocks.cancelEnrollment,
}));
vi.mock('../../courts/courtsApi', () => ({ courtsApi: { my: mocks.courts } }));
vi.mock('../../../shared/lib/centerTime', () => ({ centerNowParts: () => ({ date: '2099-01-07', time: '06:00' }) }));

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
    Object.values(mocks).forEach((mock) => mock.mockReset());
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
