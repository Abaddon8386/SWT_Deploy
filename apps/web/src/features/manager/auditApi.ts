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
  capacity: number;
  enrolledCount: number;
  presentCount: number;
  utilizationRate: number; // Tỷ lệ lấp đầy % (enrolled / capacity * 100)
  attendanceRate: number; // Tỷ lệ đi học % (present / enrolled * 100)
}

const SAMPLE_AUDIT_LOGS: AuditLogItem[] = [
  {
    id: 1001,
    userId: 1,
    userFullName: 'Vũ Hoàng Nam (Quản lý)',
    userEmail: 'nam.vu@solfitness.vn',
    action: 'UPDATE',
    entityType: 'membership_subscriptions',
    entityId: 45,
    oldValue: { status: 'pending_payment', remainingDays: 0, packageId: 2 },
    newValue: { status: 'active', remainingDays: 30, packageId: 2, activatedAt: '2026-10-25T10:00:00' },
    ipAddress: '192.168.1.15',
    createdAt: '2026-10-25T10:15:32',
  },
  {
    id: 1002,
    userId: 2,
    userFullName: 'Nguyễn Thu Trang (Lễ tân)',
    userEmail: 'trang.nguyen@solfitness.vn',
    action: 'CREATE',
    entityType: 'payments',
    entityId: 128,
    oldValue: null,
    newValue: { invoiceNumber: 'INV-2026-1028', amount: 3500000, method: 'POS', status: 'SUCCESS' },
    ipAddress: '192.168.1.22',
    createdAt: '2026-10-25T10:30:15',
  },
  {
    id: 1003,
    userId: 3,
    userFullName: 'Marcus Vance (HLV)',
    userEmail: 'marcus.vance@solfitness.vn',
    action: 'UPDATE',
    entityType: 'session_attendance',
    entityId: 89,
    oldValue: { status: 'late', progressScore: 60 },
    newValue: { status: 'present', progressScore: 85, notes: 'Đã hoàn thành bù bài khởi động khớp hông' },
    ipAddress: '192.168.1.40',
    createdAt: '2026-10-25T11:05:40',
  },
  {
    id: 1004,
    userId: 1,
    userFullName: 'Vũ Hoàng Nam (Quản lý)',
    userEmail: 'nam.vu@solfitness.vn',
    action: 'CANCEL',
    entityType: 'cancellation_requests',
    entityId: 14,
    oldValue: { status: 'SUBMITTED', reason: 'Chuyển nơi công tác' },
    newValue: { status: 'APPROVED', refundAmount: 1800000, processedAt: '2026-10-25T14:20:00' },
    ipAddress: '192.168.1.15',
    createdAt: '2026-10-25T14:22:10',
  },
  {
    id: 1005,
    userId: 2,
    userFullName: 'Nguyễn Thu Trang (Lễ tân)',
    userEmail: 'trang.nguyen@solfitness.vn',
    action: 'SCAN',
    entityType: 'center_checkins',
    entityId: 304,
    oldValue: null,
    newValue: { gate: 'Turnstile A1 - Sảnh Chính', status: 'GRANTED', memberId: 101 },
    ipAddress: '192.168.1.22',
    createdAt: '2026-10-25T16:45:00',
  },
];

const SAMPLE_OCCUPANCY: ClassOccupancyItem[] = [
  {
    classId: 1,
    className: 'Reformer Core & Spinal Alignment',
    disciplineId: 1,
    disciplineName: 'Gym',
    capacity: 10,
    enrolledCount: 9,
    presentCount: 8,
    utilizationRate: 90.0,
    attendanceRate: 88.9,
  },
  {
    classId: 2,
    className: 'Athletic Conditioning & Hypertrophy',
    disciplineId: 2,
    disciplineName: 'HIIT & Strength',
    capacity: 15,
    enrolledCount: 14,
    presentCount: 12,
    utilizationRate: 93.3,
    attendanceRate: 85.7,
  },
  {
    classId: 3,
    className: 'Olympic Weightlifting Fundamentals',
    disciplineId: 3,
    disciplineName: 'Barbell & Lifting',
    capacity: 8,
    enrolledCount: 6,
    presentCount: 5,
    utilizationRate: 75.0,
    attendanceRate: 83.3,
  },
  {
    classId: 4,
    className: 'Vinyasa Flow & Deep Relaxation',
    disciplineId: 4,
    disciplineName: 'Bơi lội',
    capacity: 20,
    enrolledCount: 16,
    presentCount: 14,
    utilizationRate: 80.0,
    attendanceRate: 87.5,
  },
  {
    classId: 5,
    className: 'Functional Movement & Mobility',
    disciplineId: 5,
    disciplineName: 'Mobility & Recovery',
    capacity: 12,
    enrolledCount: 8,
    presentCount: 7,
    utilizationRate: 66.7,
    attendanceRate: 87.5,
  },
];

export const auditApi = {
  /**
   * Lấy danh sách Audit Log có lọc và phân trang (GET /api/v1/audit-logs)
   */
  getAuditLogs: async (filter?: AuditLogFilter): Promise<PageResult<AuditLogItem>> => {
    const params = new URLSearchParams();
    if (filter?.userId) params.set('user_id', String(filter.userId));
    if (filter?.entityType) params.set('entity_type', filter.entityType);
    if (filter?.action) params.set('action', filter.action);
    if (filter?.from) params.set('from', filter.from);
    if (filter?.to) params.set('to', filter.to);
    params.set('page', String(filter?.page ?? 0));
    params.set('size', String(filter?.size ?? 10));

    try {
      const res = await apiFetch<PageResult<AuditLogItem>>(`/admin/audit-logs?${params.toString()}`);
      if (res && Array.isArray(res.content)) {
        return res;
      }
    } catch {
      // Fallback sample data with local client filter
    }

    let filtered = [...SAMPLE_AUDIT_LOGS];
    if (filter?.action && filter.action !== 'ALL') {
      filtered = filtered.filter((item) => item.action === filter.action);
    }
    if (filter?.entityType && filter.entityType !== 'ALL') {
      filtered = filtered.filter((item) => item.entityType === filter.entityType);
    }

    const page = filter?.page ?? 0;
    const size = filter?.size ?? 10;
    const start = page * size;
    const paginated = filtered.slice(start, start + size);

    return {
      content: paginated,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
      number: page,
      size,
    };
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

    try {
      const res = await apiFetch<ClassOccupancyItem[]>(`/reports/class-utilization${qs}`);
      if (Array.isArray(res) && res.length > 0) {
        return res;
      }
    } catch {
      // Fallback
    }

    return SAMPLE_OCCUPANCY;
  },
};
