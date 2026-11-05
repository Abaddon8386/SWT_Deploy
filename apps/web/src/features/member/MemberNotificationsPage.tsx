import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { getNotifications, getUnreadCount, markAllNotificationsRead, markNotificationRead, notificationDestination, safeNotificationPath, type MemberNotification, type NotificationPage } from './notificationsApi';
import './notifications.css';
import { getCurrentUser } from '../../shared/api/client';
import { errorMessage as safeMessage } from '../../shared/lib/errorMessage';
import { markNoticesRead, usePortalNotices } from '../../shared/lib/portalNotices';
import { formatCenterDateTime } from '../../shared/lib/centerTime';
import { localizeTitle, localizeMessage } from './notificationLocalizer';

const category: Record<string, { label: string }> = {
  schedule_change: { label: 'Lịch học' },
  class_reminder: { label: 'Nhắc lịch học' },
  booking: { label: 'Đăng ký lớp' },
  waitlist: { label: 'Hàng chờ' },
  payment: { label: 'Thanh toán' },
  package_expiry: { label: 'Hạn gói tập' },
  support_reply: { label: 'Hỗ trợ' },
  system: { label: 'Hệ thống' },
};

function errorMessage(error: unknown): string {
  return safeMessage(error, 'Không thể tải thông báo. Vui lòng thử lại.');
}

export function MemberNotificationsPage() {
  const role = getCurrentUser()?.role;
  const redirectPath = role === 'COACH' ? '/coach/classes' : role === 'MANAGER' ? '/manager/reports' : role === 'STAFF' ? '/staff/reception' : role === 'ADMIN' ? '/admin/users' : '/member/dashboard';
  return <Navigate to={redirectPath} replace state={{ openNotifications: true }} />;
}

export function MemberNotificationsPanel({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [data, setData] = useState<NotificationPage | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef({ version: 0 });
  const notices = usePortalNotices();

  // Mở bảng là đã xem các thông báo thao tác
  useEffect(() => { markNoticesRead(); }, [notices.length]);

  const role = getCurrentUser()?.role;
  const serverEnabled = true;

  const load = useCallback(async () => {
    const version = ++request.current.version;
    if (!serverEnabled) { setData(null); setCount(0); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [list, unread] = await Promise.all([getNotifications(page), getUnreadCount()]);
      if (version === request.current.version) { setData(list); setCount(unread); }
    } catch (reason) { if (version === request.current.version) { setData(null); setError(errorMessage(reason)); } }
    finally { if (version === request.current.version) setLoading(false); }
  }, [page, serverEnabled]);

  useEffect(() => {
    const sequence = request.current;
    void load();
    return () => { sequence.version++; };
  }, [load]);

  async function open(item: MemberNotification) {
    if (busy) return;
    const version = request.current.version;
    setBusy(true); setError(null);
    try {
      if (!item.isRead) {
        await markNotificationRead(item.id);
        window.dispatchEvent(new Event('member-notifications-changed'));
        if (version !== request.current.version) return;
        setData((current) => current && ({ ...current, content: current.content.map((n) => n.id === item.id ? { ...n, isRead: true } : n) }));
        setCount((current) => Math.max(0, current - 1));
      }
      const destination = notificationDestination(item, role);
      if (destination) { onNavigate?.(); navigate(destination); }
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }

  async function readAll() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await markAllNotificationsRead();
      setData((current) => current && ({ ...current, content: current.content.map((n) => ({ ...n, isRead: true })) }));
      setCount(0);
      window.dispatchEvent(new Event('member-notifications-changed'));
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }

  const hasUnread = count > 0 || Boolean(data?.content.some((item) => !item.isRead));

  return <div className="notification-panel">
    {serverEnabled && <div className="notification-panel__actions"><span>{loading ? 'Đang tải…' : data ? `${count} chưa đọc` : 'Chưa cập nhật'}</span><button className="notification-action" type="button" disabled={loading || busy || !hasUnread} onClick={() => void readAll()}>Đánh dấu tất cả đã đọc</button></div>}
    <div className="notification-panel__scroll" aria-busy={loading || busy}>
    {notices.length > 0 && <ul className="notification-activity" aria-label="Thông báo vừa phát sinh">
      {notices.map((notice) => <li key={notice.id} className={`notification-activity__item notification-activity__item--${notice.type}`}>
        <button type="button" className="notification-action notification-copy" onClick={() => {
          onNavigate?.();
          navigate(safeNotificationPath(notice.destination, role) ?? notificationDestination({ relatedEntityType: null, type: 'system' }, role));
        }}><span>{localizeMessage(notice.message)}</span><small>{formatCenterDateTime(new Date(notice.createdAt).toISOString())}</small></button>
        {notice.action && <button type="button" className="notification-action" onClick={notice.action.run}>{notice.action.label}</button>}
      </li>)}
    </ul>}
    {error && <div className="portal-alert notification-error" role="alert">{error} <button type="button" onClick={() => void load()}>Thử lại</button></div>}
    {loading ? <LoadingSkeleton label="Đang tải thông báo…" count={5} /> : !data?.content.length && !error && notices.length === 0 ?
      <div className="portal-empty"><h3>Chưa có thông báo</h3><p>Thông báo mới sẽ xuất hiện tại đây.</p></div> :
      <div className="notification-list" aria-label="Danh sách thông báo">
        {data?.content.map((item) => <button key={item.id} type="button" className={`notification-item${item.isRead ? '' : ' notification-item--unread'}`} disabled={busy} onClick={() => void open(item)}>
          <span className="notification-copy"><small className="notification-category">{category[item.type?.toLowerCase()]?.label ?? 'Hệ thống'}</small><strong>{localizeTitle(item.title)}</strong><span>{localizeMessage(item.message)}</span><small>{formatCenterDateTime(item.createdAt)}</small></span>
          {!item.isRead && <span className="notification-dot" aria-label="Chưa đọc" />}
        </button>)}
      </div>}
    </div>
    {!loading && data && data.totalPages > 1 && <nav className="notification-pages" aria-label="Phân trang thông báo">
      <button type="button" disabled={page === 0 || busy} onClick={() => setPage(page - 1)}>Trước</button>
      <span>Trang {page + 1} / {data.totalPages}</span>
      <button type="button" disabled={page + 1 >= data.totalPages || busy} onClick={() => setPage(page + 1)}>Sau</button>
    </nav>}
  </div>;
}
