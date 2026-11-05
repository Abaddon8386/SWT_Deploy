import { describe, expect, it } from 'vitest';
import { addDays, fitHourRange, layoutDayEvents, mondayOf, overlapsHour, weekDays, type TimetableEvent } from './timetable';

const ev = (id: string, startTime: string, endTime: string): TimetableEvent => ({
  id, date: '2026-11-09', startTime, endTime, title: id, tone: 'open', ariaLabel: id,
});

describe('timetable helpers', () => {
  it('finds the Monday of any weekday, including Sunday', () => {
    expect(mondayOf('2026-11-09')).toBe('2026-11-09');
    expect(mondayOf('2026-11-12')).toBe('2026-11-09');
    expect(mondayOf('2026-11-15')).toBe('2026-11-09');
    expect(mondayOf('2026-11-16')).toBe('2026-11-16');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(weekDays('2026-11-09')).toHaveLength(7);
    expect(weekDays('2026-11-09')[6]).toBe('2026-11-15');
  });

  it('detects which hour slots an event touches', () => {
    const e = ev('a', '08:30:00', '10:00:00');
    expect(overlapsHour(e, 7)).toBe(false);
    expect(overlapsHour(e, 8)).toBe(true);
    expect(overlapsHour(e, 9)).toBe(true);
    expect(overlapsHour(e, 10)).toBe(false);
  });

  it('positions events as a share of the 06:00–22:00 range', () => {
    const [placed] = layoutDayEvents([ev('a', '06:00', '07:00')]);
    expect(placed.topPct).toBe(0);
    expect(placed.heightPct).toBeCloseTo(100 / 16);
    expect(placed.lanes).toBe(1);
  });

  it('puts overlapping events side by side and keeps later ones full width', () => {
    const placed = layoutDayEvents([ev('a', '08:00', '09:30'), ev('b', '09:00', '10:00'), ev('c', '11:00', '12:00')]);
    const byId = Object.fromEntries(placed.map((item) => [item.event.id, item]));
    expect(byId.a.lanes).toBe(2);
    expect(byId.b.lanes).toBe(2);
    expect(byId.a.lane).not.toBe(byId.b.lane);
    expect(byId.c.lanes).toBe(1);
  });

  it('drops events outside the range and clamps ones that straddle its edge', () => {
    const placed = layoutDayEvents([ev('early', '04:00', '05:30'), ev('late', '21:00', '23:00')]);
    expect(placed.map((item) => item.event.id)).toEqual(['late']);
    expect(placed[0].topPct + placed[0].heightPct).toBeCloseTo(100);
  });

  it('fits the hour range to the week, at least 8 hours, inside 06:00–22:00', () => {
    expect(fitHourRange([])).toHaveLength(16);
    expect(fitHourRange([ev('a', '09:15', '10:00'), ev('b', '17:00', '19:30')])).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(fitHourRange([ev('a', '20:00', '21:00')])).toEqual([14, 15, 16, 17, 18, 19, 20, 21]);
    expect(fitHourRange([ev('a', '05:00', '06:30'), ev('late', '23:00', '23:30')])).toEqual([6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it('positions events against a custom hour range', () => {
    const [placed] = layoutDayEvents([ev('a', '10:00', '11:00')], 8, 12);
    expect(placed.topPct).toBe(50);
    expect(placed.heightPct).toBe(25);
  });
});
