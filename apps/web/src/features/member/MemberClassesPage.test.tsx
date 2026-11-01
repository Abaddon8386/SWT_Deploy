import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberClassesPage } from './MemberClassesPage';
import { ApiError } from '../../shared/api/client';

const mocks = vi.hoisted(() => ({
  sessions: vi.fn(),
  waitlists: vi.fn(),
  enrollments: vi.fn(),
  enroll: vi.fn(),
  cancelEnrollment: vi.fn(),
  joinWaitlist: vi.fn(),
  leaveWaitlist: vi.fn(),
}));

vi.mock('./memberClassesApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('./memberClassesApi')>();
  return {
    ...original,
    getSessions: mocks.sessions,
    getMyWaitlists: mocks.waitlists,
    getMyEnrollments: mocks.enrollments,
    enroll: mocks.enroll,
    cancelEnrollment: mocks.cancelEnrollment,
    joinWaitlist: mocks.joinWaitlist,
    leaveWaitlist: mocks.leaveWaitlist,
  };
});

const session = {
  id: 8, classId: 3, className: 'Yoga Flow', disciplineId: 2, disciplineName: 'Yoga',
  coachId: 4, coachName: 'An', roomId: 5, roomName: 'Studio', sessionDate: '2099-10-19',
  startTime: '08:00:00', endTime: '09:00:00', status: 'scheduled', cancelReason: null,
  capacity: 12, bookedCount: 12,
};

