import { afterEach, expect, it } from 'vitest';
import { setLanguage } from '../../shared/i18n/language';
import { memberError, memberMessage, memberRenderMessage, memberText } from './memberI18n';

afterEach(() => setLanguage('vi'));

it('keeps explicit source messages bilingual and raw API text verbatim', () => {
  const local = memberMessage('Không thể tải hồ sơ.');
  const api = memberError(new Error('Không thể tải hồ sơ.'), 'Không thể tải hồ sơ.');
  expect(memberRenderMessage(local)).toBe('Không thể tải hồ sơ.');
  setLanguage('en');
  expect(memberRenderMessage(local)).toBe('Unable to load profile.');
  expect(memberRenderMessage(api)).toBe('Không thể tải hồ sơ.');
  expect(memberRenderMessage(memberError(null, 'Không thể tải hồ sơ.'))).toBe('Unable to load profile.');
});

it('uses explicit pairs for dynamic copy and preserves whitespace', () => {
  setLanguage('en');
  expect(memberText('Ngày hết hạn: ')).toBe('Expiry date: ');
  expect(memberText('Đã đặt 3 buổi.', '3 sessions booked.')).toBe('3 sessions booked.');
});
it('replaces programming errors and empty errors with bilingual safe source copy', () => {
  for (const reason of [new TypeError('private implementation detail'), new SyntaxError('private parser detail'), new Error('')]) {
    const result = memberError(reason, 'Không thể tải hồ sơ.');
    expect(memberRenderMessage(result)).toBe('Không thể tải hồ sơ.');
    setLanguage('en');
    expect(memberRenderMessage(result)).toBe('Unable to load profile.');
    setLanguage('vi');
  }
});
