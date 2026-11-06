import { useI18n } from '../i18n';
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
  className?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/** Hộp thoại dựa trên <dialog> gốc: có sẵn focus trap, phím Esc và backdrop. */
export function Modal({ title, onClose, children, busy = false, className, returnFocusRef }: ModalProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      // Successful cancellation replaces the pending panel with the catalog before cleanup.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const returnTarget = returnFocusRef?.current;
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
    };
  }, [returnFocusRef]);

  return (
    <dialog
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-busy={busy}
      className={`portal-dialog ${className || ''}`.trim()}
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      aria-labelledby={titleId}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const dialog = event.currentTarget;
        if (event.target instanceof Element && event.target.closest('dialog') !== dialog) return;
        const controls = [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
          .filter(element => element.closest('dialog') === dialog && element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (!first) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}
      tabIndex={-1}
      onCancel={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="portal-dialog__body" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <div className="portal-dialog__header">
          <h2 id={titleId} className="portal-card-title">{title}</h2>
          <button type="button" className="portal-dialog__close" aria-label={t('Đóng hộp thoại')} disabled={busy} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
