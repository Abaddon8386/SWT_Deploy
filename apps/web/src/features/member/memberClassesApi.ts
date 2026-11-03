import { apiFetch } from '../../shared/api/client';
import { isStandardDiscipline, matchesDiscipline } from '../../shared/lib/disciplines';

export interface GymClassDto {
  id: number; name: string; disciplineId: number; disciplineName: string;
  coachId: number; coachName: string; roomId: number; roomName: string;
  capacity: number; level: string; description: string | null; status: string;
}

export interface ClassSessionDto {
  id: number; classId: number; className: string; disciplineId: number;
  disciplineName: string; coachId: number; coachName: string; roomId: number;
  roomName: string; sessionDate: string; startTime: string; endTime: string;
  status: string; cancelReason: string | null; capacity: number; bookedCount: number;
}

export interface EnrollmentDto {
  id: number; classId: number; className: string; memberId: number;
  sessionId: number | null; sessionDate: string | null; startTime: string | null;
  endTime: string | null; status: string; enrolledAt: string;
  cancelledAt: string | null; cancelReason: string | null;
}

/** One seat in one session (the per-session booking feature, as opposed to a class-wide enrollment). */
export interface SessionBookingDto {
  id: number; sessionId: number; classId: number; className: string; memberId: number;
  sessionDate: string; startTime: string; endTime: string; roomName: string | null;
  coachName: string | null; status: string; bookedAt: string; cancelledAt: string | null;
  cancelReason: string | null; batchId: string | null;
}

/** An id a bulk request could not process, with the API error code and a localised reason. */
export interface BulkSkipped { id: number; date: string | null; code: string; message: string }
export interface BulkBookResult { booked: SessionBookingDto[]; skipped: BulkSkipped[] }
export interface BulkCancelResult { cancelled: SessionBookingDto[]; skipped: BulkSkipped[] }

export const getClasses = () => apiFetch<GymClassDto[]>('/classes')
  .then((classes) => classes.filter((item) => isStandardDiscipline(item.disciplineName)));
// Current local calendar week, Monday through Sunday. Date strings have no UTC conversion.
export function currentWeek(weekOffset = 0): { fromDate: string; toDate: string } {
  const monday = new Date();
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7 + weekOffset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const date = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return { fromDate: date(monday), toDate: date(sunday) };
}

export const getSessions = (weekOffset = 0) => {
  const { fromDate, toDate } = currentWeek(weekOffset);
  return apiFetch<ClassSessionDto[]>(`/classes/sessions?fromDate=${fromDate}&toDate=${toDate}`)
    .then((sessions) => sessions.filter((item) => isStandardDiscipline(item.disciplineName)));
};
/** Buổi học trong khoảng ngày tùy ý (thời khóa biểu tuần). */
export const getSessionsBetween = (fromDate: string, toDate: string) =>
  apiFetch<ClassSessionDto[]>(`/classes/sessions?fromDate=${fromDate}&toDate=${toDate}`)
    .then((sessions) => sessions.filter((item) => isStandardDiscipline(item.disciplineName)));
/** Lượt đặt buổi của tôi trong khoảng ngày (gồm cả buổi đã học), bỏ lượt đã hủy ở phía gọi. */
export const getMyBookingsBetween = (from: string, to: string) =>
  apiFetch<SessionBookingDto[]>(`/classes/session-bookings/my?from=${from}&to=${to}`);
export const UPCOMING_DAYS = 30;
const isoDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
/** Today through the next 30 days, in local calendar dates. */
export function upcomingRange(days = UPCOMING_DAYS): { fromDate: string; toDate: string } {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + days);
  return { fromDate: isoDate(start), toDate: isoDate(end) };
}
export const getUpcomingSessions = () => {
  const { fromDate, toDate } = upcomingRange();
  return apiFetch<ClassSessionDto[]>(`/classes/sessions?fromDate=${fromDate}&toDate=${toDate}`)
    .then((sessions) => sessions.filter((item) => isStandardDiscipline(item.disciplineName)));
};
export const getMyBookings = () => apiFetch<SessionBookingDto[]>(`/classes/session-bookings/my?status=booked&from=${upcomingRange(0).fromDate}`);
export const bookSession = (sessionId: number) => apiFetch<SessionBookingDto>(`/classes/sessions/${sessionId}/bookings`, { method: 'POST' });
export const bookSessions = (sessionIds: number[]) => apiFetch<BulkBookResult>('/classes/session-bookings/bulk', {
  method: 'POST', body: JSON.stringify({ sessionIds }),
});
export const cancelBooking = (bookingId: number) => apiFetch<SessionBookingDto>(`/classes/session-bookings/${bookingId}`, { method: 'DELETE' });
export const cancelBookings = (bookingIds: number[]) => apiFetch<BulkCancelResult>('/classes/session-bookings/cancel', {
  method: 'POST', body: JSON.stringify({ bookingIds }),
});
export const getMyEnrollments = () => apiFetch<EnrollmentDto[]>('/classes/enrollments/my');
export const cancelEnrollment = (enrollmentId: number) => apiFetch<EnrollmentDto>(`/classes/enrollments/${enrollmentId}`, { method: 'DELETE' });

// Parse YYYY-MM-DD as a calendar date. new Date('YYYY-MM-DD') can shift days by timezone.
export function weekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

export function filterSessions(sessions: ClassSessionDto[], discipline: string, day: string): ClassSessionDto[] {
  return sessions.filter((session) => {
    const matchDisc = discipline === 'ALL' || matchesDiscipline(session.disciplineName, discipline);
    return matchDisc && (day === 'ALL' || weekday(session.sessionDate) === Number(day));
  });
}
