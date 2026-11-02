import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearNotices, getNotices, markNoticesRead, notify, resolveNotice } from './portalNotices';

describe('portalNotices', () => {
  beforeEach(() => { clearNotices(); document.body.innerHTML = ''; });
  afterEach(() => { vi.useRealTimers(); });

  it('keeps newest first and shows a toast only for success/error', () => {
    notify('Thông tin', 'info');
    expect(document.querySelector('.sol-toast')).toBeNull();
    notify('Đã lưu', 'success');
    expect(document.querySelector('.sol-toast')?.textContent).toContain('Đã lưu');
    expect(getNotices().map((item) => item.message)).toEqual(['Đã lưu', 'Thông tin']);
  });

  it('replaces a notice with the same key and removes it when resolved', () => {
    notify('Mất kết nối', 'error', { key: 'sync' });
    notify('Vẫn mất kết nối', 'error', { key: 'sync' });
    expect(getNotices()).toHaveLength(1);
    expect(getNotices()[0].message).toBe('Vẫn mất kết nối');
    resolveNotice('sync');
    expect(getNotices()).toHaveLength(0);
  });

  it('marks notices read and caps the list', () => {
    for (let index = 0; index < 40; index++) notify(`Thông báo ${index}`, 'info');
    expect(getNotices()).toHaveLength(30);
    expect(getNotices().every((item) => !item.read)).toBe(true);
    markNoticesRead();
    expect(getNotices().every((item) => item.read)).toBe(true);
  });
});
