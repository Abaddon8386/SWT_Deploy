import { memberText } from './memberI18n';
import type { SourceMessage } from '../../shared/i18n/language';
import { useLanguage } from '../../shared/i18n/language';
import { useI18n } from '../../shared/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { getNotifications, getUnreadCount, markAllNotificationsRead, markNotificationRead, notificationDestination, safeNotificationPath, type MemberNotification, type NotificationPage } from './notificationsApi';
import './notifications.css';
import { getCurrentUser } from '../../shared/api/client';
import { localizableError as safeMessage } from '../../shared/lib/errorMessage';
import { markNoticesRead, usePortalNotices } from '../../shared/lib/portalNotices';
import { formatCenterDateTime } from '../../shared/lib/centerTime';
import { localizeTitle, localizeMessage } from './notificationLocalizer';

const category: Record<string, { label: string }> = {
  schedule_change: { label: 'Lịch học' },
  class_reminder: { label: 'Nhắc lịch học' },
  booking: { label: 'Đăng ký lớp' },
  waitlist: { label: 'Hàng chờ' },
  payment: { label: 'Thanh toán' },
  order: { label: 'Đơn hàng' },
  package_expiry: { label: 'Hạn gói tập' },
  support_reply: { label: 'Hỗ trợ' },
  system: { label: 'Hệ thống' },
};

function errorMessage(error: unknown): string | Error {
  return safeMessage(error, 'Không thể tải thông báo. Vui lòng thử lại.');
}

export function MemberNotificationsPage() {
  useLanguage();
  const role = getCurrentUser()?.role;
  const redirectPath = role === 'COACH' ? '/coach/classes' : role === 'MANAGER' ? '/manager/reports' : role === 'STAFF' ? '/staff/reception' : role === 'ADMIN' ? '/admin/users' : '/member/dashboard';
  return <Navigate to={redirectPath} replace state={{ openNotifications: true }} />;
}

export function MemberNotificationsPanel({ onNavigate }: { onNavigate?: () => void }) {
  useLanguage();
  const { lang, t } = useI18n();
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [data, setData] = useState<NotificationPage | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | Error | null | SourceMessage>(null);
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

  return <div className="notification-panel" data-i18n-managed>
    {serverEnabled && <div className="notification-panel__actions"><span>{loading ? t('Đang tải…', "Loading…") : data ? t(`${count} chưa đọc`, `${count} unread`) : t('Chưa cập nhật', "Not updated")}</span><button className="notification-action" type="button" disabled={loading || busy || !hasUnread} onClick={() => void readAll()}>{t("Đánh dấu tất cả đã đọc", "Mark all as read")}</button></div>}
    <div className="notification-panel__scroll" aria-busy={loading || busy}>
    {notices.length > 0 && <ul className="notification-activity" aria-label={t("Thông báo vừa phát sinh", "Recent activity")}>
      {notices.map((notice) => <li key={notice.id} className={`notification-activity__item notification-activity__item--${notice.type}`}>
        <button type="button" className="notification-action notification-copy" onClick={() => {
          onNavigate?.();
          navigate(safeNotificationPath(notice.destination, role) ?? notificationDestination({ relatedEntityType: null, type: 'system' }, role));
        }}><span>{notice.translation ? t(notice.translation) : notice.message}</span><small>{formatCenterDateTime(new Date(notice.createdAt).toISOString())}</small></button>
        {notice.action && <button type="button" className="notification-action" onClick={notice.action.run}>{notice.action.translation ? t(notice.action.translation) : notice.action.label}</button>}
      </li>)}
    </ul>}
    {error && <div className="portal-alert notification-error" role="alert">{t(error)} <button type="button" onClick={() => void load()}>{t("Thử lại", "Retry")}</button></div>}
    {loading ? <LoadingSkeleton label={t("Đang tải thông báo…", "Loading notifications…")} count={5} /> : !data?.content.length && !error && notices.length === 0 ?
      <div className="portal-empty"><h3>{t("Chưa có thông báo", "No notifications yet")}</h3><p>{t("Thông báo mới sẽ xuất hiện tại đây.", "New notifications will appear here.")}</p></div> :
      <div className="notification-list" aria-label={t("Danh sách thông báo", "Notifications list")}>
        {data?.content.map((item) => <button key={item.id} type="button" className={`notification-item${item.isRead ? '' : ' notification-item--unread'}`} disabled={busy} onClick={() => void open(item)}>
          <span className="notification-copy"><small className="notification-category">{t(category[item.type?.toLowerCase()]?.label ?? memberText("Hệ thống"))}</small><strong>{lang === 'vi' ? localizeTitle(item.title) : item.title}</strong><span>{lang === 'vi' ? localizeMessage(item.message) : item.message}</span><small>{formatCenterDateTime(item.createdAt)}</small></span>
          {!item.isRead && <span className="notification-dot" aria-label={t("Chưa đọc", "Unread")} />}
        </button>)}
      </div>}
    </div>
    {!loading && data && data.totalPages > 1 && <nav className="notification-pages" aria-label={t("Phân trang thông báo", "Notification pagination")}>
      <button type="button" disabled={page === 0 || busy} onClick={() => setPage(page - 1)}>{t("Trước", "Previous")}</button>
      <span>{t('Trang', "Page")} {page + 1} / {data.totalPages}</span>
      <button type="button" disabled={page + 1 >= data.totalPages || busy} onClick={() => setPage(page + 1)}>{t("Sau", "Next")}</button>
    </nav>}
  </div>;
}
