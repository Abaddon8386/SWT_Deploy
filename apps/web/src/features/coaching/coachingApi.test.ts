import { afterEach, describe, expect, it, vi } from 'vitest';
import { coachingApi } from './coachingApi';

describe('coachingApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the numeric profile ID and preserves an empty schedule', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { userId: 42 } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [] })));
    vi.stubGlobal('fetch', fetchMock);

    expect(await coachingApi.getCoachWeeklySchedule('2026-10-19')).toEqual([]);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/classes/sessions?coachId=42&fromDate=2026-10-19&toDate=2026-10-25');
  });

  it('preserves an empty student list and propagates failures', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Không thể tải' }), { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await coachingApi.getSessionStudents(3)).toEqual([]);
    await expect(coachingApi.getSessionStudents(3)).rejects.toThrow('Không thể tải');
  });
  it('loads assigned students through real coach sessions and deduplicates members', async () => {
    const student = { id: 5, memberId: 9, fullName: 'Actual member' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [{ id: 1, classId: 10 }, { id: 2, classId: 11 }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [student] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [student] })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await coachingApi.getAllAssignedStudents(42)).toEqual([student]);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/classes/sessions?coachId=42');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps assigned students empty and surfaces failed requests', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Unavailable' }), { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await coachingApi.getAllAssignedStudents(42)).toEqual([]);
    await expect(coachingApi.getAllAssignedStudents(42)).rejects.toThrow('Unavailable');
  });

});
