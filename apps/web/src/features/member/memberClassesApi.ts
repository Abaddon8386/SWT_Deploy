import { centerNowParts } from '../../shared/lib/centerTime';
import { addDays, mondayOf } from '../schedule/timetable';
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
export interface BulkCancelResult { cancelled: SessionBookingDto[]; skipped: BulkSkipped[] }

export const getClasses = () => apiFetch<GymClassDto[]>('/classes')
  .then((classes) => classes.filter((item) => isStandardDiscipline(item.disciplineName)));
// Center calendar week, Monday through Sunday, independent of the browser timezone.
export function currentWeek(weekOffset = 0): { fromDate: string; toDate: string } {
  const fromDate = addDays(mondayOf(centerNowParts().date), weekOffset * 7);
  return { fromDate, toDate: addDays(fromDate, 6) };
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
export const getMyBookings = () => apiFetch<SessionBookingDto[]>(`/classes/session-bookings/my?status=booked&from=${centerNowParts().date}`);
export const bookSession = (sessionId: number) => apiFetch<SessionBookingDto>(`/classes/sessions/${sessionId}/bookings`, { method: 'POST' });
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
