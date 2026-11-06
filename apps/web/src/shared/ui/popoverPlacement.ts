export interface PopoverPlacement {
  v: 'down' | 'up';
  h: 'left' | 'right';
}

/**
 * Chọn hướng mở cho popover (lịch, giờ) để không bị cắt bởi viewport hoặc <dialog> chứa nó:
 * lật lên khi phía dưới không đủ chỗ, căn phải khi tràn mép phải.
 */
export function popoverPlacement(trigger: HTMLElement, width: number, height: number): PopoverPlacement {
  const rect = trigger.getBoundingClientRect();
  const dialog = trigger.closest('dialog')?.getBoundingClientRect();
  const top = dialog ? Math.max(dialog.top, 0) : 0;
  const bottom = dialog ? Math.min(dialog.bottom, window.innerHeight) : window.innerHeight;
  const right = dialog ? Math.min(dialog.right, window.innerWidth) : window.innerWidth;
  const below = bottom - rect.bottom - 12;
  const above = rect.top - top - 12;
  return {
    v: below < height && above > below ? 'up' : 'down',
    h: rect.left + width > right - 8 && rect.right - width >= 8 ? 'right' : 'left',
  };
}
