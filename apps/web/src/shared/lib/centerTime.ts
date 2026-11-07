import { getIntlLocale } from '../i18n/language';
/**
 * Giờ hiển thị luôn theo múi giờ trung tâm (UTC+7, không có giờ mùa hè), kể cả khi trình duyệt đặt múi giờ khác.
 * Backend trả `LocalDateTime` không kèm offset (giờ trung tâm) hoặc `Instant` có `Z`; cả hai đều được hiểu đúng.
 */
export const CENTER_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const HAS_OFFSET = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;

export function parseCenterTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const text = value.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00+07:00`
    : HAS_OFFSET.test(text) ? text : `${text}+07:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function format(value: string | null | undefined, options: Intl.DateTimeFormatOptions, fallback: string): string {
  const date = parseCenterTime(value);
  return date ? new Intl.DateTimeFormat(getIntlLocale(), { timeZone: CENTER_TIME_ZONE, hourCycle: 'h23', ...options }).format(date) : fallback;
}

/** 14:05 */
export const formatCenterTime = (value: string | null | undefined, fallback = '—') =>
  format(value, { hour: '2-digit', minute: '2-digit' }, fallback);

/** 14:05:09 */
export const formatCenterTimeSeconds = (value: string | null | undefined, fallback = '—') =>
  format(value, { hour: '2-digit', minute: '2-digit', second: '2-digit' }, fallback);

/** 02/11/2026 */
export const formatCenterDate = (value: string | null | undefined, fallback = '—') =>
  format(value, { day: '2-digit', month: '2-digit', year: 'numeric' }, fallback);

/** 14:05 02/11/2026 */
export function formatCenterDateTime(value: string | null | undefined, fallback = '—'): string {
  const time = formatCenterTime(value, '');
  return time ? `${time} ${formatCenterDate(value)}` : fallback;
}

/** Giờ trong ngày "17:30:00" → "17:30" (giờ học từ API không kèm ngày). */
export const formatClockTime = (value: string | null | undefined, fallback = '—') =>
  value && /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : fallback;

/** "17:30–18:30" */
export const formatTimeRange = (start: string | null | undefined, end: string | null | undefined) =>
  `${formatClockTime(start)}–${formatClockTime(end)}`;

/** Ngày "YYYY-MM-DD" và giờ "HH:mm" hiện tại theo múi giờ trung tâm; so sánh được trực tiếp dưới dạng chuỗi. */
export function centerNowParts(now = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CENTER_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (name: string) => parts.find((item) => item.type === name)!.value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}
