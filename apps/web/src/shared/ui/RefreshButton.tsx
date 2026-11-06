import { useI18n } from '../i18n';
import { PortalIcon } from '../../features/portal/PortalIcon';

/** Nút làm mới gọn (chỉ biểu tượng) cho thao tác thủ công ít dùng; nhãn vẫn có cho trình đọc màn hình. */
export function RefreshButton({ label, onClick, disabled }: { label?: string; onClick: () => void; disabled?: boolean }) {
  const { t } = useI18n();
  const text = label ?? t('Làm mới');
  return <button type="button" className="portal-icon-button refresh-button" title={text} disabled={disabled} onClick={onClick}>
    <PortalIcon name="refresh" size={17} /><span className="sr-only">{text}</span>
  </button>;
}
