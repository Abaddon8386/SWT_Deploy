import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

export interface WidgetPosition { x: number; y: number }

const STORAGE_KEY = 'sol-chat-widget-position';
const EDGE = 8;
const DRAG_THRESHOLD = 6;
/** Vùng kéo trong panel: thanh tiêu đề; không bắt đầu kéo từ nút, link hay ô nhập. */
const PANEL_HANDLE = '.chat-widget__header, .direct-chat__thread-header, .direct-chat__inbox-heading';
const INTERACTIVE = 'button, a, input, textarea, select, [role="button"], [contenteditable="true"]';

function readStored(): WidgetPosition | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<WidgetPosition>;
    return typeof value.x === 'number' && typeof value.y === 'number' ? { x: value.x, y: value.y } : null;
  } catch {
    return null;
  }
}

function store(pos: WidgetPosition) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch { /* bỏ qua khi bị chặn storage */ }
}

function clampToViewport(pos: WidgetPosition, width: number, height: number): WidgetPosition {
  const maxX = Math.max(EDGE, window.innerWidth - width - EDGE);
  const maxY = Math.max(EDGE, window.innerHeight - height - EDGE);
  return { x: Math.min(Math.max(pos.x, EDGE), maxX), y: Math.min(Math.max(pos.y, EDGE), maxY) };
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  origin: WidgetPosition;
  width: number;
  height: number;
  moved: boolean;
  target: Element;
}

/**
 * Cho phép kéo nút chat (và panel qua thanh tiêu đề) tới bất kỳ đâu trong viewport.
 * Vị trí lưu theo trình duyệt; panel mở về phía còn trống và luôn nằm trong màn hình.
 */
export function useDraggableWidget(deps: { open: boolean; expanded: boolean; onMove?: () => void }) {
  const widget = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [pos, setPos] = useState<WidgetPosition | null>(() => (typeof window === 'undefined' ? null : readStored()));
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  /** Hướng mở panel được giữ cố định trong lúc kéo để panel không nhảy khi qua giữa màn hình. */
  const frozenAnchor = useRef<{ right: boolean; bottom: boolean } | null>(null);
  const { open, expanded, onMove } = deps;

  const placePanel = useCallback(() => {
    const host = widget.current;
    const box = panel.current;
    if (!pos || !host || !box) { setPanelPos(null); return; }
    const rect = host.getBoundingClientRect();
    const width = box.offsetWidth;
    const height = box.offsetHeight;
    const anchor = frozenAnchor.current ?? {
      right: rect.left + rect.width / 2 > window.innerWidth / 2,
      bottom: rect.top + rect.height / 2 > window.innerHeight / 2,
    };
    const left = anchor.right ? rect.right - width : rect.left;
    const top = anchor.bottom ? rect.bottom - height : rect.top;
    const next = {
      left: Math.round(Math.min(Math.max(left, EDGE), Math.max(EDGE, window.innerWidth - width - EDGE))),
      top: Math.round(Math.min(Math.max(top, EDGE), Math.max(EDGE, window.innerHeight - height - EDGE))),
    };
    setPanelPos(prev => (prev && prev.left === next.left && prev.top === next.top ? prev : next));
  }, [pos]);

  useLayoutEffect(() => { placePanel(); }, [placePanel, open, expanded]);

  // Panel đổi kích thước (mở rộng có transition) hoặc cửa sổ đổi cỡ: đặt lại cho vừa màn hình.
  useEffect(() => {
    const box = panel.current;
    const onResize = () => {
      const host = widget.current;
      if (host) setPos(prev => (prev ? clampToViewport(prev, host.offsetWidth, host.offsetHeight) : prev));
      placePanel();
    };
    window.addEventListener('resize', onResize);
    const observer = box && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => placePanel()) : null;
    if (box) observer?.observe(box);
    return () => { window.removeEventListener('resize', onResize); observer?.disconnect(); };
  }, [placePanel, open]);

  useEffect(() => { onMove?.(); }, [pos, panelPos, onMove]);

  const begin = useCallback((event: ReactPointerEvent<Element>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    const host = widget.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: { x: rect.left, y: rect.top },
      width: rect.width,
      height: rect.height,
      moved: false,
      target: event.currentTarget,
    };
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const state = drag.current;
      if (!state || event.pointerId !== state.pointerId) return;
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      if (!state.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        state.moved = true;
        const host = widget.current;
        if (host) {
          const rect = host.getBoundingClientRect();
          frozenAnchor.current = {
            right: rect.left + rect.width / 2 > window.innerWidth / 2,
            bottom: rect.top + rect.height / 2 > window.innerHeight / 2,
          };
        }
        try { (state.target as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(state.pointerId); } catch { /* đã nhả */ }
        setDragging(true);
      }
      event.preventDefault();
      setPos(clampToViewport({ x: state.origin.x + dx, y: state.origin.y + dy }, state.width, state.height));
    };
    const finish = (event: PointerEvent) => {
      const state = drag.current;
      if (!state || event.pointerId !== state.pointerId) return;
      drag.current = null;
      if (!state.moved) return;
      suppressClick.current = true;
      // Click phát sau pointerup: chặn đúng một click rồi trả lại bình thường.
      window.setTimeout(() => { suppressClick.current = false; }, 0);
      frozenAnchor.current = null;
      setDragging(false);
      setPos(prev => { if (prev) store(prev); return prev; });
    };
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, []);

  const onPanelPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target as Element;
    if (!target.closest(PANEL_HANDLE) || target.closest(INTERACTIVE)) return;
    begin(event);
  }, [begin]);

  /** true nếu click vừa rồi là kết thúc thao tác kéo (không được coi là bấm mở/đóng). */
  const consumeDragClick = useCallback(() => suppressClick.current, []);

  const widgetStyle: CSSProperties | undefined = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : undefined;
  const panelStyle: CSSProperties | undefined = pos && panelPos
    ? { position: 'fixed', left: panelPos.left, top: panelPos.top, right: 'auto', bottom: 'auto' }
    : undefined;

  return { widgetRef: widget, panelRef: panel, widgetStyle, panelStyle, dragging, onTriggerPointerDown: begin, onPanelPointerDown, consumeDragClick };
}
