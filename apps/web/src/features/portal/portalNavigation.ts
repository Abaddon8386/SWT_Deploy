import type { UserSession } from '../../shared/api/client';
import type { PortalIconName } from './PortalIcon';

export const ROLE_LABELS: Record<UserSession['role'], string> = {
  ADMIN: 'Quản trị hệ thống',
  MEMBER: 'Hội viên', STAFF: 'Lễ tân', COACH: 'Huấn luyện viên', MANAGER: 'Quản lý trung tâm',
};

export const PORTAL_NAV: { to: string; label: string; icon: PortalIconName; roles: UserSession['role'][] }[] = [
  { to: '/member/dashboard', label: 'Bảng điều khiển', icon: 'board', roles: ['MEMBER'] },
  { to: '/member/packages', label: 'Gói tập', icon: 'package', roles: ['MEMBER'] },
  { to: '/member/classes', label: 'Lịch học & Đặt chỗ', icon: 'calendar', roles: ['MEMBER'] },
  { to: '/member/courts', label: 'Đặt sân', icon: 'court', roles: ['MEMBER'] },
  { to: '/member/card', label: 'Thẻ hội viên', icon: 'card', roles: ['MEMBER'] },
  { to: '/member/check-in', label: 'Quét QR cổng', icon: 'scan', roles: ['MEMBER'] },
  { to: '/member/invoices', label: 'Giao dịch & Hóa đơn', icon: 'receipt', roles: ['MEMBER'] },
  { to: '/member/progress', label: 'Tiến độ & Giáo án', icon: 'chart', roles: ['MEMBER'] },
  { to: '/member/notifications', label: 'Thông báo', icon: 'bell', roles: ['MEMBER'] },
  { to: '/member/support', label: 'Hỗ trợ & Khiếu nại', icon: 'support', roles: ['MEMBER'] },
  { to: '/coach/classes', label: 'Lịch dạy & Học viên HLV', icon: 'clock', roles: ['COACH'] },
  { to: '/staff/attendance', label: 'Điểm danh học viên', icon: 'check', roles: ['COACH'] },
  { to: '/coach/training-plans', label: 'Soạn giáo án & AI Gợi ý', icon: 'dumbbell', roles: ['COACH'] },
  { to: '/staff/reception', label: 'Quầy Lễ tân & POS', icon: 'card', roles: ['STAFF'] },
  { to: '/staff/check-in', label: 'Cổng quét QR Check-in', icon: 'scan', roles: ['STAFF'] },
  { to: '/staff/courts', label: 'Lượt đặt sân', icon: 'court', roles: ['STAFF'] },
  { to: '/staff/support', label: 'Hộp thư hỗ trợ', icon: 'inbox', roles: ['STAFF'] },
  { to: '/staff/requests', label: 'Đơn từ nội bộ', icon: 'file', roles: ['STAFF', 'COACH'] },
  { to: '/admin/users', label: 'Tài khoản & Phân quyền', icon: 'users', roles: ['ADMIN'] },
  { to: '/manager/reports', label: 'Báo cáo & Doanh thu', icon: 'chart', roles: ['MANAGER'] },
  { to: '/manager/catalogs', label: 'Danh mục vận hành', icon: 'catalog', roles: ['MANAGER'] },
  { to: '/staff/classes', label: 'Quản lý Lớp học & Xếp lịch', icon: 'calendar', roles: ['STAFF', 'MANAGER'] },
  { to: '/manager/cancellations', label: 'Yêu cầu hủy gói', icon: 'package', roles: ['MANAGER'] },
  { to: '/manager/support', label: 'Khiếu nại chuyển lên', icon: 'inbox', roles: ['MANAGER'] },
  { to: '/manager/staff-accounts', label: 'Tài khoản nhân sự', icon: 'users', roles: ['MANAGER'] },
  { to: '/manager/requests', label: 'Duyệt đơn nội bộ', icon: 'file', roles: ['MANAGER'] },
  { to: '/manager/coach-reviews', label: 'Xếp hạng & Đánh giá HLV', icon: 'star', roles: ['MANAGER'] },
  { to: '/manager/audit-logs', label: 'Nhật ký kiểm toán & Lấp đầy', icon: 'history', roles: ['MANAGER'] },
  { to: '/member/profile', label: 'Hồ sơ & Sức khỏe', icon: 'profile', roles: ['MEMBER', 'STAFF', 'COACH', 'MANAGER', 'ADMIN'] },
];

/** Short labels for the three frequent tasks; permissions still come from PORTAL_NAV. */
export const MOBILE_PRIMARY_NAV: Record<UserSession['role'], { to: string; label: string }[]> = {
  ADMIN: [
    { to: '/admin/users', label: 'Tài khoản' },
    { to: '/member/profile', label: 'Hồ sơ' },
  ],
  MEMBER: [
    { to: '/member/dashboard', label: 'Tổng quan' },
    { to: '/member/classes', label: 'Lịch học' },
    { to: '/member/check-in', label: 'Quét QR' },
  ],
  STAFF: [
    { to: '/staff/reception', label: 'Lễ tân' },
    { to: '/staff/classes', label: 'Lớp học' },
    { to: '/staff/check-in', label: 'Check-in' },
  ],
  COACH: [
    { to: '/coach/classes', label: 'Lịch dạy' },
    { to: '/staff/attendance', label: 'Điểm danh' },
    { to: '/coach/training-plans', label: 'Giáo án' },
  ],
  MANAGER: [
    { to: '/manager/reports', label: 'Báo cáo' },
    { to: '/manager/catalogs', label: 'Danh mục' },
    { to: '/staff/classes', label: 'Lớp học' },
  ],
};