describe('MemberClassesPage', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div'); document.body.append(host);
    root = createRoot(host);
    mocks.sessions.mockReset();
    mocks.waitlists.mockReset();
    mocks.enrollments.mockReset();
    mocks.enroll.mockReset();
    mocks.cancelEnrollment.mockReset();
    mocks.joinWaitlist.mockReset();
    mocks.leaveWaitlist.mockReset();
    mocks.waitlists.mockResolvedValue([]);
    mocks.enrollments.mockResolvedValue([]);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
  async function render() { await act(async () => root.render(<MemoryRouter><MemberClassesPage /></MemoryRouter>)); }
  const manySessions = () => Array.from({ length: 14 }, (_, index) => ({ ...session, id: 100 + index, classId: 100 + index,
    className: `Buổi ${index + 1}`, disciplineName: index < 7 ? 'Yoga' : 'Boxing', bookedCount: 1 }));
  async function clickText(text: string) {
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes(text))!.click());
  }

  it('offers an accessible circular plus that books the actual session', async () => {
    mocks.sessions.mockResolvedValue([{ ...session, bookedCount: 1 }]);
    mocks.enroll.mockResolvedValue({});
    await render();
    const plus = host.querySelector<HTMLButtonElement>('.member-class-enroll')!;
    expect(plus).not.toBeNull();
    expect(plus.getAttribute('aria-label')).toContain('Yoga Flow');
    expect(plus.querySelector('[aria-hidden="true"]')?.textContent).toBe('+');
    await act(async () => plus.click());
    expect(mocks.enroll).toHaveBeenCalledExactlyOnceWith(8);
  });

  it('loads more locally after filtering and resets visible count on discipline/day changes', async () => {
    mocks.sessions.mockResolvedValue(manySessions());
    await render();
    expect(host.querySelectorAll('.member-class-session')).toHaveLength(6);
    await clickText('Xem thêm');
    expect(host.querySelectorAll('.member-class-session')).toHaveLength(12);
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Boxing')!.click());
    expect(host.querySelectorAll('.member-class-session')).toHaveLength(6);
    expect(host.textContent).toContain('Buổi 8');
    expect(host.querySelector('.member-class-session h3')?.textContent).toBe('Buổi 8');
    await clickText('Xem thêm');
    expect(host.querySelectorAll('.member-class-session')).toHaveLength(7);
    const day = host.querySelector('select')!;
    await act(async () => { day.value = String(new Date(2099, 9, 19).getDay()); day.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.querySelectorAll('.member-class-session')).toHaveLength(6);
    expect(mocks.sessions).toHaveBeenCalledTimes(1);
  });

  it('resets load-more on week changes and ignores a late response from the old week', async () => {
    mocks.sessions.mockResolvedValueOnce(manySessions());
    await render(); await clickText('Xem thêm');
    let finishNext!: (value: typeof session[]) => void;
    mocks.sessions.mockReturnValueOnce(new Promise(done => { finishNext = done; }));
    await clickText('Tuần kế tiếp');
    expect(host.textContent).toContain('Đang tải lịch học');
    mocks.sessions.mockResolvedValueOnce(manySessions());
    await clickText('Tuần này');
    expect(host.querySelectorAll('.member-class-session')).toHaveLength(6);
    await act(async () => finishNext([{ ...session, className: 'STALE WEEK' }]));
    expect(host.textContent).not.toContain('STALE WEEK');
    expect(host.querySelectorAll('.member-class-session')).toHaveLength(6);
  });

  it('does not treat failed enrollments as empty or offer booking and recovers the booked badge on retry', async () => {
    mocks.sessions.mockResolvedValue([{ ...session, bookedCount: 1 }]);
    mocks.enrollments.mockRejectedValueOnce(new ApiError('Không tải được đăng ký', 500)).mockResolvedValueOnce([
      { id: 41, classId: 3, sessionId: 8, className: 'Yoga Flow', status: 'booked', enrolledAt: '2099-10-01T08:00:00' },
    ]);
    await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Không tải được');
    expect(host.querySelector('.member-class-enroll')).toBeNull();
    await clickText('Lịch học của tôi');
    expect(host.textContent).not.toContain('Chưa có lịch học đã đặt');
    await clickText('Thử lại lịch học của tôi');
    expect(host.textContent).toContain('Đã xác nhận chỗ');
    await clickText('Lịch lớp học');
    expect(host.textContent).toContain('Đã đặt chỗ');
    expect(mocks.enroll).not.toHaveBeenCalled();
    expect(mocks.sessions).toHaveBeenCalledTimes(1);
  });

  it('waits for personal booking data before offering any booking or waitlist action', async () => {
    mocks.sessions.mockResolvedValue([session, { ...session, id: 9, classId: 4, bookedCount: 1 }]);
    let finish!: (value: unknown[]) => void;
    mocks.enrollments.mockReturnValue(new Promise(done => { finish = done; }));
    await render();
    expect(host.querySelector('.member-class-enroll')).toBeNull();
    expect([...host.querySelectorAll('button')].some(button => button.textContent?.includes('Tham gia hàng chờ'))).toBe(false);
    await act(async () => finish([]));
    expect(host.querySelector('.member-class-enroll')).not.toBeNull();
    expect(host.textContent).toContain('Tham gia hàng chờ');
  });

  it('claims a notified offer by ID without duplicate submit and keeps errors as errors', async () => {
    mocks.sessions.mockResolvedValue([session]);
    mocks.waitlists.mockResolvedValue([{ id: 31, classId: 3, className: 'Yoga Flow', memberId: 9,
      status: 'notified', requestedAt: '2099-10-01T08:00:00' }]);
    let reject!: (reason: unknown) => void;
    mocks.enroll.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    await render();
    const claim = [...host.querySelectorAll('button')].find((item) => item.textContent === 'Xác nhận chỗ')!;
    expect(claim).toBeDefined();
    await act(async () => { claim.click(); claim.click(); });
    expect(mocks.enroll).toHaveBeenCalledExactlyOnceWith(8, 31);
    expect(claim.disabled).toBe(true);
    await act(async () => reject(new ApiError('Suất giữ chỗ đã hết hạn', 409)));
    expect(host.textContent).toContain('Suất giữ chỗ đã hết hạn');
    expect(host.textContent).not.toContain('thành công!');
    expect(mocks.enroll).toHaveBeenCalledTimes(1);
    expect(mocks.waitlists).toHaveBeenCalledTimes(2);
  });

  it('confirms a notified offer and reloads enrollment and waitlist state', async () => {
    const booking = { id: 41, classId: 3, className: 'Yoga Flow', memberId: 9, sessionId: 8,
      sessionDate: '2099-10-19', startTime: '08:00:00', endTime: '09:00:00', status: 'booked',
      enrolledAt: '2099-10-01T08:00:00', cancelledAt: null, cancelReason: null };
    mocks.sessions.mockResolvedValue([{ ...session, bookedCount: 11 }]);
    mocks.waitlists.mockResolvedValueOnce([{ id: 31, classId: 3, className: 'Yoga Flow', memberId: 9,
      status: 'notified', requestedAt: '2099-10-01T08:00:00' }]).mockResolvedValueOnce([]);
    mocks.enrollments.mockResolvedValueOnce([]).mockResolvedValueOnce([booking]);
    mocks.enroll.mockResolvedValue(booking);
    await render();
    await act(async () => [...host.querySelectorAll('button')].find((item) => item.textContent === 'Xác nhận chỗ')!.click());
    expect(mocks.enroll).toHaveBeenCalledExactlyOnceWith(8, 31);
    expect(host.textContent).toContain('Đã đặt chỗ');
    expect(host.textContent).not.toContain('Đang giữ chỗ');
  });

  it('shows loading, then real sessions and waitlist action when class is full', async () => {
    let resolve!: (value: typeof session[]) => void;
    mocks.sessions.mockReturnValue(new Promise((done) => { resolve = done; }));
    await render();
    expect(host.textContent).toContain('Đang tải lịch học');
    await act(async () => resolve([session]));
    expect(host.textContent).toContain('Yoga Flow');
    expect(host.textContent).toContain('12 / 12');
    const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('Tham gia hàng chờ'));
    expect(button?.disabled).toBe(false);
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/member/packages');
  });

  it('shows empty schedule', async () => {
    mocks.sessions.mockResolvedValueOnce([]);
    await render();
    expect(host.textContent).toContain('Chưa có lịch học');
  });

  it('filters disciplines and weekdays without changing backend data', async () => {
    mocks.sessions.mockResolvedValue([session, { ...session, id: 9, className: 'Boxing Basics', disciplineName: 'Boxing', sessionDate: '2099-10-20' }]);
    await render();
    const yoga = [...host.querySelectorAll('button')].find((item) => item.textContent === 'Yoga')!;
    await act(async () => yoga.click());
    expect(host.textContent).toContain('Yoga Flow');
    expect(host.textContent).not.toContain('Boxing Basics');
    const select = host.querySelector('select')!;
    await act(async () => { select.value = '2'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.textContent).toContain('Không có buổi học phù hợp');
  });

  it('shows an error and retries the backend request', async () => {
    mocks.sessions.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([session]);
    await render();
    expect(host.textContent).toContain('Không tải được lịch học');
    const retry = [...host.querySelectorAll('button')].find((item) => item.textContent === 'Thử lại')!;
    await act(async () => retry.click());
    expect(host.textContent).toContain('Yoga Flow');
    expect(mocks.sessions).toHaveBeenCalledTimes(2);
  });

  it('keeps the schedule when waitlists fail and retries only waitlists', async () => {
    mocks.sessions.mockResolvedValue([session]);
    mocks.waitlists.mockRejectedValueOnce(new Error('waitlist offline')).mockResolvedValueOnce([]);
    await render();
    expect(host.textContent).toContain('Yoga Flow');
    expect([...host.querySelectorAll('h3')].some(heading => heading.textContent === 'Không tải được lịch học')).toBe(false);
    const tab = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('Lịch học của tôi'))!;
    await act(async () => tab.click());
    expect(host.textContent).toContain('Không tải được lịch học của tôi');
    const retry = [...host.querySelectorAll('button')].find((item) => item.textContent === 'Thử lại lịch học của tôi')!;
    await act(async () => retry.click());
    expect(host.textContent).not.toContain('Không tải được lịch học của tôi');
    expect(mocks.sessions).toHaveBeenCalledTimes(1);
    expect(mocks.waitlists).toHaveBeenCalledTimes(2);
  });

  it('disables booking for cancelled sessions and shows empty my-schedule when nothing booked', async () => {
    mocks.sessions.mockResolvedValue([{ ...session, status: 'cancelled' }]);
    await render();
    expect(host.textContent).toContain('Không thể đặt');
    const tab = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('Lịch học của tôi'))!;
    await act(async () => tab.click());
    expect(host.textContent).toContain('Chưa có lịch học đã đặt');
    expect(host.textContent).not.toContain('Hủy đặt chỗ');
  });

  it('marks a past session unavailable even when capacity remains', async () => {
    mocks.sessions.mockResolvedValue([{ ...session, sessionDate: '2020-10-19', bookedCount: 2 }]);
    await render();
    expect(host.textContent).toContain('Không thể đặt');
  });

  it('marks a session that has started today unavailable', async () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    mocks.sessions.mockResolvedValue([{ ...session, sessionDate: today, startTime: '00:00:00', endTime: '23:59:59', bookedCount: 2 }]);
    await render();
    expect(host.textContent).toContain('Không thể đặt');
  });
  it('clears rejected waitlist error when the week changes', async () => {
    mocks.sessions.mockResolvedValueOnce([session]).mockResolvedValueOnce([]);
    mocks.joinWaitlist.mockRejectedValue(new ApiError('Hội viên đã có chỗ trong lớp học này.', 400));
    await render();
    const join = [...host.querySelectorAll('button')].find((item) => item.textContent === 'Tham gia hàng chờ')!;
    await act(async () => join.click());
    expect(host.textContent).toContain('Hội viên đã có chỗ trong lớp học này.');
    await act(async () => [...host.querySelectorAll('button')].find((item) => item.textContent === 'Tuần kế tiếp')!.click());
    expect(host.textContent).toContain('Chưa có lịch học');
    expect(host.textContent).not.toContain('Hội viên đã có chỗ trong lớp học này.');
    expect(mocks.joinWaitlist).toHaveBeenCalledExactlyOnceWith(8);
  });

  it('clears old action error on discipline, day and tab changes', async () => {
    mocks.sessions.mockResolvedValue([session]);
    mocks.joinWaitlist.mockRejectedValue(new ApiError('Đã có chỗ', 400));
    await render();
    const join = () => [...host.querySelectorAll('button')].find((item) => item.textContent === 'Tham gia hàng chờ')!;
    await act(async () => join().click());
    await act(async () => [...host.querySelectorAll('button')].find((item) => item.textContent === 'Boxing')!.click());
    expect(host.textContent).not.toContain('Đã có chỗ');
    await act(async () => [...host.querySelectorAll('button')].find((item) => item.textContent === 'Yoga')!.click());
    await act(async () => join().click());
    const day = host.querySelector('select')!;
    await act(async () => { day.value = '2'; day.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.textContent).not.toContain('Đã có chỗ');
    await act(async () => { day.value = 'ALL'; day.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => join().click());
    await act(async () => [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('Lịch học của tôi'))!.click());
    expect(host.textContent).not.toContain('Đã có chỗ');
  });

  it('keeps a real schedule load error when changing filters', async () => {
    mocks.sessions.mockRejectedValue(new Error('offline'));
    await render();
    expect(host.textContent).toContain('Không tải được lịch học');
    await act(async () => [...host.querySelectorAll('button')].find((item) => item.textContent === 'Boxing')!.click());
    expect(host.textContent).toContain('Không tải được lịch học');
  });

  it('does not send duplicate waitlist requests while pending', async () => {
    mocks.sessions.mockResolvedValue([session]);
    let resolve!: (value: unknown) => void;
    mocks.joinWaitlist.mockReturnValue(new Promise((done) => { resolve = done; }));
    await render();
    const join = [...host.querySelectorAll('button')].find((item) => item.textContent === 'Tham gia hàng chờ')!;
    await act(async () => { join.click(); join.click(); });
    expect(mocks.joinWaitlist).toHaveBeenCalledTimes(1);
    expect(join.disabled).toBe(true);
    await act(async () => resolve({ id: 30 }));
  });

  it('keeps booking and cancellation working and blocks duplicate booking', async () => {
    const available = { ...session, bookedCount: 1 };
    const booked = { id: 41, classId: 3, className: 'Yoga Flow', memberId: 9, sessionId: 8,
      sessionDate: '2099-10-19', startTime: '08:00:00', endTime: '09:00:00', status: 'booked',
      enrolledAt: '2099-10-01T08:00:00', cancelledAt: null, cancelReason: null };
    mocks.sessions.mockResolvedValueOnce([available]).mockResolvedValueOnce([{ ...available, bookedCount: 2 }])
      .mockResolvedValueOnce([available]);
    mocks.enrollments.mockResolvedValueOnce([]).mockResolvedValueOnce([booked]).mockResolvedValueOnce([]);
    let finishBooking!: (value: unknown) => void;
    mocks.enroll.mockReturnValue(new Promise((done) => { finishBooking = done; }));
    mocks.cancelEnrollment.mockResolvedValue({ ...booked, status: 'cancelled' });
    await render();
    const book = [...host.querySelectorAll('button')].find((item) => item.getAttribute('aria-label') === 'Đặt chỗ ngay: Yoga Flow')!;
    await act(async () => { book.click(); book.click(); });
    expect(mocks.enroll).toHaveBeenCalledExactlyOnceWith(8);
    expect(book.disabled).toBe(true);
    await act(async () => finishBooking(booked));
    expect(host.textContent).toContain('2 / 12');
    await act(async () => [...host.querySelectorAll('button')].find((item) => item.textContent === 'Hủy đặt chỗ')!.click());
    expect(mocks.cancelEnrollment).not.toHaveBeenCalled();
    expect(host.querySelector('[role=dialog]')?.textContent).toContain('Yoga Flow');
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('dialog button')].find((item) => item.textContent === 'Giữ đặt chỗ')!.click());
    expect(mocks.cancelEnrollment).not.toHaveBeenCalled();
    await act(async () => [...host.querySelectorAll('button')].find((item) => item.textContent === 'Hủy đặt chỗ')!.click());
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('dialog button')].find((item) => item.textContent === 'Xác nhận hủy')!.click());
    expect(mocks.cancelEnrollment).toHaveBeenCalledExactlyOnceWith(41);
    expect(host.textContent).toContain('1 / 12');
  });
  it('does not revive an old action error after navigating while the request is pending', async () => {
    mocks.sessions.mockResolvedValueOnce([session]).mockResolvedValueOnce([]);
    let reject!: (reason: unknown) => void;
    mocks.joinWaitlist.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    await render();
    await act(async () => [...host.querySelectorAll('button')].find((item) => item.textContent === 'Tham gia hàng chờ')!.click());
    await act(async () => [...host.querySelectorAll('button')].find((item) => item.textContent === 'Tuần kế tiếp')!.click());
    await act(async () => reject(new ApiError('Lỗi buổi cũ', 400)));
    expect(host.textContent).toContain('Chưa có lịch học');
    expect(host.textContent).not.toContain('Lỗi buổi cũ');
  });

  it('restores a class waitlist from the API after remounting', async () => {
    mocks.sessions.mockResolvedValue([session]);
    mocks.waitlists.mockResolvedValue([{ id: 30, classId: 3, className: 'Yoga Flow', memberId: 9,
      status: 'waiting', requestedAt: '2099-10-01T08:00:00' }]);
    await render();
    expect(host.textContent).toContain('Đang chờ chỗ');
    await act(async () => root.unmount());
    root = createRoot(host);
    await render();
    expect(host.textContent).toContain('Đang chờ chỗ');
    expect(mocks.waitlists).toHaveBeenCalledTimes(2);
  });
});
