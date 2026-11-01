import { apiFetch } from '../../shared/api/client';

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

export interface WaitlistDto {
  id: number; classId: number; className: string; memberId: number;
  status: string; requestedAt: string;
}

export const getClasses = () => apiFetch<GymClassDto[]>('/classes');
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
  return apiFetch<ClassSessionDto[]>(`/classes/sessions?fromDate=${fromDate}&toDate=${toDate}`);
};
export const getMyEnrollments = () => apiFetch<EnrollmentDto[]>('/classes/enrollments/my');
export const getMyWaitlists = () => apiFetch<WaitlistDto[]>('/classes/waitlists/my');
export const enroll = (sessionId: number, waitlistId?: number) => apiFetch<EnrollmentDto>(
  `/classes/sessions/${sessionId}/enroll${waitlistId === undefined ? '' : `?waitlistId=${waitlistId}`}`,
  { method: 'POST' },
);
export const cancelEnrollment = (enrollmentId: number) => apiFetch<EnrollmentDto>(`/classes/enrollments/${enrollmentId}`, { method: 'DELETE' });
export const joinWaitlist = (sessionId: number) => apiFetch<WaitlistDto>(`/classes/sessions/${sessionId}/waitlist`, { method: 'POST' });
export const leaveWaitlist = (waitlistId: number) => apiFetch<WaitlistDto>(`/classes/waitlists/${waitlistId}`, { method: 'DELETE' });

// Parse YYYY-MM-DD as a calendar date. new Date('YYYY-MM-DD') can shift days by timezone.
export function weekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

export function filterSessions(sessions: ClassSessionDto[], discipline: string, day: string): ClassSessionDto[] {
  const needle = discipline.toLocaleLowerCase();
  return sessions.filter((session) => {
    const disc = session.disciplineName.toLocaleLowerCase();
    const matchDisc = discipline === 'ALL' || disc === needle || disc.includes(needle);
    return matchDisc && (day === 'ALL' || weekday(session.sessionDate) === Number(day));
  });
}
