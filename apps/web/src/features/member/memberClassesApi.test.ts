import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookSession, cancelBooking, cancelBookings, getMyBookings, getClasses, getSessions, cancelEnrollment, filterSessions, currentWeek, type ClassSessionDto } from './memberClassesApi';

const session: ClassSessionDto = {
  id: 8, classId: 3, className: 'Yoga Flow', disciplineId: 2, disciplineName: 'Yoga',
  coachId: 4, coachName: 'An', roomId: 5, roomName: 'Studio', sessionDate: '2026-10-19',
  startTime: '08:00:00', endTime: '09:00:00', status: 'scheduled', cancelReason: null,
  capacity: 12, bookedCount: 12,
};

describe('memberClassesApi', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reads real class and session DTOs through apiFetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [session] }) });
    vi.stubGlobal('fetch', fetchMock);
    expect((await getSessions())[0].bookedCount).toBe(12);
    await getClasses();
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      expect.stringMatching(/^\/api\/v1\/classes\/sessions\?fromDate=/), '/api/v1/classes',
    ]);
  });

  it('uses the enrollment ID to cancel a class-wide enrollment', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: {} }) });
    vi.stubGlobal('fetch', fetchMock);
    await cancelEnrollment(17);
    expect(fetchMock.mock.calls.map(([path, init]) => [path, init.method])).toEqual([
      ['/api/v1/classes/enrollments/17', 'DELETE'],
    ]);
  });

  it('filters discipline and weekday from the date string without timezone conversion', () => {
    const boxing = { ...session, id: 9, disciplineName: 'Boxing', sessionDate: '2026-10-20' };
    expect(filterSessions([session, boxing], 'Yoga', '1')).toEqual([session]);
    expect(filterSessions([session, boxing], 'ALL', '2')).toEqual([boxing]);
    expect(filterSessions([session, boxing], 'ALL', 'ALL')).toHaveLength(2);
  });

  it('includes the portal strength disciplines when selecting the main Gym group', () => {
    const strength = { ...session, disciplineName: 'Olympic Strength' };
    expect(filterSessions([session, strength], 'Gym', 'ALL')).toEqual([strength]);
    expect(filterSessions([session, strength], 'Yoga', 'ALL')).toEqual([session]);
  });

  it.each([
    ['2026-11-01T16:59:00Z', '2026-10-26', '2026-11-01'],
    ['2026-11-01T17:00:00Z', '2026-11-02', '2026-11-08'],
    ['2026-12-31T18:00:00Z', '2026-12-28', '2027-01-03'],
  ])('uses the center week at %s across midnight and year boundaries', (instant, fromDate, toDate) => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(instant));
      expect(currentWeek()).toEqual({ fromDate, toDate });
      const previous = currentWeek(-1);
      const next = currentWeek(1);
      expect(new Date(fromDate).getTime() - new Date(previous.fromDate).getTime()).toBe(7 * 86400000);
      expect(new Date(next.toDate).getTime() - new Date(toDate).getTime()).toBe(7 * 86400000);
    } finally { vi.useRealTimers(); }
  });

  it.each([
    [-1, '2026-10-26', '2026-11-01'],
    [0, '2026-11-02', '2026-11-08'],
    [1, '2026-11-09', '2026-11-15'],
  ])('requests calendar week %s with inclusive Monday/Sunday bounds', async (offset, from, to) => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-04T12:00:00+07:00'));
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) });
      vi.stubGlobal('fetch', fetchMock);
      await getSessions(offset);
      expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/classes/sessions?fromDate=' + from + '&toDate=' + to);
    } finally { vi.useRealTimers(); }
  });

  it('requests only the current Monday–Sunday week', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await getSessions();
    const { fromDate, toDate } = currentWeek();
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/v1/classes/sessions?fromDate=${fromDate}&toDate=${toDate}`);
    const localDay = (value: string) => {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day).getDay();
    };
    expect(localDay(fromDate)).toBe(1);
    expect(localDay(toDate)).toBe(0);
  });

  it('talks to the per-session booking endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { booked: [], skipped: [], cancelled: [] } }) });
    vi.stubGlobal('fetch', fetchMock);
    await bookSession(8);
    await cancelBooking(41);
    await cancelBookings([41, 42]);
    await getMyBookings();
    const calls = fetchMock.mock.calls;
    expect(calls[0][0]).toBe('/api/v1/classes/sessions/8/bookings');
    expect(calls[0][1]).toMatchObject({ method: 'POST' });
    expect(calls[1][0]).toBe('/api/v1/classes/session-bookings/41');
    expect(calls[1][1]).toMatchObject({ method: 'DELETE' });
    expect(calls[2][0]).toBe('/api/v1/classes/session-bookings/cancel');
    expect(JSON.parse(calls[2][1].body)).toEqual({ bookingIds: [41, 42] });
    expect(calls[3][0]).toMatch(/^\/api\/v1\/classes\/session-bookings\/my\?status=booked&from=\d{4}-\d{2}-\d{2}$/);
  });

});
