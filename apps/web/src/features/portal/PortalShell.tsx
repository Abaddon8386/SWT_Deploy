import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useNavigation } from 'react-router-dom';
import { apiFetch, clearAuthSession, syncSessionWithServer, TOKEN_STORAGE_KEY, type UserSession } from '../../shared/api/client';
import { sessionIdentityKey, useCurrentUser } from '../../shared/api/useCurrentUser';
import { LanguageSetting, useDomLanguageSync, useI18n } from '../../shared/i18n';
import { Modal } from '../../shared/ui/Modal';
import { ThemeToggle } from '../../shared/ui/ThemeToggle';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { PortalIcon } from './PortalIcon';
import { getMobileNavLabel, getNavLabel, getRoleLabel, MOBILE_PRIMARY_NAV, PORTAL_NAV } from './portalNavigation';
import { getUnreadCount } from '../member/notificationsApi';
import { getProfile } from '../member/profileApi';
import { usePortalNotices } from '../../shared/lib/portalNotices';
import { ChatWidget } from '../chat/ChatWidget';
import { PwaStatus } from '../pwa/PwaStatus';
import { NotificationsPopover } from '../member/NotificationsPopover';

// Only members see the AI assistant; its WebGL shaders stay out of every other role's first load.

interface WalletTransactionItem {
  id?: number;
  type?: string;
  amount?: number;
  balanceAfter?: number;
  description?: string | null;
  referenceId?: string | null;
  createdAt?: string | null;
}

interface WalletSummaryResponse {
  balance?: number;
  updatedAt?: string | null;
  transactions?: WalletTransactionItem[];
}

function walletTypeLabel(type?: string, lang: 'vi' | 'en' = 'vi') {
  if (type === 'TOPUP_VNPAY') return lang === 'en' ? 'VNPay top-up' : 'Nạp từ VNPay';
  if (type === 'REFUND_CREDIT') return lang === 'en' ? 'Refund to wallet' : 'Hoàn tiền vào ví';
  if (type === 'PAYMENT_DEBIT') return lang === 'en' ? 'Service payment' : 'Thanh toán dịch vụ';
  return type || (lang === 'en' ? 'Wallet transaction' : 'Giao dịch ví');
}

function isCreditTransaction(type?: string, amount?: number) {
  if (type === 'PAYMENT_DEBIT') return false;
  if (type === 'TOPUP_VNPAY' || type === 'REFUND_CREDIT') return true;
  return (amount ?? 0) >= 0;
}

