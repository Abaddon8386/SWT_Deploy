import { afterEach, describe, expect, it, vi } from 'vitest';
import { courtsApi, centerDate, dateAfter } from './courtsApi';

afterEach(() => vi.unstubAllGlobals());

it('uses the court resource and booking endpoints with distinct identifiers', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) });
  vi.stubGlobal('fetch', fetcher);
  await courtsApi.courts('Cầu lông');
  await courtsApi.availability(5, '2026-11-03');
  await courtsApi.book({ roomId: 5, date: '2026-11-03', startTime: '09:00' });
  await courtsApi.my(1);
  await courtsApi.list('2026-11-03', '5', 2);
  await courtsApi.cancel(17, 'Sân bảo trì');
  expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
    '/api/v1/courts?discipline=C%E1%BA%A7u%20l%C3%B4ng',
    '/api/v1/courts/5/availability?date=2026-11-03',
    '/api/v1/court-bookings', '/api/v1/court-bookings/my?page=1&size=20',
    '/api/v1/court-bookings?date=2026-11-03&page=2&size=20&roomId=5',
    '/api/v1/court-bookings/17/cancel',
  ]);
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ roomId: 5, date: '2026-11-03', startTime: '09:00' });
  expect(fetcher.mock.calls[5][1].method).toBe('PATCH');
  expect(JSON.parse(fetcher.mock.calls[5][1].body)).toEqual({ reason: 'Sân bảo trì' });
});

it('uses the center calendar date and handles month and year boundaries', () => {
  expect(centerDate(new Date('2026-12-31T18:00:00Z'))).toBe('2027-01-01');
  expect(dateAfter('2026-12-31', 7)).toBe('2027-01-07');
});

describe('booking time helpers', () => {
  it('formats the center clock, not the browser clock', async () => {
    const { centerDateTime, bookingEnded, isCourtDiscipline } = await import('./courtsApi');
    expect(centerDateTime(new Date('2026-11-02T03:30:00Z'))).toBe('2026-11-02T10:30');
    expect(centerDateTime(new Date('2026-11-02T17:30:00Z'))).toBe('2026-11-03T00:30');
    expect(bookingEnded({ date: '2026-11-02', endTime: '10:00:00' }, '2026-11-02T10:00')).toBe(true);
    expect(bookingEnded({ date: '2026-11-02', endTime: '11:00:00' }, '2026-11-02T10:00')).toBe(false);
    expect(isCourtDiscipline('Cầu lông')).toBe(true);
    expect(isCourtDiscipline('Tennis nâng cao')).toBe(false);
  });
});
