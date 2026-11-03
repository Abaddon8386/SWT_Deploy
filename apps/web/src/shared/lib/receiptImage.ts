const MAX_EDGE = 1400;
const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

/** Đọc ảnh hóa đơn, thu nhỏ và nén về JPEG data URL để gửi kèm yêu cầu thanh toán. */
export async function readReceiptImage(file: File): Promise<string> {
  if (!ACCEPTED.includes(file.type)) throw new Error('Chỉ nhận ảnh JPEG, PNG hoặc WebP.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('Ảnh quá lớn, vui lòng chọn ảnh dưới 12MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Trình duyệt không xử lý được ảnh này.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    bitmap.close();
  }
}