function searchable(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

/**
 * Vỏ portal gắn với một danh tính: khi đổi tài khoản/role (kể cả từ tab khác) toàn bộ cây con bị remount,
 * nên chat, thông báo và state trang của phiên cũ không còn hiển thị cho người dùng mới.
 */
export function PortalShell() {
  const user = useCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  return <PortalShellContent key={sessionIdentityKey(user)} user={user} />;
}

function PortalShellContent({ user }: { user: UserSession }) {
  const { lang, t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const navigating = navigation.state !== 'idle';
  const [dialog, setDialog] = useState<'search' | 'menu' | 'logout' | 'notifications' | 'wallet' | null>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransactionItem[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [topupAmount, setTopupAmount] = useState('200000');
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupError, setTopupError] = useState<string | null>(null);

  const handleWalletTopup = async () => {
    if (topupBusy) return;
    const numeric = Number(topupAmount);
    if (!Number.isFinite(numeric) || numeric < 10000 || numeric > 100000000) {
      setTopupError(t(
        'Số tiền nạp vào Ví phải từ 10.000 đ đến 100.000.000 đ.',
        'Wallet top-up amount must be between 10,000 VND and 100,000,000 VND.',
      ));
      return;
    }
    setTopupBusy(true);
    setTopupError(null);
    try {
      const checkout = await apiFetch<{ paymentUrl?: string }>('/wallet/topup/vnpay', {
        method: 'POST',
        body: JSON.stringify({ amount: numeric }),
      });
      if (checkout?.paymentUrl) {
        window.location.assign(checkout.paymentUrl);
      } else {
        setTopupBusy(false);
      }
    } catch (err) {
      setTopupError(err instanceof Error ? err.message : t('Không thể tạo giao dịch nạp tiền VNPay.', 'Unable to create VNPay top-up transaction.'));
    }
  };

  const notificationTrigger = useRef<HTMLElement | null>(null);
  const closeNotifications = useCallback(() => {
    setDialog(null);
    notificationTrigger.current?.focus();
  }, []);
  const openNotifications = (event: MouseEvent<HTMLButtonElement>) => {
    notificationTrigger.current = event.currentTarget;
    setDialog(current => current === 'notifications' ? null : 'notifications');
  };
  const [query, setQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [notificationError, setNotificationError] = useState(false);
  const clientUnread = usePortalNotices().filter((item) => !item.read).length;
  const totalUnread = (unreadCount ?? 0) + clientUnread;
  const previousPath = useRef(location.pathname);
  const mainRef = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  useDomLanguageSync(mainRef);
  const isMember = user.role === 'MEMBER';
  // Mọi vai trò đều mở được hộp thư server và thông báo thao tác tại client.
  const hasServerNotifications = true;
  const canReceiveNotifications = true;
  const profileLabel = isMember
    ? t('Hồ sơ & Sức khỏe', 'Profile & Health')
    : t('Hồ sơ cá nhân', 'My Profile');
  const navItems = PORTAL_NAV.filter((item) => item.roles.includes(user.role)).map((item) => {
    if (item.to === '/member/profile') return { ...item, label: profileLabel };
    if (item.to === '/staff/classes' && user.role === 'STAFF') {
      return { ...item, label: t('Xem lịch học trung tâm', 'Center Class Schedule') };
    }
    return { ...item, label: getNavLabel(item.to, item.label, lang) };
  });
  const pageTitle = navItems.find((item) => item.to === location.pathname)?.label ?? t('Không gian của bạn', 'Your Workspace');
  const results = navItems.filter((item) => searchable(item.label).includes(searchable(query.trim())));
  const mobileItems = MOBILE_PRIMARY_NAV[user.role].flatMap(item => {
    const authorizedItem = navItems.find(candidate => candidate.to === item.to);
    return authorizedItem ? [{ ...authorizedItem, label: getMobileNavLabel(item.to, item.label, lang) }] : [];
  });
  const secondaryScreen = !mobileItems.some(item => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`));

  const refreshProfileSummary = useCallback(() => {
    void getProfile()
      .then((profile) => {
        if (profile && typeof profile === 'object') {
          setAvatarUrl(typeof profile.avatarUrl === 'string' && profile.avatarUrl.trim() ? profile.avatarUrl.trim() : null);
          setProfileEmail(typeof profile.email === 'string' && profile.email.trim() ? profile.email.trim() : null);
        }
      })
      .catch(() => {
        // Ignore in offline/test contexts where /profile is not mocked
      });
  }, []);

  const refreshWallet = useCallback(() => {
    setWalletLoading(true);
    void apiFetch<WalletSummaryResponse>('/wallet/my')
      .then((data) => {
        if (data && typeof data === 'object') {
          const numeric = Number(data.balance);
          setWalletBalance(Number.isFinite(numeric) ? numeric : 0);
          setWalletTransactions(Array.isArray(data.transactions) ? data.transactions : []);
        }
      })
      .catch(() => {
        // Graceful fallback to 0 đ
      })
      .finally(() => {
        setWalletLoading(false);
      });
  }, []);

  useEffect(() => {
    if (localStorage.getItem(TOKEN_STORAGE_KEY)) {
      refreshProfileSummary();
    }
    window.addEventListener('profile-updated', refreshProfileSummary);
    return () => {
      window.removeEventListener('profile-updated', refreshProfileSummary);
    };
  }, [refreshProfileSummary]);

  useEffect(() => {
    if (localStorage.getItem(TOKEN_STORAGE_KEY)) {
      refreshWallet();
    }
    const handleOpenWalletModal = () => {
      setAvatarMenuOpen(false);
      refreshWallet();
      setDialog('wallet');
    };
    window.addEventListener('wallet-updated', refreshWallet);
    window.addEventListener('member-notifications-changed', refreshWallet);
    window.addEventListener('open-wallet-modal', handleOpenWalletModal);
    return () => {
      window.removeEventListener('wallet-updated', refreshWallet);
      window.removeEventListener('member-notifications-changed', refreshWallet);
      window.removeEventListener('open-wallet-modal', handleOpenWalletModal);
    };
  }, [refreshWallet]);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    refreshProfileSummary();
    refreshWallet();
    const onPointerDown = (event: Event) => {
      if (avatarMenuRef.current && event.target instanceof Node && !avatarMenuRef.current.contains(event.target)) {
        setAvatarMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAvatarMenuOpen(false);
        avatarMenuRef.current?.querySelector<HTMLButtonElement>('.portal-account')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [avatarMenuOpen, refreshProfileSummary, refreshWallet]);

  useEffect(() => {
    if (!hasServerNotifications) return;
    let active = true;
    const refresh = () => {
      void getUnreadCount().then((count) => {
        if (active) { setUnreadCount(count); setNotificationError(false); }
      }).catch(() => {
        if (active) { setUnreadCount(null); setNotificationError(true); }
      });
    };
    refresh();
    window.addEventListener('member-notifications-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('member-notifications-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [hasServerNotifications]);

  useEffect(() => {
    // Role có thể bị Admin đổi sau khi đăng nhập: đối chiếu với server khi vào portal và khi quay lại tab.
    let lastSync = 0;
    const sync = () => {
      const now = Date.now();
      if (now - lastSync < 5000) return;
      lastSync = now;
      void syncSessionWithServer();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    sync();
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${pageTitle} · SÖL Portal`;
    return () => { document.title = previousTitle; };
  }, [pageTitle]);

  useEffect(() => {
    if (previousPath.current !== location.pathname) {
      setAvatarMenuOpen(false);
      setDialog(current => current === 'notifications' ? null : current);
      mainRef.current?.focus();
      previousPath.current = location.pathname;
    }
  }, [location.pathname]);

  useEffect(() => {
    if (canReceiveNotifications && location.state?.openNotifications) {
      setDialog('notifications');
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [canReceiveNotifications, location.state, location.pathname, navigate]);

  const openNavigation = (mode: 'search' | 'menu') => {
    setQuery('');
    setDialog(mode);
  };

  const renderAvatarContent = () => (
    <img
      src={avatarUrl || '/images/default-avatar.png'}
      alt={user.name || 'Avatar'}
      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
      onError={(e) => {
        const target = e.currentTarget;
        if (!target.src.endsWith('/images/default-avatar.png')) {
          target.src = '/images/default-avatar.png';
        }
      }}
    />
  );

  const roleLabel = getRoleLabel(user.role, lang);

  return <div className="portal-backdrop">
    <div className="app-shell portal-v2">
      <a href="#portal-main" className="skip-link">{t('Bỏ qua tới nội dung chính', 'Skip to main content')}</a>
      <aside className="app-sidebar" aria-label={t('Thanh công cụ SÖL', 'SÖL Sidebar')}>
        <Link to="/" className="portal-logo" aria-label={t('SÖL · Về trang chủ', 'SÖL · Back to home')}><span>S</span><i /></Link>
        <nav className="portal-rail-nav" aria-label={t('Điều hướng portal', 'Portal navigation')}>
          {navItems.filter((item) => item.to !== '/member/profile' && item.to !== '/member/notifications').map((item) => <NavLink
            key={item.to} to={item.to} className="portal-rail-link" aria-label={item.label} title={item.label}>
            <PortalIcon name={item.icon} /><span className="portal-rail-tooltip">{item.label}</span>
          </NavLink>)}
        </nav>
        <div className="portal-rail-footer">
          <Link to="/" className="portal-rail-link" aria-label={t('Về trang chủ', 'Back to home')}><PortalIcon name="home" /><span className="portal-rail-tooltip">{t('Về trang chủ', 'Back to home')}</span></Link>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="portal-workspace">
            <button type="button" className="portal-icon-button portal-mobile-menu" aria-label={t('Mở điều hướng', 'Open navigation')} onClick={() => openNavigation('menu')}><PortalIcon name="menu" /></button>
            <Link to="/portal" className="portal-wordmark" aria-label={t('SÖL Fitness · Trang đầu portal', 'SÖL Fitness · Portal home')}>SÖL<span>Fitness</span></Link>
            <span className="portal-workspace-divider" />
            <span className="portal-workspace-role">{roleLabel}</span>
          </div>
          <div className="portal-topbar-actions">
            <ThemeToggle />
            {canReceiveNotifications && <button type="button" onClick={openNotifications} aria-haspopup="dialog" aria-expanded={dialog === 'notifications'} aria-controls="portal-notifications" className="member-notification-bell" aria-label={notificationError ? t('Thông báo · Không thể cập nhật số chưa đọc', 'Notifications · Unable to update unread count') : t(`Thông báo · ${totalUnread} chưa đọc`, `Notifications · ${totalUnread} unread`)} title={notificationError ? t('Không thể cập nhật số thông báo', 'Unable to update notifications') : t('Thông báo', 'Notifications')}>
              <PortalIcon name="bell" size={19} />
              {totalUnread > 0 && <span className="member-notification-badge" aria-hidden="true">{totalUnread > 99 ? '99+' : totalUnread}</span>}
            </button>}
            <button type="button" className="portal-search-trigger" aria-label={t('Tìm màn hình', 'Find screen')} onClick={() => openNavigation('search')}>
              <span className="portal-search-icon"><PortalIcon name="search" size={17} /></span><span>{t('Tìm màn hình…', 'Find screen…')}</span>
            </button>
            <div className="portal-avatar-menu" ref={avatarMenuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="portal-account"
                aria-label={t(`Hồ sơ của ${user.name}`, `Profile of ${user.name}`)}
                aria-haspopup="menu"
                aria-expanded={avatarMenuOpen}
                data-testid="portal-avatar-trigger"
                onClick={() => setAvatarMenuOpen((current) => !current)}
              >
                <span className="portal-avatar" style={{ overflow: 'hidden' }}>{renderAvatarContent()}</span>
                <span className="portal-account-name">{user.name}<small>{roleLabel}</small></span>
              </button>
              {avatarMenuOpen && (
                <div
                  role="menu"
                  aria-label={t('Menu tài khoản', 'Account menu')}
                  className="portal-avatar-dropdown"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 10px)',
                    right: 0,
                    zIndex: 90,
                    width: 280,
                    maxHeight: 'calc(100dvh - 110px)',
                    overflowY: 'auto',
                    padding: 12,
                    borderRadius: 16,
                    background: 'var(--portal-surface, #292929)',
                    border: '1px solid var(--portal-border-strong, #ffffff30)',
                    boxShadow: '0 20px 48px -12px rgba(0,0,0,0.65)',
                    color: 'var(--portal-paper, #faf9f6)',
                  }}
                >
                  <div
                    className="portal-avatar-dropdown__summary"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '8px 10px 12px',
                      borderBottom: '1px solid var(--portal-border, #ffffff1a)',
                      marginBottom: 8,
                    }}
                  >
                    <span className="portal-avatar" style={{ overflow: 'hidden', flexShrink: 0 }}>
                      {renderAvatarContent()}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--portal-salmon, #ce9180)', fontWeight: 600 }}>
                        {roleLabel}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--portal-muted, #bcb8b5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {profileEmail || user.identifier}
                      </div>
                    </div>
                  </div>

                  {isMember && <Link to="/member/streak" role="menuitem" data-testid="avatar-menu-streak"
                    className="portal-avatar-dropdown__link" onClick={() => setAvatarMenuOpen(false)}>
                    {t('Streak tập luyện', 'Workout streak')}
                  </Link>}

                  {isMember && <button
                    type="button"
                    role="menuitem"
                    data-testid="avatar-menu-wallet"
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      refreshWallet();
                      setDialog('wallet');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--portal-border, #ffffff1a)',
                      background: 'var(--portal-raised, #303030)',
                      color: 'var(--portal-paper, #faf9f6)',
                      font: '600 12px var(--font-sans)',
                      cursor: 'pointer',
                      marginBottom: 6,
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span>{t('Ví của tôi', 'My Wallet')}</span>
                    </span>
                    <strong style={{ color: 'var(--portal-salmon, #ce9180)', fontVariantNumeric: 'tabular-nums' }}>
                      {walletBalance.toLocaleString('vi-VN')} đ
                    </strong>
                  </button>}

                  <Link
                    to="/member/profile"
                    role="menuitem"
                    data-testid="avatar-menu-profile"
                    onClick={() => setAvatarMenuOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      color: 'var(--portal-paper, #faf9f6)',
                      font: '500 12px var(--font-sans)',
                      textDecoration: 'none',
                      marginBottom: 4,
                    }}
                  >
                    <span>{t('Thông tin cá nhân & Ảnh đại diện', 'Personal Profile & Avatar')}</span>
                  </Link>

                  <LanguageSetting variant="menu" />

                  <button
                    type="button"
                    role="menuitem"
                    data-testid="avatar-menu-logout"
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      setDialog('logout');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: 0,
                      background: 'transparent',
                      color: 'var(--portal-danger, #fca5a5)',
                      font: '600 12px var(--font-sans)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span>{t('Đăng xuất', 'Sign out')}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <PwaStatus mode="status" />
        <main ref={mainRef} id="portal-main" tabIndex={-1} aria-busy={navigating || undefined}>
          {navigating && <LoadingSkeleton label={t('Đang tải trang…', 'Loading page…')} variant="cards" count={3} className="portal-route-loading" />}
          <div key={location.pathname} className="route-fade" hidden={navigating}><Outlet /></div>
        </main>
        <footer className="portal-workspace-footer">
          <span>{t('SÖL Fitness · Không gian của bạn', 'SÖL Fitness · Your Workspace')}</span>
          <LanguageSetting variant="footer" />
        </footer>
      </div>

      <nav className="portal-mobile-nav" aria-label={t('Điều hướng nhanh', 'Quick navigation')}>
        {mobileItems.map(item => <NavLink key={item.to} to={item.to} className="portal-mobile-nav__item">
          <span>{item.label}</span>
        </NavLink>)}
        <button ref={moreRef} type="button" className={`portal-mobile-nav__item${secondaryScreen ? ' active' : ''}`} aria-label={t('Thêm màn hình', 'More screens')} aria-haspopup="dialog" aria-expanded={dialog === 'menu'} aria-current={secondaryScreen ? 'true' : undefined} onClick={() => openNavigation('menu')}>
          <span>{t('Thêm', 'More')}</span>
        </button>
      </nav>

      {location.pathname !== '/member/check-in' && location.pathname !== '/messages' && <ChatWidget />}
      {canReceiveNotifications && dialog === 'notifications' && <NotificationsPopover onClose={closeNotifications} triggerRef={notificationTrigger} />}
      {dialog === 'wallet' && (
        <Modal title={t('Ví điện tử SÖL', 'SÖL Digital Wallet')} onClose={() => setDialog(null)}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              padding: 18,
              borderRadius: 16,
              background: 'var(--portal-raised, #303030)',
              border: '1px solid var(--portal-border-strong, #ffffff30)',
              marginBottom: 16,
            }}
          >
            <div>
              <div className="portal-label">{t('Số dư khả dụng', 'Available balance')}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--portal-salmon, #ce9180)', fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>
                {walletBalance.toLocaleString('vi-VN')} đ
              </div>
            </div>
            <button type="button" className="btn-secondary btn-sm" onClick={refreshWallet} disabled={walletLoading}>
              {walletLoading ? t('Đang tải…', 'Loading…') : t('Làm mới', 'Refresh')}
            </button>
          </div>
          <p className="portal-subtitle" style={{ marginBottom: 16 }}>
            {t(
              'Khi thanh toán qua VNPay, tiền được nạp tự động vào Ví và trừ ngay cho dịch vụ đăng ký. Khi yêu cầu hủy gói tập được Quản lý phê duyệt hoàn tiền, tiền hoàn sẽ cộng trực tiếp vào Ví của bạn.',
              'When paying via VNPay, funds are credited to your Wallet and immediately debited for your service. Approved membership cancellation refunds are credited directly to your Wallet.',
            )}
          </p>
          {isMember && (
            <div
              style={{
                padding: 14,
                borderRadius: 14,
                border: '1px solid var(--portal-border, #ffffff1a)',
                background: 'var(--portal-surface, #292929)',
                display: 'grid',
                gap: 10,
                marginBottom: 16,
              }}
            >
              <div className="portal-label" style={{ marginBottom: 0 }}>{t('Nạp tiền vào Ví qua VNPay Sandbox', 'Top up Wallet via VNPay Sandbox')}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[100000, 200000, 500000, 1000000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    className={Number(topupAmount) === amt ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                    onClick={() => {
                      setTopupError(null);
                      setTopupAmount(String(amt));
                    }}
                  >
                    +{amt.toLocaleString('vi-VN')} đ
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="number"
                  className="portal-input"
                  aria-label={t('Số tiền nạp vào Ví (VNĐ)', 'Wallet top-up amount (VND)')}
                  min={10000}
                  max={100000000}
                  step={10000}
                  value={topupAmount}
                  onChange={(e) => {
                    setTopupError(null);
                    setTopupAmount(e.target.value);
                  }}
                  style={{ flex: '1 1 160px' }}
                />
                <button
                  type="button"
                  className="btn-primary"
                  data-testid="wallet-topup-btn"
                  disabled={topupBusy}
                  onClick={() => void handleWalletTopup()}
                >
                  {topupBusy ? t('Đang chuyển tới VNPay…', 'Redirecting to VNPay…') : t('Nạp vào Ví qua VNPay', 'Top up via VNPay')}
                </button>
              </div>
              {topupError && (
                <p className="form-error" role="alert" style={{ margin: 0 }}>
                  {topupError}
                </p>
              )}
            </div>
          )}
          <h3 className="portal-card-title" style={{ fontSize: 14, marginBottom: 10 }}>{t('Lịch sử giao dịch Ví', 'Wallet transaction history')}</h3>
          {walletTransactions.length === 0 ? (
            <p className="portal-subtitle" role="status">{t('Chưa có biến động số dư nào trong ví.', 'No wallet transactions yet.')}</p>
          ) : (
            <div style={{ display: 'grid', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
              {walletTransactions.map((tx, idx) => {
                const credit = isCreditTransaction(tx.type, tx.amount);
                const absAmount = Math.abs(Number(tx.amount ?? 0));
                return (
                  <div
                    key={tx.id ?? idx}
                    className="row-card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '10px 14px',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{walletTypeLabel(tx.type, lang)}</div>
                      {tx.description && (
                        <div className="row-card__meta" style={{ fontSize: 12 }}>{tx.description}</div>
                      )}
                      {tx.createdAt && (
                        <div className="row-card__meta" style={{ fontSize: 11 }}>{tx.createdAt}</div>
                      )}
                    </div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        fontVariantNumeric: 'tabular-nums',
                        color: credit ? 'var(--portal-success, #86efac)' : 'var(--portal-paper, #faf9f6)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {credit ? '+' : '-'}{absAmount.toLocaleString('vi-VN')} đ
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="form-actions" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-primary" onClick={() => setDialog(null)}>{t('Đóng', 'Close')}</button>
          </div>
        </Modal>
      )}
      {dialog === 'logout' && <Modal title={t('Đăng xuất khỏi SÖL?', 'Sign out of SÖL?')} onClose={() => setDialog(null)}>
        <p className="portal-subtitle">{t('Bạn có thể đăng nhập lại bất cứ lúc nào để tiếp tục hành trình.', 'You can sign back in anytime to continue your journey.')}</p>
        <div className="form-actions" style={{ marginTop: 24 }}>
          <button type="button" className="btn-secondary" onClick={() => setDialog(null)}>{t('Ở lại', 'Stay')}</button>
          <button type="button" className="btn-primary" onClick={() => { clearAuthSession(); navigate('/login', { replace: true }); }}>{t('Đăng xuất', 'Sign out')}</button>
        </div>
      </Modal>}
      {(dialog === 'menu' || dialog === 'search') && <Modal title={dialog === 'menu' ? t('Không gian của bạn', 'Your Workspace') : t('Tìm màn hình', 'Find Screen')} onClose={() => setDialog(null)} returnFocusRef={dialog === 'menu' ? moreRef : undefined}>
        <label className="portal-label" htmlFor="portal-screen-search">{t('Tên màn hình', 'Screen name')}</label>
        <input id="portal-screen-search" className="portal-input" type="search" placeholder={t('Ví dụ: lịch học, gói tập…', 'e.g. classes, memberships…')} value={query} onChange={(event) => setQuery(event.target.value)} />
        <nav className="portal-screen-results" aria-label={t('Các màn hình của bạn', 'Your screens')}>
          {results.map((item) => item.to === '/member/notifications' ? <button key={item.to} type="button" onClick={() => {
            notificationTrigger.current = document.querySelector<HTMLButtonElement>('.member-notification-bell');
            setDialog('notifications');
          }}><span>{item.label}</span><PortalIcon name="arrow" size={16} /></button> : <NavLink key={item.to} to={item.to} onClick={() => setDialog(null)}>
            <span>{item.label}</span><PortalIcon name="arrow" size={16} />
          </NavLink>)}
          {results.length === 0 && <p className="portal-search-empty" role="status">{t('Không tìm thấy màn hình. Hãy thử từ khóa khác.', 'No matching screens found. Try another keyword.')}</p>}
        </nav>
        {dialog === 'menu' && <div className="portal-menu-settings">
          <PwaStatus mode="install" />
          <Link className="portal-menu-home" to="/" onClick={() => setDialog(null)}>{t('Về trang chủ SÖL', 'Back to SÖL Home')}</Link>
        </div>}
      </Modal>}
    </div>
  </div>;
}
