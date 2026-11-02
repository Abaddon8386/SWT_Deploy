import { afterEach, describe, expect, it, vi } from 'vitest';
import { attendanceApi } from './attendanceApi';

describe('attendanceApi persistence', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('propagates a rejected batch instead of reporting a successful local save', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Batch rejected' }), { status: 500 }));
    vi.stubGlobal('fetch', request);
    await expect(attendanceApi.saveBatchAttendance(7, [{ memberId: 8, status: 'present', progressScore: 90 }])).rejects.toThrow('Batch rejected');
    expect(request.mock.calls[0][0]).toBe('/api/v1/attendance/sessions/7/batch');
  });
  it('uses the numeric authenticated profile ID and preserves an empty schedule', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { userId: 42 } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [] })));
    vi.stubGlobal('fetch', request);
    expect(await attendanceApi.getCoachSessions()).toEqual([]);
    expect(request.mock.calls[1][0]).toBe('/api/v1/classes/sessions?coachId=42');
  });

  it('surfaces roster failures instead of fabricating members', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Roster failed' }), { status: 500 })));
    await expect(attendanceApi.getSessionStudents(7)).rejects.toThrow('Roster failed');
  });

});
