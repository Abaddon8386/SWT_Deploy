import { hhmm, shortDate, toMinutes, todayISO, type TimetableEvent } from '../schedule/timetable';

interface SessionLike {
  id: number;
  className: string;
  roomName?: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status?: string;
  bookedCount: number;
  capacity: number;
}

interface PtBookingLike {
  id: number;
  memberName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: string;
}

export function hasEnded(session: Pick<SessionLike, 'sessionDate' | 'endTime'>, now: Date): boolean {
  const today = todayISO(now);
  return session.sessionDate < today
    || (session.sessionDate === today && toMinutes(session.endTime) <= now.getHours() * 60 + now.getMinutes());
}

/**
 * Buổi dạy của HLV thành khối trên thời khóa biểu.
 * mode "schedule": còn chỗ / đầy / đã qua / đã hủy. mode "attendance": đã điểm danh / chưa điểm danh (đã diễn ra) / sắp diễn ra / đã hủy.
 */
export function coachSessionEvents(
  sessions: SessionLike[],
  mode: 'schedule' | 'attendance',
  savedSessionIds: ReadonlySet<number> = new Set(),
  now: Date = new Date(),
): TimetableEvent[] {
  return sessions.map((session) => {
    const ended = hasEnded(session, now);
    const seats = `${session.bookedCount}/${session.capacity}`;
    let tone: TimetableEvent['tone'];
    let badge: string;
    let statusText: string;
    if (session.status === 'cancelled') {
      tone = 'cancelled'; badge = 'Đã hủy'; statusText = 'đã hủy';
    } else if (mode === 'attendance') {
      if (savedSessionIds.has(session.id)) { tone = 'mine'; badge = 'Đã điểm danh'; statusText = 'đã điểm danh'; }
      else if (ended) { tone = 'full'; badge = 'Chưa điểm danh'; statusText = 'đã diễn ra, chưa điểm danh'; }
      else { tone = 'open'; badge = seats; statusText = 'sắp diễn ra'; }
    } else if (ended) {
      tone = 'past'; badge = seats; statusText = 'đã qua';
    } else if (session.bookedCount >= session.capacity) {
      tone = 'full'; badge = 'Đầy'; statusText = 'đã đầy';
    } else {
      tone = 'open'; badge = seats; statusText = 'còn chỗ';
    }
    return {
      id: String(session.id),
      date: session.sessionDate,
      startTime: session.startTime,
      endTime: session.endTime,
      title: session.className,
      meta: session.roomName || undefined,
      badge,
      tone,
      ariaLabel: `${session.className}, ${shortDate(session.sessionDate)} ${hhmm(session.startTime)}–${hhmm(session.endTime)}${session.roomName ? `, ${session.roomName}` : ''}, ${seats} học viên, ${statusText}`,
    };
  });
}

/** Buổi kèm 1:1 đã xác nhận, hiện cùng bảng với lớp nhóm. id có tiền tố `pt-`. */
export function ptBookingEvents(bookings: PtBookingLike[]): TimetableEvent[] {
  return bookings
    .filter((booking) => booking.status === 'confirmed')
    .map((booking) => ({
      id: `pt-${booking.id}`,
      date: booking.bookingDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      title: `PT 1:1 · ${booking.memberName}`,
      badge: '1:1',
      tone: 'mine' as const,
      ariaLabel: `Kèm riêng 1:1 với ${booking.memberName}, ${shortDate(booking.bookingDate)} ${hhmm(booking.startTime)}–${hhmm(booking.endTime)}`,
    }));
}
