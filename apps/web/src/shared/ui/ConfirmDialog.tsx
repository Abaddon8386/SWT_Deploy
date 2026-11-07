import { useI18n, type SourceMessage } from '../i18n';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: string | SourceMessage;
  message: ReactNode | SourceMessage;
  confirmLabel?: string | SourceMessage;
  cancelLabel?: string | SourceMessage;
  /** Thao tác có hậu quả lớn (xóa, khóa, hủy): nút xác nhận dùng kiểu nguy hiểm. */
  danger?: boolean;
}

/**
 * Hộp xác nhận dùng `Modal` của portal thay cho `window.confirm`, giữ cùng theme, focus và phím Esc.
 * `const [confirm, confirmDialog] = useConfirm();` rồi `if (!(await confirm({...}))) return;` và render `{confirmDialog}`.
 */
export function useConfirm() {
  const { t } = useI18n();
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

  const message = options?.message;
  const renderedMessage = message && typeof message === 'object' && 'vi' in message && 'en' in message ? t(message as SourceMessage) : message as ReactNode;
  const renderLabel = (value: string | SourceMessage) => typeof value === 'string' ? value : t(value);
  const dialog = options && <Modal title={renderLabel(options.title)} onClose={() => settle(false)} returnFocusRef={returnFocus}>
    <div className="portal-subtitle confirm-dialog__message">{renderedMessage}</div>
    <div className="form-actions confirm-dialog__actions">
      <button type="button" className="btn-secondary" onClick={() => settle(false)}>{options.cancelLabel ? renderLabel(options.cancelLabel) : t('Hủy')}</button>
      <button type="button" className={options.danger ? 'btn-danger' : 'btn-primary'} onClick={() => settle(true)}>{options.confirmLabel ? renderLabel(options.confirmLabel) : t('Xác nhận')}</button>
    </div>
  </Modal>;

  return [confirm, dialog] as const;
}
