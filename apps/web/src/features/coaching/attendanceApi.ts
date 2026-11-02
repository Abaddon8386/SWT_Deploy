import { apiFetch } from '../../shared/api/client';
import { getProfile } from '../member/profileApi';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceStudent {
  id: number; // ID bản ghi enrollment hoặc attendance
  memberId: number;
  fullName: string;
  membershipCode: string;
  avatarUrl?: string;
  status: AttendanceStatus;
  progressScore: number; // 1 - 100
  notes: string;
}

export interface CoachClassSession {
  id: number;
  className: string;
  disciplineName?: string;
  roomName: string;
  sessionDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  bookedCount: number;
  capacity: number;
}

export interface BatchAttendancePayloadItem {
  memberId: number;
  status: AttendanceStatus;
  progressScore: number;
  notes?: string;
}

export interface BatchAttendancePayload {
  sessionId: number;
  attendances: BatchAttendancePayloadItem[];
}

interface SessionAttendanceRosterResponse {
  sessionId?: number;
  members?: Array<{
    attendanceId?: number | null;
    memberId: number;
    memberCode?: string; membershipCode?: string;
    fullName: string;
    status?: AttendanceStatus | null; attendanceStatus?: AttendanceStatus | null;
    notes?: string | null;
    progressScore?: number | null;
  }>;
}

export const attendanceApi = {
  /**
   * Lấy danh sách buổi học phụ trách của HLV hôm nay
   */
  getCoachSessions: async (): Promise<CoachClassSession[]> => {
    const profile = await getProfile();
    const sessions = await apiFetch<CoachClassSession[]>(`/classes/sessions?coachId=${profile.userId}`);
    if (!Array.isArray(sessions)) throw new Error('Invalid session data');
    return sessions;
  },

  /**
   * Lấy danh sách học viên đã book trong buổi học
   */
  getSessionStudents: async (sessionId: number): Promise<AttendanceStudent[]> => {
    const res = await apiFetch<AttendanceStudent[] | SessionAttendanceRosterResponse>(
      `/attendance/sessions/${sessionId}`
    );
    if (Array.isArray(res)) {
      return res;
    }
    if (res && !Array.isArray(res) && Array.isArray(res.members)) {
      return res.members.map((m, idx) => ({
        id: m.attendanceId ?? m.memberId ?? idx + 1,
        memberId: m.memberId,
        fullName: m.fullName,
        membershipCode: m.membershipCode || m.memberCode || `MB-${m.memberId}`,
        status: ((m.attendanceStatus || m.status) as AttendanceStatus) || 'present',
        progressScore: m.progressScore != null ? Number(m.progressScore) : 80,
        notes: m.notes || '',
      }));
    }
    throw new Error('Invalid attendance roster data');
  },

  /**
   * Lưu điểm danh & Đánh giá hàng loạt (Batch Save trong 1 bước)
   */
  saveBatchAttendance: async (
    sessionId: number,
    payload: BatchAttendancePayloadItem[]
  ): Promise<{ success: boolean; updatedCount: number; message: string }> => {
    return await apiFetch<{ success: boolean; updatedCount: number; message: string }>(
      `/attendance/sessions/${sessionId}/batch`,
      {
        method: 'POST',
        body: JSON.stringify({
          records: payload.map((item) => ({
            memberId: item.memberId,
            status: item.status,
            progressScore: item.progressScore,
            notes: item.notes || '',
          })),
        }),
      }
    );

  },
};
