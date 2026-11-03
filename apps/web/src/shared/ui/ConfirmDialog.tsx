import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Thao tác có hậu quả lớn (xóa, khóa, hủy): nút xác nhận dùng kiểu nguy hiểm. */
  danger?: boolean;
}

/**
 * Hộp xác nhận dùng `Modal` của portal thay cho `window.confirm`, giữ cùng theme, focus và phím Esc.
 * `const [confirm, confirmDialog] = useConfirm();` rồi `if (!(await confirm({...}))) return;` và render `{confirmDialog}`.
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOptions(next);
  }), []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  const dialog = options && <Modal title={options.title} onClose={() => settle(false)} returnFocusRef={returnFocus}>
    <div className="portal-subtitle confirm-dialog__message">{options.message}</div>
    <div className="form-actions confirm-dialog__actions">
      <button type="button" className="btn-secondary" onClick={() => settle(false)}>{options.cancelLabel ?? 'Hủy'}</button>
      <button type="button" className={options.danger ? 'btn-danger' : 'btn-primary'} onClick={() => settle(true)}>{options.confirmLabel ?? 'Xác nhận'}</button>
    </div>
  </Modal>;

  return [confirm, dialog] as const;
}
