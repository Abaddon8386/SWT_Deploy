import { apiFetch } from '../../shared/api/client';
import type { Discipline, Room } from '../manager/catalogApi';
import { isStandardDiscipline } from '../../shared/lib/disciplines';

export interface ClassSessionDto {
  id: number;
  classId: number;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  cancelReason?: string | null;
  className?: string;
  roomName?: string;
  coachName?: string;
  capacity?: number;
  bookedCount?: number;
}

export interface ClassItem {
  id: number;
  name: string;
  disciplineId: number;
  disciplineName?: string;
  coachId: number;
  coachName?: string;
  roomId: number;
  roomName?: string;
  capacity: number;
  level?: string;
  description?: string | null;
  status: 'ACTIVE' | 'ARCHIVED' | 'INACTIVE';
  schedule?: string;
  activeSessions?: number;
}

export interface CoachUser {
  id: number;
  fullName: string;
  email: string;
  phone?: string | null;
  status: string;
  gender?: string | null;
}

export interface CreateClassPayload {
  name: string;
  disciplineId: number;
  coachId: number;
  roomId: number;
  capacity: number;
  level?: string;
  description?: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
}

export interface CreateSessionPayload {
  classId: number;
  sessionDate: string;
  startTime: string;
  endTime: string;
}

interface UserDto {
  id: number;
  roleCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  gender?: string | null;
  status: string;
}

export const classesApi = {
  /**
   * Lấy danh sách lớp học từ API
   */
  getClasses: async (): Promise<ClassItem[]> => {
    return apiFetch<ClassItem[]>('/classes');
  },

  /**
   * Lấy danh sách buổi học / lịch học
   */
  getSessions: async (classId?: number): Promise<ClassSessionDto[]> => {
    const list = await apiFetch<ClassSessionDto[]>(
      classId ? `/classes/sessions?classId=${classId}` : '/classes/sessions'
    );
    return classId ? list.filter((s) => s.classId === classId) : list;
  },

  /**
   * Tạo lớp học mới (hỗ trợ tạo luôn buổi học đầu tiên trong 1 bước nếu truyền kèm sessionDate/startTime/endTime)
   */
  createClass: async (payload: CreateClassPayload): Promise<ClassItem> => {
    return apiFetch<ClassItem>('/classes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Thêm buổi học mới cho lớp qua POST /api/v1/classes/{id}/sessions
   */
  createSession: (payload: CreateSessionPayload) =>
    apiFetch<ClassSessionDto>(`/classes/${payload.classId}/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        sessionDate: payload.sessionDate,
        startTime: payload.startTime,
        endTime: payload.endTime,
      }),
    }),

  /**
   * BR-02: Lấy danh sách phòng chỉ bao gồm phòng 'available'
   */
  getAvailableRooms: async (): Promise<Room[]> => {
    const rooms = await apiFetch<Room[]>('/rooms');
    return rooms.filter((r) => r.status === 'available');
  },

  /**
   * BR-02: Lấy danh sách huấn luyện viên chỉ bao gồm HLV role 'COACH' và status 'active'
   * Ưu tiên endpoint chuyên biệt /classes/coaches (cho phép cả RECEPTIONIST và CENTER_MANAGER),
   * fallback sang /users nếu cần.
   */
  getActiveCoaches: async (): Promise<CoachUser[]> => {
    try {
      const coaches = await apiFetch<CoachUser[]>('/classes/coaches');
      if (Array.isArray(coaches)) {
        return coaches
          .filter((u) => (!('roleCode' in u) || (u as unknown as UserDto).roleCode === 'COACH') && u.status === 'active')
          .map((u) => ({
            id: u.id,
            fullName: u.fullName,
            email: u.email,
            phone: u.phone,
            status: u.status,
            gender: u.gender ?? null,
          }));
      }
    } catch {
      // Fallback sang /users cho môi trường cũ
    }
    const users = await apiFetch<UserDto[]>('/users');
    return users
      .filter((u) => u.roleCode === 'COACH' && u.status === 'active')
      .map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        status: u.status,
        gender: u.gender ?? null,
      }));
  },

  /**
   * Lấy danh sách bộ môn thể thao
   */
  getDisciplines: () => apiFetch<Discipline[]>('/disciplines')
    .then((items) => items.filter((item) => isStandardDiscipline(item.name))),
};
