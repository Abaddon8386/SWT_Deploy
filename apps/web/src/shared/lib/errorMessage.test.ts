import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { errorMessage } from './errorMessage';

describe('errorMessage', () => {
  it('keeps API and business messages', () => {
    expect(errorMessage(new ApiError('Gói tập đã hết hạn.', 409), 'Lỗi')).toBe('Gói tập đã hết hạn.');
    expect(errorMessage(new Error('Dữ liệu không hợp lệ.'), 'Lỗi')).toBe('Dữ liệu không hợp lệ.');
  });

  it('hides programming errors and unknown values behind the fallback', () => {
    expect(errorMessage(new TypeError('(intermediate value).map is not a function'), 'Không thể tải.')).toBe('Không thể tải.');
    expect(errorMessage(new SyntaxError('Unexpected token <'), 'Không thể tải.')).toBe('Không thể tải.');
    expect(errorMessage('boom', 'Không thể tải.')).toBe('Không thể tải.');
    expect(errorMessage(new Error(''), 'Không thể tải.')).toBe('Không thể tải.');
  });
});
