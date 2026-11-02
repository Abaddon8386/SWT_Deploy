import { PortalIcon } from '../../features/portal/PortalIcon';

/** Nút làm mới gọn (chỉ biểu tượng) cho thao tác thủ công ít dùng; nhãn vẫn có cho trình đọc màn hình. */
export function RefreshButton({ label = 'Làm mới', onClick, disabled }: { label?: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="portal-icon-button refresh-button" title={label} disabled={disabled} onClick={onClick}>
    <PortalIcon name="refresh" size={17} /><span className="sr-only">{label}</span>
  </button>;
}
