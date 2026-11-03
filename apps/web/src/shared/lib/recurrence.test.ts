import { describe, expect, it } from 'vitest';
import { addDays, expandRecurrence, isoWeekday, recurrenceEnd, recurrenceRequest } from './recurrence';

describe('recurrence', () => {
  it('maps dates to ISO weekdays and adds days across month and year ends', () => {
    expect(isoWeekday('2026-11-02')).toBe(1);
    expect(isoWeekday('2026-11-08')).toBe(7);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('ends a week after six days and a month one calendar month later, clamped to short months', () => {
    expect(recurrenceEnd('2026-11-02', 'week')).toBe('2026-11-08');
    expect(recurrenceEnd('2026-11-02', 'month')).toBe('2026-12-01');
    expect(recurrenceEnd('2027-01-31', 'month')).toBe('2027-02-27');
  });

  it('expands to the chosen weekdays and defaults to the start weekday', () => {
    expect(expandRecurrence('2026-11-02', { period: 'week', days: [5, 1, 3] })).toEqual(['2026-11-02', '2026-11-04', '2026-11-06']);
    expect(expandRecurrence('2026-11-02', { period: 'month', days: [] })).toHaveLength(5);
    expect(expandRecurrence('2026-11-02', { period: 'once', days: [3] })).toEqual(['2026-11-02']);
    expect(expandRecurrence('bad', { period: 'week', days: [] })).toEqual([]);
  });

  it('builds the request fields only for standing bookings', () => {
    expect(recurrenceRequest({ period: 'once', days: [] }, '2026-11-02')).toBeNull();
    expect(recurrenceRequest({ period: 'month', days: [] }, '2026-11-04')).toEqual({ period: 'month', daysOfWeek: [3] });
  });
});
