/** Weekly / monthly standing bookings, mirroring the API's RecurrenceDates so the preview matches what is booked. */
export type RecurrencePeriod = 'once' | 'week' | 'month';
export interface RecurrenceChoice { period: RecurrencePeriod; days: number[] }
export interface SkippedOccurrence { date: string; code: string; message: string }

/** ISO weekday labels, Monday (1) to Sunday (7). */
export const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const parts = (date: string): [number, number, number] => {
  const [y, m, d] = date.split('-').map(Number);
  return [y, m, d];
};
const iso = (value: Date) => value.toISOString().slice(0, 10);
const utcNoon = (date: string) => { const [y, m, d] = parts(date); return new Date(Date.UTC(y, m - 1, d, 12)); };

export function isoWeekday(date: string): number {
  const day = utcNoon(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(date: string, days: number): string {
  const value = utcNoon(date);
  value.setUTCDate(value.getUTCDate() + days);
  return iso(value);
}

/** Last date of the window: 7 days for a week, one calendar month (clamped to the month length) for a month. */
export function recurrenceEnd(start: string, period: Exclude<RecurrencePeriod, 'once'>): string {
  if (period === 'week') return addDays(start, 6);
  const [y, m, d] = parts(start);
  const lastDayOfNextMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const sameDayNextMonth = iso(new Date(Date.UTC(y, m, Math.min(d, lastDayOfNextMonth), 12)));
  return addDays(sameDayNextMonth, -1);
}

export function expandRecurrence(start: string, choice: RecurrenceChoice): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return [];
  if (choice.period === 'once') return [start];
  const days = choice.days.length ? choice.days : [isoWeekday(start)];
  const end = recurrenceEnd(start, choice.period);
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    if (days.includes(isoWeekday(date))) dates.push(date);
  }
  return dates;
}

export const recurrenceRequest = (choice: RecurrenceChoice, start: string) =>
  choice.period === 'once' ? null : {
    period: choice.period,
    daysOfWeek: choice.days.length ? choice.days : [isoWeekday(start)],
  };
