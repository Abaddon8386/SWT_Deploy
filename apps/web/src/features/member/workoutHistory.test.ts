import { describe, expect, it } from 'vitest';
import { monthRange, workoutVisits } from './workoutHistoryPresentation';
import type { CheckinDto } from '../reception/checkinApi';
const visit = (id: number, checkInTime: string, status = 'GRANTED', checkOutTime: string | null = null): CheckinDto => ({ id, checkInTime, status, checkOutTime, method: 'qr' });
describe('QR workout history', () => {
  it('keeps granted entries once after checkout, excludes denials and future entries, sorts newest first', () => {
    const result = workoutVisits([visit(1, '2026-11-01T08:00:00', 'GRANTED', '2026-11-01T09:00:00'), visit(2, '2026-11-01T10:00:00'), visit(3, '2026-11-01T11:00:00', 'DENIED'), visit(4, '2026-11-02T08:00:00'), visit(5, 'invalid')], '2026-11', new Date('2026-11-01T12:00:00+07:00'));
    expect(result.map(row => row.id)).toEqual([2, 1]);
    expect(new Set(result.map(row => row.day)).size).toBe(1);
  });
  it('groups UTC and offsetless timestamps by Vietnam date near midnight', () => {
    const result = workoutVisits([visit(1, '2026-10-31T17:00:00Z'), visit(2, '2026-11-01T00:01:00'), visit(3, '2026-10-31T16:59:59Z')], '2026-11', new Date('2026-11-02T00:00:00+07:00'));
    expect(result.map(row => row.day)).toEqual(['2026-11-01', '2026-11-01']);
  });
  it('calculates leap years and December/January boundaries with Monday first', () => {
    expect(monthRange('2024-02')).toEqual({ fromDate: '2024-02-01', toDate: '2024-02-29', days: 29, offset: 3 });
    expect(monthRange('2027-01')).toEqual({ fromDate: '2027-01-01', toDate: '2027-01-31', days: 31, offset: 4 });
  });
});

