import { useEffect, useRef } from 'react';

/** Các cửa sổ nổi góc phải (Tin nhắn, Trợ lý AI) dùng chung một vị trí: mở cái này thì đóng cái kia. */
const FLOATING_PANEL_EVENT = 'sol-floating-panel';

export function announceFloatingPanel(id: string) {
  window.dispatchEvent(new CustomEvent<string>(FLOATING_PANEL_EVENT, { detail: id }));
}

export function useCloseWhenOtherPanelOpens(id: string, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);
  useEffect(() => {
    const onOpen = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) closeRef.current(); };
    window.addEventListener(FLOATING_PANEL_EVENT, onOpen);
    return () => window.removeEventListener(FLOATING_PANEL_EVENT, onOpen);
  }, [id]);
}
