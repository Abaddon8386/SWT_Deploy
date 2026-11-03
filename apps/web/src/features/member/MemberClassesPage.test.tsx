import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberClassesPage } from './MemberClassesPage';
import { ApiError } from '../../shared/api/client';
import { clearNotices, getNotices } from '../../shared/lib/portalNotices';

const noticeText = () => getNotices().map((notice) => notice.message).join(' ');

const mocks = vi.hoisted(() => ({
  sessions: vi.fn(),
  enrollments: vi.fn(),
  bookings: vi.fn(),
  upcoming: vi.fn(),
  book: vi.fn(),
  bookMany: vi.fn(),
  cancelBooking: vi.fn(),
  cancelBookings: vi.fn(),
  cancelEnrollment: vi.fn(),
  favoriteDisciplines: vi.fn(),
  mySubscription: vi.fn(),
  toggleFavoriteDiscipline: vi.fn(),
  coaches: vi.fn(),
  coachSlots: vi.fn(),
  myCoachBookings: vi.fn(),
}));

vi.mock('./memberClassesApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('./memberClassesApi')>();
  return {
    ...original,
    getSessions: mocks.sessions,
    getMyEnrollments: mocks.enrollments,
    getMyBookings: mocks.bookings,
    getUpcomingSessions: mocks.upcoming,
    bookSession: mocks.book,
    bookSessions: mocks.bookMany,
    cancelBooking: mocks.cancelBooking,
    cancelBookings: mocks.cancelBookings,
    cancelEnrollment: mocks.cancelEnrollment,
  };
});

vi.mock('./favoriteDisciplinesApi', () => ({
  getFavoriteDisciplines: mocks.favoriteDisciplines,
  toggleFavoriteDiscipline: mocks.toggleFavoriteDiscipline,
}));

vi.mock('./memberCardApi', () => ({
  getMySubscription: mocks.mySubscription,
}));

