import { apiFetch } from '../../shared/api/client';

export interface MemberNotification {
  id: number;
  title: string;
  message: string;
  type: string;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  isRead: boolean;
  createdAt: string;
  actionPath?: string | null;
}

export interface NotificationPage {
  content: MemberNotification[];
  number: number;
  totalPages: number;
}

export const getNotifications = (page = 0) =>
  apiFetch<NotificationPage>(`/notifications?page=${page}&size=20`);
export const getUnreadCount = async () =>
  (await apiFetch<{ count: number }>('/notifications/unread-count')).count;
export const markNotificationRead = (id: number) =>
  apiFetch<void>(`/notifications/${id}/read`, { method: 'PATCH' });
export const markAllNotificationsRead = () =>
  apiFetch<void>('/notifications/read-all', { method: 'PATCH' });

/** Accept only internal portal routes; never follow arbitrary URLs from notification content. */
export function safeNotificationPath(path: string | null | undefined, role = 'MEMBER'): string | null {
  if (!path || !/^\/[a-z0-9/-]+(?:\?[a-zA-Z0-9_=&%-]+)?(?:#[a-z0-9-]+)?$/.test(path)) return null;
  const prefix = role === 'COACH' ? '/coach/' : ['STAFF', 'RECEPTIONIST'].includes(role) ? '/staff/' : ['MANAGER', 'CENTER_MANAGER'].includes(role) ? '/manager/' : role === 'ADMIN' ? '/admin/' : '/member/';
  return path.startsWith(prefix) || path.startsWith('/member/profile') || (role === 'COACH' && ['/staff/attendance', '/staff/requests', '/staff/coach-classes', '/staff/classes'].some(p => path === p || path.startsWith(`${p}?`))) || (['MANAGER', 'CENTER_MANAGER'].includes(role) && ['/staff/classes', '/staff/courts', '/staff/orders'].some(p => path === p || path.startsWith(`${p}?`))) || path === '/messages' ? path : null;
}

export function notificationDestination(notification: Pick<MemberNotification, 'relatedEntityType' | 'type' | 'actionPath'>, role = 'MEMBER'): string {
  const explicit = safeNotificationPath(notification.actionPath, role);
  if (explicit) return explicit;
  if (role === 'COACH') return notification.relatedEntityType === 'training_plan' ? '/coach/training-plans' : '/coach/classes';
  if (['STAFF', 'RECEPTIONIST', 'MANAGER', 'CENTER_MANAGER'].includes(role)) {
    const manager = ['MANAGER', 'CENTER_MANAGER'].includes(role);
    if (notification.relatedEntityType === 'product_order' || notification.type === 'order') return manager ? '/manager/products?tab=orders' : '/staff/orders';
    if (notification.relatedEntityType === 'support_request' || notification.type === 'support_reply') return manager ? '/manager/support' : '/staff/support';
    if (['class_session', 'class_enrollment'].includes(notification.relatedEntityType ?? '') || ['schedule_change', 'class_reminder'].includes(notification.type)) return '/staff/classes';
    return manager ? '/manager/reports' : '/staff/reception';
  }
  if (role === 'ADMIN') return '/admin/users';
  switch (notification.relatedEntityType) {
    case 'class_session':
    case 'class_enrollment': return '/member/classes';
    case 'membership_subscription': return '/member/packages';
    case 'payment': return '/member/invoices';
    case 'product_order': return '/member/orders';
    case 'support_request': return '/member/support';
    case 'training_plan': return '/member/progress';
    default:
      if (notification.type === 'class_reminder' || notification.type === 'schedule_change') return '/member/classes';
      if (notification.type === 'package_expiry') return '/member/packages';
      if (notification.type === 'payment') return '/member/invoices';
      if (notification.type === 'order') return '/member/orders';
      if (notification.type === 'support_reply') return '/member/support';
      return '/member/dashboard';
  }
}
