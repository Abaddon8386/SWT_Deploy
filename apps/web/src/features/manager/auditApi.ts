import { staffSourceError } from '../operations/staffI18n';
import { apiFetch } from '../../shared/api/client';

export interface AuditLogItem {
  id: number;
  userId: number;
  userFullName: string;
  userEmail: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'CANCEL' | 'SCAN' | string;
  entityType: string;
  entityId: number;
  oldValue: Record<string, unknown> | string | null;
  newValue: Record<string, unknown> | string | null;
  ipAddress?: string | null;
  createdAt: string;
}

export interface AuditLogFilter {
  userId?: number;
  entityType?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

export interface PageResult<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface ClassOccupancyItem {
  classId: number;
  className: string;
  disciplineId: number | null;
  disciplineName: string | null;
  roomName?: string | null;
  capacity: number;
  enrolledCount: number;
  presentCount: number;
  utilizationRate: number; // Tỷ lệ lấp đầy % (enrolled / capacity * 100)
  attendanceRate: number; // Tỷ lệ đi học % (present / enrolled * 100)
}

export const auditApi = {
  /**
   * Lấy danh sách Audit Log có lọc và phân trang (GET /api/v1/audit-logs)
   */
  getAuditLogs: async (filter?: AuditLogFilter): Promise<PageResult<AuditLogItem>> => {
    const params = new URLSearchParams();
    if (filter?.userId) params.set('user_id', String(filter.userId));
    if (filter?.entityType && filter.entityType !== 'ALL') params.set('entity_type', filter.entityType);
    if (filter?.action && filter.action !== 'ALL') params.set('action', filter.action);
    if (filter?.from) params.set('from', filter.from);
    if (filter?.to) params.set('to', filter.to);
    params.set('page', String(filter?.page ?? 0));
    params.set('size', String(filter?.size ?? 10));

    const res = await apiFetch<PageResult<AuditLogItem>>(`/admin/audit-logs?${params.toString()}`);
    if (!res || !Array.isArray(res.content)) {
      throw staffSourceError('Dữ liệu nhật ký kiểm toán không hợp lệ.', 'Invalid audit log data.');
    }
    return res;
  },

  /**
   * Lấy báo cáo tỷ lệ lấp đầy lớp học theo bộ môn (GET /api/v1/reports/class-utilization)
   */
  getClassOccupancy: async (
    startDate?: string,
    endDate?: string,
    disciplineId?: number
  ): Promise<ClassOccupancyItem[]> => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (disciplineId) params.set('disciplineId', String(disciplineId));
    const qs = params.toString() ? `?${params.toString()}` : '';

    const res = await apiFetch<ClassOccupancyItem[]>(`/reports/class-utilization${qs}`);
    if (!Array.isArray(res)) {
      throw staffSourceError('Dữ liệu tỷ lệ lấp đầy không hợp lệ.', 'Invalid occupancy data.');
    }
    return res;
  },
};
