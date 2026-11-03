/** Khung giờ hiển thị của thời khóa biểu tuần: 06:00 – 22:00. */
export const TIMETABLE_START_HOUR = 6;
export const TIMETABLE_END_HOUR = 22;
export const TIMETABLE_HOURS: number[] = Array.from(
  { length: TIMETABLE_END_HOUR - TIMETABLE_START_HOUR },
  (_, index) => TIMETABLE_START_HOUR + index,
);

const RANGE_START_MIN = TIMETABLE_START_HOUR * 60;
const RANGE_END_MIN = TIMETABLE_END_HOUR * 60;
const RANGE_MINUTES = RANGE_END_MIN - RANGE_START_MIN;

export type TimetableTone = 'open' | 'mine' | 'full' | 'past' | 'cancelled' | 'neutral';

export interface TimetableEvent {
  id: string;
  /** YYYY-MM-DD theo lịch địa phương. */
  date: string;
  /** HH:mm hoặc HH:mm:ss. */
  startTime: string;
  endTime: string;
  title: string;
  meta?: string;
  badge?: string;
  tone: TimetableTone;
  ariaLabel: string;
}

export interface PositionedEvent {
  event: TimetableEvent;
  lane: number;
  lanes: number;
  topPct: number;
  heightPct: number;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** YYYY-MM-DD -> Date lúc 12:00 địa phương (tránh lệch ngày do múi giờ khi cộng/trừ ngày). */
export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Thứ Hai của tuần chứa ngày `iso` (tuần Thứ 2 – Chủ nhật). */
export function mondayOf(iso: string): string {
  const date = parseISODate(iso);
  return addDays(iso, -((date.getDay() + 6) % 7));
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

export function hhmm(time: string): string {
  return time.slice(0, 5);
}

export function hourLabel(hour: number): string {
  return `${pad(hour)}:00`;
}

const WEEKDAY_LABELS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export function weekdayLabel(iso: string): string {
  return WEEKDAY_LABELS[parseISODate(iso).getDay()];
}

/** dd/MM */
export function shortDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

export function weekRangeLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  return `${shortDate(weekStart)} – ${shortDate(end)}/${end.slice(0, 4)}`;
}

/** Buổi học có nằm (một phần) trong khung 06:00–22:00 không. */
export function isWithinRange(event: Pick<TimetableEvent, 'startTime' | 'endTime'>): boolean {
  return toMinutes(event.endTime) > RANGE_START_MIN && toMinutes(event.startTime) < RANGE_END_MIN;
}

/** Buổi học có chạm vào ô giờ [hour, hour+1) không. */
export function overlapsHour(event: Pick<TimetableEvent, 'startTime' | 'endTime'>, hour: number): boolean {
  return toMinutes(event.startTime) < (hour + 1) * 60 && toMinutes(event.endTime) > hour * 60;
}

/**
 * Xếp các buổi học trong cùng một ngày vào làn song song: buổi chồng giờ đứng cạnh nhau,
 * mỗi cụm chồng giờ chia đều chiều rộng cột.
 */
export function layoutDayEvents(events: TimetableEvent[]): PositionedEvent[] {
  const sorted = events
    .filter(isWithinRange)
    .map((event) => ({
      event,
      start: Math.max(toMinutes(event.startTime), RANGE_START_MIN),
      end: Math.min(toMinutes(event.endTime), RANGE_END_MIN),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end || a.event.id.localeCompare(b.event.id));

  const result: PositionedEvent[] = [];
  let cluster: { event: TimetableEvent; start: number; end: number; lane: number }[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  const flush = () => {
    const lanes = laneEnds.length;
    for (const item of cluster) {
      result.push({
        event: item.event,
        lane: item.lane,
        lanes,
        topPct: ((item.start - RANGE_START_MIN) / RANGE_MINUTES) * 100,
        heightPct: (Math.max(item.end - item.start, 15) / RANGE_MINUTES) * 100,
      });
    }
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    cluster.push({ ...item, lane });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length > 0) flush();
  return result;
}
