/**
 * Báo giá nâng cấp gói, cùng quy tắc với backend (`SubscriptionValueCalculator`):
 * phí = giá gói mới hiện tại − giá trị còn lại của kỳ đang dùng.
 *
 * Giá trị còn lại (`remainingValue`) do backend tính từ số tiền hội viên **thực trả** cho kỳ hiện tại theo tỷ lệ ngày
 * chưa dùng, không phải từ giá niêm yết, nên Quản lý đổi giá gói cũ không làm lệch báo giá. Số tiền cuối cùng luôn do
 * backend chốt khi gửi yêu cầu; đây chỉ là bản xem trước.
 */
export interface UpgradeQuote {
  /** Số tiền phải thanh toán; 0 khi không nâng cấp được. */
  amount: number;
  /** Giá trị còn lại của kỳ hiện tại được trừ vào giá gói mới. */
  credit: number;
  /** Số ngày chưa dùng của kỳ hiện tại, tính cả hôm nay. */
  remainingDays: number;
  totalDays: number;
  /** false khi giá trị còn lại đã bằng hoặc vượt giá gói mới. */
  allowed: boolean;
}

const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

export function upgradeQuote(
  current: { startDate: string; endDate: string; remainingValue?: number | null },
  targetPrice: number,
  today: string,
): UpgradeQuote | null {
  if (typeof current.remainingValue !== 'number') return null;
  const totalDays = dayNumber(current.endDate) - dayNumber(current.startDate) + 1;
  const remainingDays = Math.min(totalDays, Math.max(0, dayNumber(current.endDate) - dayNumber(today) + 1));
  const credit = current.remainingValue;
  const amount = targetPrice - credit;
  return { amount: Math.max(0, amount), credit, remainingDays, totalDays, allowed: amount > 0 };
}
