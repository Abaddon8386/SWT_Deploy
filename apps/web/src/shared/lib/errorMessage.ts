/**
 * Thông điệp an toàn để hiển thị cho người dùng: giữ lỗi từ API (`ApiError`) và lỗi nghiệp vụ (`new Error('...')`),
 * thay lỗi lập trình (TypeError, SyntaxError…) bằng câu chung để không lộ chi tiết kỹ thuật.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.name === 'Error' && error.message) return error.message;
  return fallback;
}

/** Keep API/business error content verbatim; only source-owned fallbacks are translatable. */
export function localizableError(error: unknown, fallback: string): string | Error {
  return error instanceof Error && error.name === 'Error' && error.message ? error : fallback;
}
