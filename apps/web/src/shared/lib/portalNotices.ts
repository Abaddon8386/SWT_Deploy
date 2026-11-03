import { useSyncExternalStore } from 'react';
import { toast } from '../ui/toast';

/**
 * Thông báo phát sinh tại client (kết quả thao tác, trạng thái đồng bộ…) thay cho banner chèn trong trang.
 * Hiển thị trong bảng chuông thông báo của portal; lỗi/thành công còn có toast ngắn để phản hồi ngay.
 */
export type PortalNoticeType = 'success' | 'error' | 'info';

export interface PortalNotice {
  id: number;
  type: PortalNoticeType;
  message: string;
  createdAt: number;
  read: boolean;
  destination?: string;
  key?: string;
  action?: { label: string; run: () => void };
}

const MAX_NOTICES = 30;
let notices: PortalNotice[] = [];
let sequence = 0;
const listeners = new Set<() => void>();

function commit(next: PortalNotice[]) {
  notices = next;
  listeners.forEach((listener) => listener());
}

/** `key` thay thế thông báo cùng khóa (ví dụ trạng thái đồng bộ) để không lặp lại. */
export function notify(message: string, type: PortalNoticeType = 'info', options: { key?: string; action?: PortalNotice['action']; silent?: boolean } = {}) {
  const notice: PortalNotice = { id: ++sequence, type, message, createdAt: Date.now(), read: false, destination: typeof window !== 'undefined' ? window.location.pathname : undefined, key: options.key, action: options.action };
  commit([notice, ...notices.filter((item) => !options.key || item.key !== options.key)].slice(0, MAX_NOTICES));
  if (type !== 'info' && !options.silent) toast(message, type);
}

/** Gỡ thông báo theo khóa khi tình trạng đã hết (ví dụ đồng bộ lại thành công). */
export function resolveNotice(key: string) {
  if (notices.some((item) => item.key === key)) commit(notices.filter((item) => item.key !== key));
}

export function markNoticesRead() {
  if (notices.some((item) => !item.read)) commit(notices.map((item) => ({ ...item, read: true })));
}

export function clearNotices() {
  if (notices.length) commit([]);
}

export const getNotices = () => notices;
export function subscribeNotices(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function usePortalNotices(): PortalNotice[] {
  return useSyncExternalStore(subscribeNotices, getNotices, getNotices);
}
