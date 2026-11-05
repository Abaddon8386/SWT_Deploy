// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { MemberNotificationsPanel as MemberNotificationsPage } from './MemberNotificationsPage';

const api = vi.hoisted(() => ({ list: vi.fn(), count: vi.fn(), read: vi.fn(), all: vi.fn() }));
vi.mock('./notificationsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./notificationsApi')>()),
  getNotifications: api.list, getUnreadCount: api.count,
  markNotificationRead: api.read, markAllNotificationsRead: api.all,
}));

function CurrentPath() { const location = useLocation(); return <output>{location.pathname}{location.hash}</output>; }

describe('SCRUM-127 member notifications', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    Object.values(api).forEach((mock) => mock.mockReset());
    api.list.mockResolvedValue({ content: [], number: 0, totalPages: 1 });
    api.count.mockResolvedValue(0); api.read.mockResolvedValue(undefined); api.all.mockResolvedValue(undefined);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
  const render = async () => act(async () => root.render(<MemoryRouter><MemberNotificationsPage /><CurrentPath /></MemoryRouter>));
  const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text));

  it('shows empty state from the API', async () => {
    await render();
    expect(host.textContent).toContain('Chưa có thông báo');
    expect(button('Đánh dấu tất cả đã đọc')?.disabled).toBe(true);
  });

  it.each([[0, false, false], [2, true, false], [0, true, true]])('uses count %i and read state %s to disable mark-all: %s', async (count, isRead, disabled) => {
    api.count.mockResolvedValue(count);
    api.list.mockResolvedValue({ content: [{ id: 3, title: 'Thông báo', message: 'Nội dung', type: 'system', relatedEntityType: null, relatedEntityId: null, isRead, createdAt: '2026-10-24T08:00:00' }], number: 0, totalPages: 1 });
    await render();
    expect(button('Đánh dấu tất cả đã đọc')?.disabled).toBe(disabled);
  });

  it('disables mark-all while saving, prevents duplicate requests and notifies the badge on success', async () => {
    api.count.mockResolvedValue(1);
    let finish!: () => void;
    api.all.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const changed = vi.fn();
    window.addEventListener('member-notifications-changed', changed);
    try {
      await render();
      await act(async () => button('Đánh dấu tất cả đã đọc')?.click());
      expect(button('Đánh dấu tất cả đã đọc')?.disabled).toBe(true);
      await act(async () => button('Đánh dấu tất cả đã đọc')?.click());
      expect(api.all).toHaveBeenCalledTimes(1);
      await act(async () => finish());
      expect(changed).toHaveBeenCalledTimes(1);
      expect(button('Đánh dấu tất cả đã đọc')?.disabled).toBe(true);
    } finally {
      window.removeEventListener('member-notifications-changed', changed);
    }
  });

  it('keeps unread items and allows retry after mark-all fails', async () => {
    api.list.mockResolvedValue({ content: [{ id: 3, title: 'Thông báo', message: 'Nội dung', type: 'system', relatedEntityType: null, relatedEntityId: null, isRead: false, createdAt: '2026-10-24T08:00:00' }], number: 0, totalPages: 1 });
    api.all.mockRejectedValueOnce(new Error('Không thể đánh dấu'));
    await render();
    await act(async () => button('Đánh dấu tất cả đã đọc')?.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Không thể đánh dấu');
    expect(host.querySelector('[aria-label="Chưa đọc"]')).not.toBeNull();
    expect(button('Đánh dấu tất cả đã đọc')?.disabled).toBe(false);
    await act(async () => button('Đánh dấu tất cả đã đọc')?.click());
    expect(api.all).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[aria-label="Chưa đọc"]')).toBeNull();
    expect(button('Đánh dấu tất cả đã đọc')?.disabled).toBe(true);
  });

  it('retries a failed list request', async () => {
    api.list.mockRejectedValueOnce(new Error('Mất kết nối'));
    await render();
    expect(host.textContent).toContain('Mất kết nối');
    await act(async () => button('Thử lại')?.click());
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('Chưa có thông báo');
  });

  it('marks a notification read before navigation and reports mutation errors', async () => {
    api.list.mockResolvedValue({ content: [{ id: 3, title: 'Đổi phòng', message: 'Lớp đổi phòng', type: 'schedule_change', relatedEntityType: 'class_session', relatedEntityId: 9, isRead: false, createdAt: '2026-10-24T08:00:00' }], number: 0, totalPages: 1 });
    api.read.mockRejectedValueOnce(new Error('Không thể cập nhật'));
    await render();
    await act(async () => button('Đổi phòng')?.click());
    expect(host.textContent).toContain('Không thể cập nhật');
    expect(api.read).toHaveBeenCalledWith(3);
  });

  it('opens a new evaluation at the feedback section and marks it read', async () => {
    api.list.mockResolvedValue({ content: [{ id: 7, title: 'Đánh giá mới', message: 'Xem nhận xét', type: 'system', relatedEntityType: null, relatedEntityId: null, actionPath: '/member/progress#coach-evaluations', isRead: false, createdAt: '2026-11-03T10:00:00' }], number: 0, totalPages: 1 });
    await render();
    await act(async () => button('Đánh giá mới')?.click());
    expect(api.read).toHaveBeenCalledWith(7);
    expect(host.querySelector('output')?.textContent).toBe('/member/progress#coach-evaluations');
  });

  it('marks all visible notifications read through the backend', async () => {
    api.count.mockResolvedValue(2);
    api.list.mockResolvedValue({ content: [{ id: 3, title: 'Nhắc lịch', message: 'Lớp hôm nay', type: 'class_reminder', relatedEntityType: null, relatedEntityId: null, isRead: false, createdAt: '2026-10-24T08:00:00' }], number: 0, totalPages: 1 });
    await render();
    await act(async () => button('Đánh dấu tất cả đã đọc')?.click());
    expect(api.all).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[aria-label="Chưa đọc"]')).toBeNull();
  });

  it('notifies the navbar after marking one notification read', async () => {
    api.count.mockResolvedValue(1);
    api.list.mockResolvedValue({ content: [{ id: 4, title: 'Nhắc lịch', message: 'Lớp hôm nay', type: 'class_reminder', relatedEntityType: null, relatedEntityId: null, isRead: false, createdAt: '2026-10-24T08:00:00' }], number: 0, totalPages: 1 });
    const changed = vi.fn();
    window.addEventListener('member-notifications-changed', changed);
    try {
      await render();
      await act(async () => button('Nhắc lịch')?.click());
      expect(api.read).toHaveBeenCalledWith(4);
      expect(changed).toHaveBeenCalledTimes(1);
      expect(host.querySelector('[aria-label="Chưa đọc"]')).toBeNull();
    } finally {
      window.removeEventListener('member-notifications-changed', changed);
    }
  });
  it('renders English notifications in Vietnamese', async () => {
    api.list.mockResolvedValue({
      content: [{
        id: 5,
        title: 'Upcoming class reminder',
        message: 'Your class "Lớp boxing" is starting at 09:00 on 04/11/2026. Get ready!',
        type: 'class_reminder',
        relatedEntityType: 'class_session',
        relatedEntityId: 10,
        isRead: false,
        createdAt: '2026-11-04T07:00:00',
      }],
      number: 0,
      totalPages: 1,
    });
    await render();
    expect(host.textContent).toContain('Nhắc nhở lịch học sắp diễn ra');
    expect(host.textContent).toContain('Lớp học "Lớp boxing" của bạn sẽ bắt đầu lúc 09:00 ngày 04/11/2026. Hãy chuẩn bị sẵn sàng!');
  });

  it.each([
    ['You booked class Sunrise Yoga on 2026-11-14 (07:00-08:30).', 'Bạn đã đặt chỗ lớp Sunrise Yoga ngày 2026-11-14 (07:00-08:30).'],
    ['You have enrolled in class Sunrise Yoga on 2026-11-14', 'Bạn đã đăng ký tham gia lớp Sunrise Yoga vào ngày 2026-11-14'],
    ['Your seat in class Sunrise Yoga on 2026-11-14 was cancelled.', 'Chỗ của bạn ở lớp Sunrise Yoga ngày 2026-11-14 đã được hủy.'],
    ['Member Nguyễn Văn An booked a PT session on 2026-11-14 (07:00 - 08:30).', 'Hội viên Nguyễn Văn An đã đặt lịch tập 1:1 ngày 2026-11-14 (07:00 - 08:30).'],
    ['You booked a PT session with Trần Minh Quân on 2026-11-14 (07:00 - 08:30).', 'Bạn đã đặt lịch tập 1:1 với HLV Trần Minh Quân ngày 2026-11-14 (07:00 - 08:30).'],
    ['Member Nguyễn Văn An cancelled the PT session on 2026-11-14 (07:00 - 08:30).', 'Hội viên Nguyễn Văn An đã hủy lịch tập 1:1 ngày 2026-11-14 (07:00 - 08:30).'],
    ['You have a new message from Trần Minh Quân in support request "Booking help".', 'Bạn có tin nhắn mới từ Trần Minh Quân trong yêu cầu "Booking help".'],
    ['Your membership package Gold 1 Month will expire in 3 day(s) (10/11/2026). Please renew to avoid workout interruption.', 'Gói tập Gold 1 Month của bạn sẽ hết hạn sau 3 ngày (10/11/2026). Vui lòng gia hạn để không gián đoạn tập luyện.'],
  ])('translates legacy multiword names in the portal: %s', async (message, expected) => {
    api.list.mockResolvedValue({ content: [{ id: 8, title: 'Class session booked', message, type: 'system', relatedEntityType: null, relatedEntityId: null, isRead: false, createdAt: '2026-11-04T07:00:00' }], number: 0, totalPages: 1 });
    await render();
    expect(host.textContent).toContain(expected);
  });
});
