import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearNotices, getNotices, markNoticesRead, notify, resolveNotice } from './portalNotices';

describe('portalNotices', () => {
  beforeEach(() => { clearNotices(); document.body.innerHTML = ''; });
  afterEach(() => { vi.useRealTimers(); });

  it('toasts success/error but only records important notices in the bell', () => {
    notify('Thông tin', 'info', { record: true });
    expect(document.querySelector('.sol-toast')).toBeNull();
    notify('Đã lưu hồ sơ', 'success');
    expect(document.querySelector('.sol-toast')?.textContent).toContain('Đã lưu hồ sơ');
    notify('Đã thanh toán', 'success', { record: true });
    expect(getNotices().map((item) => item.message)).toEqual(['Đã thanh toán', 'Thông tin']);
  });

  it('replaces a notice with the same key and removes it when resolved', () => {
    notify('Mất kết nối', 'error', { key: 'sync', record: true });
    notify('Vẫn mất kết nối', 'error', { key: 'sync', record: true });
    expect(getNotices()).toHaveLength(1);
    expect(getNotices()[0].message).toBe('Vẫn mất kết nối');
    resolveNotice('sync');
    expect(getNotices()).toHaveLength(0);
  });

  it('marks notices read and caps the list', () => {
    for (let index = 0; index < 40; index++) notify(`Thông báo ${index}`, 'info', { record: true });
    expect(getNotices()).toHaveLength(30);
    expect(getNotices().every((item) => !item.read)).toBe(true);
    markNoticesRead();
    expect(getNotices().every((item) => item.read)).toBe(true);
  });
});
