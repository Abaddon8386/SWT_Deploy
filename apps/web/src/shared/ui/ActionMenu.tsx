import { useI18n } from '../i18n';
import { useEffect, useRef, type ReactNode } from 'react';
import './action-menu.css';

/** Menu "⋯" cho thao tác ít dùng: giữ chúng trong tầm tay nhưng không chiếm chỗ cạnh nút chính. */
export function ActionMenu({ label, children }: { label?: string; children: ReactNode }) {
  const { t } = useI18n();
  const displayLabel = label ?? t('Thao tác khác', 'More actions');
  const root = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = () => root.current?.removeAttribute('open');
    const outside = (event: PointerEvent) => {
      if (root.current?.open && event.target instanceof Node && !root.current.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && root.current?.open) { close(); root.current.querySelector('summary')?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);

  return <details ref={root} className="action-menu">
    <summary className="action-menu__trigger" aria-label={displayLabel} title={displayLabel}><span aria-hidden="true">⋯</span></summary>
    <div className="action-menu__list" onClick={(event) => { if ((event.target as HTMLElement).closest('button, a')) root.current?.removeAttribute('open'); }}>{children}</div>
  </details>;
}
