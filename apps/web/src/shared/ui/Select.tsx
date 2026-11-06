import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import './select.css';

interface Opt {
  value: string;
  label: string;
  disabled: boolean;
}

interface SelectProps {
  id?: string;
  className?: string;
  style?: CSSProperties;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  /** Neo focus khi form báo lỗi (xem `[data-field]` ở checkout/editor). Gắn lên nút kích hoạt. */
  'data-field'?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  /** Dùng các thẻ <option> như <select> gốc (hỗ trợ cả Fragment/map). */
  children: ReactNode;
}

const EXIT_MS = 160;
const MENU_MAX = 280;

function toText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (isValidElement(node)) return toText((node.props as { children?: ReactNode }).children);
  return '';
}

function collect(children: ReactNode, out: Opt[] = []): Opt[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string; disabled?: boolean; children?: ReactNode }>;
    if (el.type === Fragment) collect(el.props.children, out);
    else if (el.type === 'option') {
      const label = toText(el.props.children);
      out.push({ value: el.props.value != null ? String(el.props.value) : label, label, disabled: !!el.props.disabled });
    }
  });
  return out;
}

/**
 * Dropdown tùy biến thay cho <select>: cùng API (value/onChange/<option>) nhưng có
 * animation mở/đóng, mũi tên xoay, dấu chọn, điều hướng bàn phím và tự lật lên/xuống.
 */
export function Select({
  id,
  className = '',
  style,
  value,
  onChange,
  disabled,
  required,
  name,
  children,
  ...aria
}: SelectProps) {
  const uid = useId();
  const listId = `${uid}-list`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeRef = useRef({ buf: '', t: 0 });

  const options = collect(children);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(-1);
  const [placement, setPlacement] = useState<'down' | 'up'>('down');
  const [maxH, setMaxH] = useState(MENU_MAX);

  const openMenu = useCallback(() => {
    if (disabled) return;
    setMounted(true);
    setOpen(true);
    setActive(selectedIndex >= 0 ? selectedIndex : options.findIndex((o) => !o.disabled));
  }, [disabled, selectedIndex, options]);

  const closeMenu = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  // Giữ DOM thêm một nhịp để chạy animation đóng
  useEffect(() => {
    if (open || !mounted) return;
    const t = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  // Chọn hướng mở dựa trên vùng nhìn thấy (viewport hoặc <dialog> chứa nó)
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dialog = triggerRef.current.closest('dialog')?.getBoundingClientRect();
    const top = dialog ? Math.max(dialog.top, 0) : 0;
    const bottom = dialog ? Math.min(dialog.bottom, window.innerHeight) : window.innerHeight;
    const below = bottom - rect.bottom - 12;
    const above = rect.top - top - 12;
    const need = Math.min(options.length * 42 + 12, MENU_MAX);
    const up = below < need && above > below;
    setPlacement(up ? 'up' : 'down');
    setMaxH(Math.max(120, Math.min(MENU_MAX, up ? above : below)));
  }, [open, options.length]);

  // Đóng khi bấm ra ngoài
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Cuộn mục đang active vào vùng nhìn
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const pick = (opt: Opt) => {
    if (opt.disabled) return;
    if (opt.value !== value) onChange({ target: { value: opt.value } });
    closeMenu();
  };

  const move = (dir: 1 | -1, from = active) => {
    if (!options.some((o) => !o.disabled)) return;
    let i = from;
    do {
      i = (i + dir + options.length) % options.length;
    } while (options[i].disabled);
    setActive(i);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openMenu();
        else move(e.key === 'ArrowDown' ? 1 : -1);
        return;
      case 'Home':
      case 'End':
        if (!open) return;
        e.preventDefault();
        setActive(e.key === 'Home' ? options.findIndex((o) => !o.disabled) : options.map((o) => !o.disabled).lastIndexOf(true));
        return;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) openMenu();
        else if (active >= 0) pick(options[active]);
        return;
      case 'Escape':
        if (open) {
          e.preventDefault();
          e.stopPropagation(); // không đóng <dialog> cha
          closeMenu();
        }
        return;
      case 'Tab':
        if (open) setOpen(false);
        return;
    }
    // Gõ ký tự để nhảy tới mục tương ứng
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const tr = typeRef.current;
      window.clearTimeout(tr.t);
      tr.buf += e.key.toLowerCase();
      tr.t = window.setTimeout(() => (tr.buf = ''), 600);
      const hit = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(tr.buf));
      if (hit >= 0) {
        if (!open) openMenu();
        setActive(hit);
      }
    }
  };

  return (
    <div
      ref={wrapRef}
      className={`ui-select ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`}
      style={style}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`portal-select ui-select__trigger ${className}`.trim()}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${uid}-opt-${active}` : undefined}
        aria-label={aria['aria-label']}
        aria-invalid={aria['aria-invalid']}
        data-field={aria['data-field']}
        disabled={disabled}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className={`ui-select__value ${selected && selected.value !== '' ? '' : 'is-placeholder'}`}>
          {selected?.label ?? '—'}
        </span>
        <svg className="ui-select__chevron" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 4.25 6 8l4-3.75" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

        <select
          className="ui-select__native"
          tabIndex={-1}
          aria-hidden="true"
          aria-label={aria['aria-label']}
          name={name}
          required={required}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange({ target: { value: e.target.value } })}
        >
          {!options.some((o) => o.value === value) && <option value={value} />}
          {options.map((o, i) => (
            <option key={`${o.value}-${i}`} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>

      {mounted && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className={`ui-select__menu ui-select__menu--${placement} ${open ? 'is-open' : 'is-closing'}`}
          style={{ maxHeight: maxH }}
        >
          {options.map((o, i) => (
            <li
              key={`${o.value}-${i}`}
              id={`${uid}-opt-${i}`}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled || undefined}
              className={`ui-select__option${o.value === value ? ' is-selected' : ''}${i === active ? ' is-active' : ''}${o.disabled ? ' is-disabled' : ''}`}
              style={{ '--i': i } as CSSProperties}
              onPointerEnter={() => !o.disabled && setActive(i)}
              onClick={() => pick(o)}
            >
              <span className="ui-select__label">{o.label}</span>
              <svg className="ui-select__check" viewBox="0 0 12 12" aria-hidden="true">
                <path d="m2.5 6.4 2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
