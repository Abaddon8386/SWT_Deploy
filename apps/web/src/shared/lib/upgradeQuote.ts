/**
 * Báo giá nâng cấp gói, cùng quy tắc với backend (`MembershipSubscriptionService.upgradeCharge`):
 * đã dùng quá một nửa thời hạn thì đóng đủ giá gói mới, chưa quá một nửa thì chỉ bù chênh lệch giá.
 * Số tiền cuối cùng luôn do backend chốt; đây chỉ là bản xem trước.
 */
export interface UpgradeQuote {
  amount: number;
  mode: 'difference' | 'full';
  usedDays: number;
  totalDays: number;
}

const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

export function upgradeQuote(
  current: { startDate: string; endDate: string },
  currentPrice: number,
  targetPrice: number,
  today: string,
): UpgradeQuote {
  const totalDays = dayNumber(current.endDate) - dayNumber(current.startDate) + 1;
  const usedDays = Math.max(0, dayNumber(today) - dayNumber(current.startDate));
  const difference = targetPrice - currentPrice;
  const isFull = (totalDays > 0 && usedDays * 2 > totalDays) || difference <= 0;
  return { amount: isFull ? targetPrice : difference, mode: isFull ? 'full' : 'difference', usedDays, totalDays };
}
