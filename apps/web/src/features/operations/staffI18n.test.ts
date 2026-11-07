import { beforeEach, expect, it, vi } from 'vitest';
import { notify } from '../../shared/lib/portalNotices';
import { staffMessage, staffNotify } from './staffI18n';

vi.mock('../../shared/lib/portalNotices', () => ({ notify: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it('keeps backend error text raw and preserves the two-argument notice call', () => {
  staffNotify(new Error('Đóng'), 'error');
  expect(notify).toHaveBeenCalledWith('Đóng', 'error');
  expect(vi.mocked(notify).mock.calls[0]).toHaveLength(2);
});

it('attaches explicit source provenance for client-owned notices', () => {
  staffNotify('Cập nhật thành công', 'success');
  expect(notify).toHaveBeenCalledWith('Cập nhật thành công', 'success', { translation: { vi: 'Cập nhật thành công', en: 'Updated successfully' } });
});

it('retains record options alongside an interpolated bilingual source message', () => {
  staffNotify(staffMessage('Đã lưu "Đóng".', 'Saved "Đóng".'), 'success', { record: true });
  expect(notify).toHaveBeenCalledWith('Đã lưu "Đóng".', 'success', { record: true, translation: { vi: 'Đã lưu "Đóng".', en: 'Saved "Đóng".' } });
});
