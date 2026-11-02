import { apiFetch } from '../../shared/api/client';
import { getProfile } from '../member/profileApi';

export interface CoachSession {
  id: number;
  classId: number;
  className: string;
  disciplineId?: number;
  disciplineName?: string;
  coachId: number;
  coachName?: string;
  roomId?: number;
  roomName?: string;
  sessionDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm:ss or HH:mm
  endTime: string; // HH:mm:ss or HH:mm
  status: 'scheduled' | 'completed' | 'cancelled' | string;
  cancelReason?: string | null;
  capacity: number;
  bookedCount: number;
  level?: string;
  description?: string;
}

export interface EnrolledStudent {
  id: number; // enrollment ID
  memberId: number;
  membershipCode: string;
  fullName: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  fitnessGoal: string;
  healthNotes: string;
  fitnessLevel: 'beginner' | 'intermediate' | 'advanced' | string;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  enrolledAt: string;
  status: 'booked' | 'attended' | 'cancelled' | string;
}

export const coachingApi = {
  getCoachSchedule: async (
    coachId?: number | string,
    fromDate?: string,
    toDate?: string
  ): Promise<CoachSession[]> => {
    const params = new URLSearchParams();
    if (coachId) params.set('coachId', String(coachId));
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);

    const url = `/classes/sessions${params.toString() ? `?${params.toString()}` : ''}`;
    const sessions = await apiFetch<CoachSession[]>(url);
    if (Array.isArray(sessions)) {
      return sessions;
    }
    throw new Error('Dữ liệu lịch dạy không hợp lệ');
  },

  getCoachWeeklySchedule: async (
    mondayStr: string
  ): Promise<CoachSession[]> => {
    const profile = await getProfile();
    const sunday = new Date(`${mondayStr}T00:00:00Z`);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    return coachingApi.getCoachSchedule(profile.userId, mondayStr, sunday.toISOString().slice(0, 10));
  },

  getSessionStudents: async (sessionId: number, _classId?: number): Promise<EnrolledStudent[]> => {
    void _classId; // Preserve the existing optional argument for callers.
    const res = await apiFetch<EnrolledStudent[]>(
      `/classes/sessions/${sessionId}/students`
    );
    if (Array.isArray(res)) {
      return res;
    }
    throw new Error('Dữ liệu học viên không hợp lệ');
  },

  getAllAssignedStudents: async (coachId?: string | number): Promise<EnrolledStudent[]> => {
    const id = coachId ?? (await getProfile()).userId;
    const sessions = await coachingApi.getCoachSchedule(id);
    const classSessions = [...new Map(sessions.map(session => [session.classId, session])).values()];
    const rosters = await Promise.all(classSessions.map(session => coachingApi.getSessionStudents(session.id)));
    return [...new Map(rosters.flat().map(student => [student.memberId, student])).values()];
  },
};
