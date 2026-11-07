import { useLanguage } from '../../shared/i18n/language';
import { useI18n } from '../../shared/i18n';
import { useEffect, useRef, type RefObject } from 'react';
import { MemberNotificationsPanel } from './MemberNotificationsPage';

export function NotificationsPopover({ onClose, triggerRef }: { onClose: () => void; triggerRef: RefObject<HTMLElement | null> }) {
  useLanguage();
  const { t } = useI18n();
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) onClose();
    };
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', escape);
      document.removeEventListener('pointerdown', outside);
    };
  }, [onClose, triggerRef]);

  return <section data-i18n-managed ref={panel} id="portal-notifications" className="notification-popover" role="dialog" aria-label={t('Thông báo', "Notifications")}>
    <header className="notification-popover__header"><h2>{t('Thông báo', "Notifications")}</h2><button ref={closeButton} type="button" className="portal-icon-button" aria-label={t('Đóng thông báo', "Close notification")} onClick={onClose}><span aria-hidden="true">×</span></button></header>
    <MemberNotificationsPanel onNavigate={onClose} />
  </section>;
}
