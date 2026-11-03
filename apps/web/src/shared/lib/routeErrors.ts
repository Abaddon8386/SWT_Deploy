/** Không tải được module của trang (mất mạng, bản build mới thay tên file) khác với lỗi hiển thị trong trang. */
export function isModuleLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch|ChunkLoadError/i.test(message);
}
