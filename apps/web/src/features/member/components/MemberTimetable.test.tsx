import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberTimetable } from './MemberTimetable';
import { clearNotices } from '../../../shared/lib/portalNotices';

const mocks = vi.hoisted(() => ({
  sessions: vi.fn(), bookings: vi.fn(), enrollments: vi.fn(), book: vi.fn(), cancel: vi.fn(), cancelEnrollment: vi.fn(),
}));
vi.mock('../memberClassesApi', () => ({
  getSessionsBetween: mocks.sessions,
  getMyBookingsBetween: mocks.bookings,
  getMyEnrollments: mocks.enrollments,
  bookSession: mocks.book,
  cancelBooking: mocks.cancel,
  cancelEnrollment: mocks.cancelEnrollment,
}));

const base = {
  classId: 3, className: 'Yoga Flow', disciplineId: 2, disciplineName: 'Yoga', coachId: 4, coachName: 'An',
  roomId: 5, roomName: 'Studio', sessionDate: '2099-01-07', startTime: '08:00:00', endTime: '09:00:00',
  status: 'scheduled', cancelReason: null, capacity: 12, bookedCount: 3,
};
const open = { ...base, id: 8 };
const full = { ...base, id: 9, className: 'Boxing', disciplineName: 'Boxing', startTime: '10:00:00', endTime: '11:00:00', bookedCount: 12 };
const booking = {
  id: 55, sessionId: 8, classId: 3, className: 'Yoga Flow', memberId: 1, sessionDate: '2099-01-07',
  startTime: '08:00:00', endTime: '09:00:00', roomName: 'Studio', coachName: 'An', status: 'booked',
  bookedAt: '', cancelledAt: null, cancelReason: null, batchId: null,
};

describe('MemberTimetable', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2099, 0, 5, 6, 0) });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } });
    clearNotices();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.sessions.mockResolvedValue([open, full]);
    mocks.bookings.mockResolvedValue([]);
    mocks.enrollments.mockResolvedValue([]);
    mocks.book.mockResolvedValue({});
    mocks.cancel.mockResolvedValue({});
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  const render = (props: Partial<React.ComponentProps<typeof MemberTimetable>> = {}) =>
    act(async () => root.render(<MemberTimetable discipline="ALL" onBookingChange={() => {}} {...props} />));
  const clickEvent = (label: string) => act(async () =>
    [...host.querySelectorAll<HTMLButtonElement>('.tt__event')].find((b) => b.textContent?.includes(label))!.click());
  const dialogButton = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('dialog button')].find((b) => b.textContent === text)!;

  it('loads the current week and shows sessions as colored blocks', async () => {
    await render();
    expect(mocks.sessions).toHaveBeenCalledWith('2099-01-05', '2099-01-11');
    expect(mocks.bookings).toHaveBeenCalledWith('2099-01-05', '2099-01-11');
    expect(host.querySelector('.tt__event--open')!.textContent).toContain('Yoga Flow');
    expect(host.querySelector('.tt__event--full')!.textContent).toContain('Boxing');
  });

  it('highlights the sessions the member booked', async () => {
    mocks.bookings.mockResolvedValue([booking]);
    await render();
    expect(host.querySelector('.tt__event--mine')!.textContent).toContain('Yoga Flow');
    expect(host.querySelector('.tt__event--open')).toBeNull();
  });

  it('books an open session from the detail dialog and refreshes', async () => {
    const onBookingChange = vi.fn();
    await render({ onBookingChange });
    await clickEvent('Yoga Flow');
    await act(async () => dialogButton('Đặt chỗ').click());
    expect(mocks.book).toHaveBeenCalledWith(8);
    expect(onBookingChange).toHaveBeenCalled();
    expect(mocks.sessions).toHaveBeenCalledTimes(2);
    expect(document.querySelector('dialog[open]')).toBeNull();
  });

  it('blocks booking a full session and explains why', async () => {
    await render();
    await clickEvent('Boxing');
    expect(dialogButton('Đặt chỗ').disabled).toBe(true);
    expect(document.querySelector('dialog')!.textContent).toContain('đã đầy chỗ');
    expect(mocks.book).not.toHaveBeenCalled();
  });

  it('cancels a booked session only after confirmation', async () => {
    mocks.bookings.mockResolvedValue([booking]);
    await render();
    await clickEvent('Yoga Flow');
    await act(async () => dialogButton('Hủy buổi này').click());
    expect(mocks.cancel).not.toHaveBeenCalled();
    await act(async () => dialogButton('Xác nhận hủy').click());
    expect(mocks.cancel).toHaveBeenCalledWith(55);
  });

  it('flags a session that overlaps one the member already booked', async () => {
    const clash = { ...base, id: 10, className: 'Pilates', startTime: '08:30:00', endTime: '09:30:00' };
    mocks.sessions.mockResolvedValue([open, clash]);
    mocks.bookings.mockResolvedValue([booking]);
    await render();
    await clickEvent('Pilates');
    expect(dialogButton('Đặt chỗ').disabled).toBe(true);
    expect(document.querySelector('dialog')!.textContent).toContain('Trùng giờ');
  });

  it('shows an error with retry when loading fails', async () => {
    mocks.sessions.mockRejectedValueOnce(new Error('Mất kết nối'));
    await render();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('Mất kết nối');
    await act(async () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Thử lại')!.click());
    expect(host.querySelector('.tt__event--open')).not.toBeNull();
  });
});
