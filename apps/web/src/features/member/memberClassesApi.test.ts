import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClasses, getSessions, getMyWaitlists, enroll, cancelEnrollment, joinWaitlist, leaveWaitlist, filterSessions, currentWeek, type ClassSessionDto } from './memberClassesApi';

const session: ClassSessionDto = {
  id: 8, classId: 3, className: 'Yoga Flow', disciplineId: 2, disciplineName: 'Yoga',
  coachId: 4, coachName: 'An', roomId: 5, roomName: 'Studio', sessionDate: '2026-10-19',
  startTime: '08:00:00', endTime: '09:00:00', status: 'scheduled', cancelReason: null,
  capacity: 12, bookedCount: 12,
};

describe('memberClassesApi', () => {
  it('identifies an explicit claim while leaving ordinary enrollment unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ data: {} }) });
    vi.stubGlobal('fetch', fetchMock);
    await enroll(8, 31);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/classes/sessions/8/enroll?waitlistId=31');
  });
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reads real class, session and waitlist DTOs through apiFetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [session] }) });
    vi.stubGlobal('fetch', fetchMock);
    expect((await getSessions())[0].bookedCount).toBe(12);
    await getClasses();
    await getMyWaitlists();
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      expect.stringMatching(/^\/api\/v1\/classes\/sessions\?fromDate=/), '/api/v1/classes', '/api/v1/classes/waitlists/my',
    ]);
  });

  it('uses distinct session and enrollment IDs for write endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: {} }) });
    vi.stubGlobal('fetch', fetchMock);
    await enroll(8); await cancelEnrollment(17); await joinWaitlist(8); await leaveWaitlist(23);
    expect(fetchMock.mock.calls.map(([path, init]) => [path, init.method])).toEqual([
      ['/api/v1/classes/sessions/8/enroll', 'POST'],
      ['/api/v1/classes/enrollments/17', 'DELETE'],
      ['/api/v1/classes/sessions/8/waitlist', 'POST'],
      ['/api/v1/classes/waitlists/23', 'DELETE'],
    ]);
  });

  it('filters discipline and weekday from the date string without timezone conversion', () => {
    const boxing = { ...session, id: 9, disciplineName: 'Boxing', sessionDate: '2026-10-20' };
    expect(filterSessions([session, boxing], 'Yoga', '1')).toEqual([session]);
    expect(filterSessions([session, boxing], 'ALL', '2')).toEqual([boxing]);
    expect(filterSessions([session, boxing], 'ALL', 'ALL')).toHaveLength(2);
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
});
