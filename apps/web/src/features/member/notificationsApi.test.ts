import { afterEach, describe, expect, it, vi } from 'vitest';
import { getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead, notificationDestination, safeNotificationPath } from './notificationsApi';

afterEach(() => vi.unstubAllGlobals());

describe('SCRUM-127 notification API', () => {
  it('uses the authenticated notification endpoints and unwraps pagination', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { content: [], number: 0, totalPages: 1 } }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getNotifications(0)).resolves.toMatchObject({ content: [] });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/notifications?page=0&size=20');
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { count: 4 } }) });
    await expect(getUnreadCount()).resolves.toBe(4);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/notifications/unread-count');
    await markNotificationRead(7);
    await markAllNotificationsRead();
    expect(fetchMock.mock.calls[2]).toMatchObject(['/api/v1/notifications/7/read', { method: 'PATCH' }]);
    expect(fetchMock.mock.calls[3]).toMatchObject(['/api/v1/notifications/read-all', { method: 'PATCH' }]);
  });

  it('maps only existing member destinations', () => {
    expect(notificationDestination({ relatedEntityType: 'class_session', type: 'schedule_change' })).toBe('/member/classes');
    expect(notificationDestination({ relatedEntityType: 'membership_subscription', type: 'package_expiry' })).toBe('/member/packages');
    expect(notificationDestination({ relatedEntityType: 'payment', type: 'payment' })).toBe('/member/invoices');
    expect(notificationDestination({ relatedEntityType: null, type: 'class_reminder' })).toBe('/member/classes');
    expect(notificationDestination({ relatedEntityType: 'support_request', type: 'support_reply' })).toBe('/member/support');
  });
});

it('routes training plans and coach notifications to the correct workspace', () => {
  expect(notificationDestination({ relatedEntityType: 'training_plan', type: 'system' })).toBe('/member/progress');
  expect(notificationDestination({ relatedEntityType: 'class_session', type: 'schedule_change' }, 'COACH')).toBe('/coach/classes');
});

it('uses safe action links and rejects external or other-role destinations', () => {
  expect(notificationDestination({ relatedEntityType: null, type: 'system', actionPath: '/member/progress#coach-evaluations' })).toBe('/member/progress#coach-evaluations');
  for (const actionPath of ['https://example.com', '//example.com', '/admin/users', '/member/../admin/users']) {
    expect(notificationDestination({ relatedEntityType: null, type: 'system', actionPath })).toBe('/member/dashboard');
  }
});

it('opens staff and manager support notifications in their own queues', () => {
  expect(notificationDestination({ relatedEntityType: 'support_request', type: 'support_reply' }, 'STAFF')).toBe('/staff/support');
  expect(notificationDestination({ relatedEntityType: 'support_request', type: 'support_reply' }, 'MANAGER')).toBe('/manager/support');
});

it('product_order notifications open the right page per role', () => {
  expect(notificationDestination({ relatedEntityType: 'product_order', type: 'order' }, 'MEMBER')).toBe('/member/orders');
  expect(notificationDestination({ relatedEntityType: 'product_order', type: 'order' }, 'STAFF')).toBe('/staff/orders');
  expect(notificationDestination({ relatedEntityType: 'product_order', type: 'order' }, 'RECEPTIONIST')).toBe('/staff/orders');
  expect(notificationDestination({ relatedEntityType: 'product_order', type: 'order' }, 'MANAGER')).toBe('/manager/products?tab=orders');
  expect(notificationDestination({ relatedEntityType: 'product_order', type: 'order' }, 'CENTER_MANAGER')).toBe('/manager/products?tab=orders');
  expect(safeNotificationPath('/staff/orders', 'STAFF')).toBe('/staff/orders');
  expect(safeNotificationPath('/staff/orders', 'MANAGER')).toBe('/staff/orders');
  expect(safeNotificationPath('/manager/products', 'MANAGER')).toBe('/manager/products');
});