vi.mock('./coachBookingApi', () => ({
  getCoaches: mocks.coaches,
  getAvailableSlots: mocks.coachSlots,
  getMyCoachBookings: mocks.myCoachBookings,
  createCoachBooking: vi.fn(),
  cancelCoachBooking: vi.fn(),
  getMemberQuotaStatus: vi.fn().mockResolvedValue({ packageName: 'GOLD', monthlyQuota: 3, usedThisMonth: 1, remainingQuota: 2 }),
  getCoachSchedule: vi.fn().mockResolvedValue([]),
}));

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
    clearNotices();
    mocks.sessions.mockReset();
    mocks.mySubscription.mockReset().mockResolvedValue(null);
    mocks.enrollments.mockReset();
    mocks.bookings.mockReset().mockResolvedValue([]);
    mocks.upcoming.mockReset();
    mocks.book.mockReset();
    mocks.bookMany.mockReset();
    mocks.cancelBooking.mockReset();
    mocks.cancelBookings.mockReset();
    mocks.cancelEnrollment.mockReset();
    mocks.favoriteDisciplines.mockReset();
    mocks.toggleFavoriteDiscipline.mockReset();
    mocks.coaches.mockReset();
    mocks.coachSlots.mockReset();
    mocks.myCoachBookings.mockReset();
    mocks.enrollments.mockResolvedValue([]);
    mocks.favoriteDisciplines.mockResolvedValue([]);
    mocks.toggleFavoriteDiscipline.mockResolvedValue([]);
    mocks.coaches.mockResolvedValue([]);
    mocks.coachSlots.mockResolvedValue([]);
    mocks.myCoachBookings.mockResolvedValue([]);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
  async function render(path = '/') { await act(async () => root.render(<MemoryRouter initialEntries={[path]}><MemberClassesPage /></MemoryRouter>)); }
  const manySessions = () => Array.from({ length: 14 }, (_, index) => ({ ...session, id: 100 + index, classId: 100 + index,
    className: `Buổi ${index + 1}`, disciplineName: index < 7 ? 'Yoga' : 'Boxing', bookedCount: 1 }));
  async function clickText(text: string) {
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes(text))!.click());
  }

  it('opens on the discipline from the sport page link and ignores unknown values', async () => {
    mocks.sessions.mockResolvedValue([
      { ...session, id: 1, className: 'Gym sáng', disciplineName: 'Gym' },
      { ...session, id: 2, className: 'Boxing tối', disciplineName: 'Boxing & Kickfit' },
    ]);
    await render('/member/classes?discipline=Boxing');
    expect(host.textContent).toContain('Boxing tối');
    expect(host.textContent).not.toContain('Gym sáng');
    await act(async () => root.unmount());
    root = createRoot(host);
    await render('/member/classes?discipline=Karate');
    expect(host.textContent).toContain('Gym sáng');
    expect(host.textContent).toContain('Boxing tối');
  });

  it('offers an accessible circular plus that books the actual session', async () => {
    mocks.sessions.mockResolvedValue([{ ...session, bookedCount: 1 }]);
    mocks.book.mockResolvedValue({});
    await render();
    const plus = host.querySelector<HTMLButtonElement>('.member-class-enroll')!;
    expect(plus).not.toBeNull();
    expect(plus.getAttribute('aria-label')).toContain('Yoga Flow');
    expect(plus.querySelector('[aria-hidden="true"]')?.textContent).toBe('+');
    await act(async () => plus.click());
    expect(mocks.book).toHaveBeenCalledExactlyOnceWith(8);
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
    expect(mocks.sessions).toHaveBeenCalledTimes(1);
  });

  it('waits for personal booking data before offering any booking action', async () => {
    mocks.sessions.mockResolvedValue([session, { ...session, id: 9, classId: 4, bookedCount: 1 }]);
    let finish!: (value: unknown[]) => void;
    mocks.enrollments.mockReturnValue(new Promise(done => { finish = done; }));
    await render();
    expect(host.querySelector('.member-class-enroll')).toBeNull();
    await act(async () => finish([]));
    expect(host.querySelector('.member-class-enroll')).not.toBeNull();
    expect(host.textContent).toContain('Buổi đã đầy');
    expect(host.textContent).not.toContain('Tham gia hàng chờ');
  });

  it('shows loading, then real sessions and marks a full session as full', async () => {
    let resolve!: (value: typeof session[]) => void;
    mocks.sessions.mockReturnValue(new Promise((done) => { resolve = done; }));
    await render();
    expect(host.textContent).toContain('Đang tải lịch học');
    await act(async () => resolve([session]));
    expect(host.textContent).toContain('Yoga Flow');
    expect(host.textContent).toContain('12 / 12');
    const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('Buổi đã đầy'));
    expect(button?.disabled).toBe(true);
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/member/packages');
  });

  it('hides the buy-a-package reminder when the member already has an active package', async () => {
    const end = new Date(Date.now() + 20 * 86400000).toLocaleDateString('en-CA');
    mocks.mySubscription.mockResolvedValue({ id: 1, status: 'active', endDate: end });
    mocks.sessions.mockResolvedValue([session]);
    await render();
    expect(host.textContent).toContain('Yoga Flow');
    expect(host.textContent).not.toContain('Cần gói tập đang hoạt động để đặt chỗ');
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

  it('keeps the schedule when personal bookings fail to load and retries only them', async () => {
    mocks.sessions.mockResolvedValue([session]);
    mocks.bookings.mockRejectedValueOnce(new Error('bookings offline')).mockResolvedValueOnce([]);
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
    expect(mocks.bookings).toHaveBeenCalledTimes(2);
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

  it('clears rejected booking error when the week changes', async () => {
    mocks.sessions.mockResolvedValueOnce([{ ...session, bookedCount: 1 }]).mockResolvedValueOnce([]);
    mocks.book.mockRejectedValue(new ApiError('Hội viên đã có chỗ trong lớp học này.', 400));
    await render();
    const join = host.querySelector<HTMLButtonElement>('.member-class-enroll')!;
    await act(async () => join.click());
    expect(host.textContent).toContain('Hội viên đã có chỗ trong lớp học này.');
    await act(async () => [...host.querySelectorAll('button')].find((item) => item.textContent === 'Tuần kế tiếp')!.click());
    expect(host.textContent).toContain('Chưa có lịch học');
    expect(host.textContent).not.toContain('Hội viên đã có chỗ trong lớp học này.');
    expect(mocks.book).toHaveBeenCalledExactlyOnceWith(8);
  });

  it('clears old action error on discipline, day and tab changes', async () => {
    mocks.sessions.mockResolvedValue([{ ...session, bookedCount: 1 }]);
    mocks.book.mockRejectedValue(new ApiError('Đã có chỗ', 400));
    await render();
    const join = () => host.querySelector<HTMLButtonElement>('.member-class-enroll')!;
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

  it('does not send duplicate booking requests while pending', async () => {
    mocks.sessions.mockResolvedValue([{ ...session, bookedCount: 1 }]);
    let resolve!: (value: unknown) => void;
    mocks.book.mockReturnValue(new Promise((done) => { resolve = done; }));
    await render();
    const join = host.querySelector<HTMLButtonElement>('.member-class-enroll')!;
    await act(async () => { join.click(); join.click(); });
    expect(mocks.book).toHaveBeenCalledTimes(1);
    expect(join.disabled).toBe(true);
    await act(async () => resolve({ id: 30 }));
  });

  it('keeps booking and cancellation working per session and blocks duplicate booking', async () => {
    const available = { ...session, bookedCount: 1 };
    const booked = { id: 41, sessionId: 8, classId: 3, className: 'Yoga Flow', memberId: 9, sessionDate: '2099-10-19',
      startTime: '08:00:00', endTime: '09:00:00', roomName: 'Studio', coachName: 'An', status: 'booked',
      bookedAt: '2099-10-01T08:00:00', cancelledAt: null, cancelReason: null, batchId: null };
    mocks.sessions.mockResolvedValueOnce([available]).mockResolvedValueOnce([{ ...available, bookedCount: 2 }])
      .mockResolvedValueOnce([available]);
    mocks.bookings.mockResolvedValueOnce([]).mockResolvedValueOnce([booked]).mockResolvedValueOnce([]);
    let finishBooking!: (value: unknown) => void;
    mocks.book.mockReturnValue(new Promise((done) => { finishBooking = done; }));
    await render();
    const book = [...host.querySelectorAll('button')].find((item) => item.getAttribute('aria-label') === 'Đặt chỗ ngay: Yoga Flow')!;
    await act(async () => { book.click(); book.click(); });
    expect(mocks.book).toHaveBeenCalledTimes(1);
    expect(book.disabled).toBe(true);
    await act(async () => finishBooking({ id: 41 }));
    expect(noticeText()).toContain('Đã đặt chỗ lớp "Yoga Flow"');
    const cancel = [...host.querySelectorAll('button')].find((item) => item.textContent === 'Hủy buổi này')!;
    await act(async () => cancel.click());
    const confirm = [...host.querySelectorAll('button')].find((item) => item.textContent === 'Xác nhận hủy')!;
    mocks.cancelBooking.mockResolvedValueOnce({ id: 41, status: 'cancelled' });
    await act(async () => confirm.click());
    expect(mocks.cancelBooking).toHaveBeenCalledWith(41);
    expect(mocks.cancelEnrollment).not.toHaveBeenCalled();
  });

  it('sorts sessions chronologically by date and start-time, grouping by date, and disabling overlapping sessions', async () => {
    const session1 = {
      ...session,
      id: 8,
      className: 'Yoga Flow',
      sessionDate: '2099-10-19',
      startTime: '08:00:00',
      endTime: '09:30:00',
      bookedCount: 5,
    };
    const session2 = {
      ...session,
      id: 9,
      className: 'Pilates Core',
      sessionDate: '2099-10-19',
      startTime: '08:30:00',
      endTime: '10:00:00',
      bookedCount: 3,
    };
    const session3 = {
      ...session,
      id: 10,
      className: 'Boxing Burn',
      sessionDate: '2099-10-19',
      startTime: '10:00:00',
      endTime: '11:00:00',
      bookedCount: 2,
    };

    mocks.sessions.mockResolvedValue([session3, session1, session2]);
    mocks.enrollments.mockResolvedValue([
      {
        id: 41,
        classId: 3,
        className: 'Yoga Flow',
        memberId: 9,
        sessionId: 8,
        sessionDate: '2099-10-19',
        startTime: '08:00:00',
        endTime: '09:30:00',
        status: 'booked',
        enrolledAt: '2099-10-01T08:00:00',
        cancelledAt: null,
        cancelReason: null,
      },
    ]);

    await render();

    // Grouped under day-group-2099-10-19
    expect(host.querySelector('[data-testid="day-group-2099-10-19"]')).not.toBeNull();

    // Verify chronological card titles order: Yoga Flow (08:00), Pilates Core (08:30), Boxing Burn (10:00)
    const titles = [...host.querySelectorAll('h3.row-card__title')].map((el) => el.textContent);
    expect(titles).toEqual(['Yoga Flow', 'Pilates Core', 'Boxing Burn']);

    // Overlapping session #9 (08:30-10:00) is marked and disabled
    expect(host.querySelector('[data-testid="overlap-badge-9"]')).not.toBeNull();
    const overlapBtn = host.querySelector('[data-testid="overlap-btn-9"]') as HTMLButtonElement;
    expect(overlapBtn).not.toBeNull();
    expect(overlapBtn.disabled).toBe(true);
    expect(overlapBtn.textContent).toBe('Trùng giờ đã đặt');

    // Non-overlapping adjacent session #10 (10:00-11:00) remains bookable
    expect(host.querySelector('[data-testid="overlap-badge-10"]')).toBeNull();
    const bookBtn = [...host.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Đặt chỗ ngay:')) as HTMLButtonElement;
    expect(bookBtn).not.toBeUndefined();
    expect(bookBtn.disabled).toBe(false);
  });

  it('filters favorite disciplines and toggles favorite status', async () => {
    // Yoga has disciplineId: 2, Boxing has disciplineId: 4
    mocks.favoriteDisciplines.mockResolvedValue([2]);
    mocks.sessions.mockResolvedValue([
      session,
      { ...session, id: 9, className: 'Boxing Basics', disciplineId: 4, disciplineName: 'Boxing', sessionDate: '2099-10-20' },
    ]);
    await render();

    expect(host.textContent).toContain('Yoga Flow');
    expect(host.textContent).toContain('Boxing Basics');

    // Click quick filter ⭐ Bộ môn yêu thích
    const favChip = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Bộ môn yêu thích'))!;
    expect(favChip).not.toBeUndefined();
    await act(async () => favChip.click());

    // Only Yoga Flow (disciplineId: 2) is shown
    expect(host.textContent).toContain('Yoga Flow');
    expect(host.textContent).not.toContain('Boxing Basics');
  });

  it('renders coach 1:1 booking tab and switches correctly', async () => {
    mocks.sessions.mockResolvedValue([session]);
    mocks.coaches.mockResolvedValue([
      { id: 101, fullName: 'Trần Văn Nam', specialization: 'Gym & Thể hình', defaultHourlyRate: 200000 },
    ]);
    await render();

    const ptTab = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Đặt lịch HLV 1:1'))!;
    expect(ptTab).not.toBeUndefined();
    await act(async () => ptTab.click());
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(host.textContent).toContain('Chọn Huấn luyện viên cá nhân (PT 1:1)');
    expect(host.textContent).toContain('Trần Văn Nam');
  });

  describe('per-session booking options', () => {
    const seat = (id: number, sessionId: number, className: string, startTime: string, endTime: string) => ({
      id, sessionId, classId: sessionId, className, memberId: 9, sessionDate: '2099-10-19', startTime, endTime,
      roomName: 'Studio', coachName: 'An', status: 'booked', bookedAt: '2099-10-01T08:00:00',
      cancelledAt: null, cancelReason: null, batchId: null,
    });
    const week = () => [
      { ...session, id: 8, classId: 3, className: 'Yoga Flow', bookedCount: 1 },
      { ...session, id: 9, classId: 4, className: 'Pilates Core', startTime: '10:00:00', endTime: '11:00:00', bookedCount: 2 },
      { ...session, id: 10, classId: 5, className: 'Boxing Burn', startTime: '12:00:00', endTime: '13:00:00', bookedCount: 12 },
    ];

    it('selects every bookable session of the displayed range and books them in one request', async () => {
      mocks.sessions.mockResolvedValue(week());
      mocks.bookMany.mockResolvedValue({
        booked: [seat(1, 8, 'Yoga Flow', '08:00:00', '09:00:00')],
        skipped: [{ id: 9, date: '2099-10-19', code: 'SCHEDULING_SESSION_FULL', message: 'Buổi học đã đầy chỗ' }],
      });
      await render();
      expect(host.querySelector('input[type="checkbox"]')).toBeNull();
      await clickText('Đặt nhiều buổi');
      expect(host.textContent).toContain('Đã chọn 0 buổi');
      expect(host.querySelector('.member-class-enroll')).toBeNull();
      await clickText('Chọn tất cả 2 buổi có thể đặt');
      expect(host.textContent).toContain('Đã chọn 2 buổi');
      await clickText('Đặt 2 buổi');
      expect(mocks.bookMany).toHaveBeenCalledExactlyOnceWith([8, 9]);
      expect(mocks.book).not.toHaveBeenCalled();
      expect(host.textContent).toContain('Kết quả đặt nhiều buổi');
      expect(host.textContent).toContain('Đã đặt 1 buổi, chưa đặt được 1 buổi');
      expect(host.textContent).toContain('19/10/2099: Buổi học đã đầy chỗ');
      expect(host.textContent).toContain('Đã chọn 0 buổi');
    });

    it('lets the member untick sessions before booking and never selects full ones', async () => {
      mocks.sessions.mockResolvedValue(week());
      mocks.bookMany.mockResolvedValue({ booked: [], skipped: [] });
      await render();
      await clickText('Đặt nhiều buổi');
      const boxes = () => [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
      expect(boxes()).toHaveLength(2); // the full Boxing session offers no checkbox
      await act(async () => boxes()[1].click());
      expect(host.textContent).toContain('Đã chọn 1 buổi');
      await clickText('Đặt 1 buổi');
      expect(mocks.bookMany).toHaveBeenCalledExactlyOnceWith([9]);
      expect(host.textContent).toContain('Không đặt được buổi nào');
    });

    it('loads the next 30 days for a monthly booking', async () => {
      mocks.sessions.mockResolvedValue([]);
      mocks.upcoming.mockResolvedValue(week());
      await render();
      await clickText('30 ngày tới');
      expect(mocks.upcoming).toHaveBeenCalledTimes(1);
      expect(host.textContent).toContain('30 ngày tới');
      await clickText('Đặt nhiều buổi');
      await clickText('Chọn tất cả 2 buổi có thể đặt');
      expect(host.textContent).toContain('Đã chọn 2 buổi');
    });

    it('does not offer a session that clashes with a booked one and shows booked sessions as cancellable', async () => {
      mocks.sessions.mockResolvedValue([
        { ...session, id: 8, classId: 3, className: 'Yoga Flow', bookedCount: 1 },
        { ...session, id: 9, classId: 4, className: 'Pilates Core', startTime: '08:30:00', endTime: '09:30:00', bookedCount: 1 },
      ]);
      mocks.bookings.mockResolvedValue([seat(41, 8, 'Yoga Flow', '08:00:00', '09:00:00')]);
      await render();
      expect(host.textContent).toContain('Hủy buổi này');
      expect(host.querySelector('[data-testid="overlap-btn-9"]')).not.toBeNull();
      await clickText('Đặt nhiều buổi');
      expect(host.textContent).toContain('Chọn tất cả 0 buổi có thể đặt');
    });

    it('cancels several booked sessions at once from my schedule', async () => {
      mocks.sessions.mockResolvedValue([]);
      mocks.bookings.mockResolvedValue([
        seat(41, 8, 'Yoga Flow', '08:00:00', '09:00:00'),
        seat(42, 9, 'Pilates Core', '10:00:00', '11:00:00'),
      ]);
      mocks.cancelBookings.mockResolvedValue({
        cancelled: [seat(41, 8, 'Yoga Flow', '08:00:00', '09:00:00')],
        skipped: [{ id: 42, date: '2099-10-19', code: 'SCHEDULING_BOOKING_TOO_LATE', message: 'Buổi học đã bắt đầu' }],
      });
      await render();
      await clickText('Lịch học của tôi');
      expect(host.textContent).toContain('Buổi học đã đặt (2)');
      await clickText('Chọn tất cả');
      expect(host.textContent).toContain('Đã chọn 2 buổi');
      await clickText('Hủy 2 buổi');
      expect(mocks.cancelBookings).not.toHaveBeenCalled(); // confirmation first
      await clickText('Xác nhận hủy');
      expect(mocks.cancelBookings).toHaveBeenCalledExactlyOnceWith([41, 42]);
      expect(host.textContent).toContain('Kết quả hủy nhiều buổi');
      expect(host.textContent).toContain('Buổi học đã bắt đầu');
    });
  });
});
