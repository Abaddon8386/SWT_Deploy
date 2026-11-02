import { centerNowParts } from '../../shared/lib/centerTime';

export function formatCoachName(name?: string | null): string {
  if (!name) return 'Huấn luyện viên';
  return name.replace(/^HLV\s+/i, '').trim();
}

/** Buổi đã kết thúc theo giờ trung tâm (không phụ thuộc múi giờ của trình duyệt). */
export function isSessionCompleted(
  booking: { bookingDate: string; endTime: string; status?: string },
  now = centerNowParts(),
): boolean {
  if (booking.status === 'completed') return true;
  if (booking.status === 'cancelled') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.bookingDate) || !/^\d{2}:\d{2}/.test(booking.endTime)) return false;
  return `${booking.bookingDate} ${booking.endTime.slice(0, 5)}` <= `${now.date} ${now.time}`;
}
