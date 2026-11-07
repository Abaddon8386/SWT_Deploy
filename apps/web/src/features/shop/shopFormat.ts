import { sourceText, sourceFormat } from "./shopI18n";
import { formatPrice } from '../../shared/lib/membershipPresentation';
import type { FulfillmentMethod, OrderPaymentMethod, OrderStatus, ProductForm, ProductGoal } from './shopTypes';

export const formatVnd = (amount: number): string => formatPrice(amount);

export function pricePerServingLabel(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return '';
  return sourceFormat('{0} / lần dùng', formatPrice(amount));
}

export const GOAL_LABELS: Record<ProductGoal, string> = {
  get muscle_gain() { return sourceText('Tăng cơ'); },
  get recovery() { return sourceText('Phục hồi'); },
  get energy() { return sourceText('Năng lượng'); },
  get weight_management() { return sourceText('Kiểm soát cân nặng'); },
  get wellness() { return sourceText('Sức khỏe tổng quát'); },
};

export const FORM_LABELS: Record<ProductForm, string> = {
  get powder() { return sourceText('Bột'); },
  get capsule() { return sourceText('Viên nang'); },
  get tablet() { return sourceText('Viên nén'); },
  get liquid() { return sourceText('Nước'); },
  get bar() { return sourceText('Thanh'); },
  get other() { return sourceText('Khác'); },
};

export function orderStatusLabel(
  status: OrderStatus,
  fulfillment?: FulfillmentMethod | string | null,
  paymentMethod?: OrderPaymentMethod | string | null,
): string {
  switch (status) {
    case 'pending_payment':
      return paymentMethod === 'counter' ? sourceText('Chờ trả tại quầy') : sourceText('Chờ thanh toán');
    case 'paid':
      return sourceText('Đã thanh toán');
    case 'processing':
      return sourceText('Đang chuẩn bị');
    case 'shipping':
      return sourceText('Đang giao');
    case 'ready_for_pickup':
      return sourceText('Chờ nhận tại quầy');
    case 'completed':
      return fulfillment === 'pickup' ? sourceText('Đã nhận tại quầy') : sourceText('Đã giao');
    case 'cancelled':
      return sourceText('Đã hủy');
    default:
      return status;
  }
}
