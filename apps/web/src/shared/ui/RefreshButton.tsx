import { useI18n } from '../i18n';
import { PortalIcon } from '../../features/portal/PortalIcon';

interface RefreshButtonProps {
  label?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'bare';
}

/** Nút làm mới gọn (chỉ biểu tượng) cho thao tác thủ công ít dùng; nhãn vẫn có cho trình đọc màn hình. */
export function RefreshButton({ label, onClick, disabled, className = '', variant = 'default' }: RefreshButtonProps) {
  const { t } = useI18n();
  const text = label ?? t('Làm mới');
  const baseClass = variant === 'bare' ? 'portal-icon-bare' : 'portal-icon-button';
  return <button
    type="button"
    className={`${baseClass} refresh-button ${className}`.trim()}
    title={text}
    aria-label={text}
    disabled={disabled}
    onClick={onClick}
  >
    <PortalIcon name="refresh" size={17} /><span className="sr-only">{text}</span>
  </button>;
}
