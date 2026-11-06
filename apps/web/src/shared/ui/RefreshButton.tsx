import { PortalIcon } from '../../features/portal/PortalIcon';

interface RefreshButtonProps {
  label?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'bare';
}

/** Nút làm mới gọn (chỉ biểu tượng) cho thao tác thủ công ít dùng; nhãn vẫn có cho trình đọc màn hình. */
export function RefreshButton({
  label = 'Làm mới',
  onClick,
  disabled,
  className = '',
  variant = 'default',
}: RefreshButtonProps) {
  const baseClass = variant === 'bare' ? 'portal-icon-bare' : 'portal-icon-button';
  return <button
    type="button"
    className={`${baseClass} refresh-button ${className}`.trim()}
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
  >
    <PortalIcon name="refresh" size={17} /><span className="sr-only">{label}</span>
  </button>;
}
