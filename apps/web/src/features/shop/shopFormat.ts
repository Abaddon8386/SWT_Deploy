import { formatPrice } from '../../shared/lib/membershipPresentation';
import type { FulfillmentMethod, OrderPaymentMethod, OrderStatus, ProductForm, ProductGoal } from './shopTypes';

export const formatVnd = (amount: number): string => formatPrice(amount);

export function pricePerServingLabel(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return '';
  return `${formatPrice(amount)} / lần dùng`;
}

export const GOAL_LABELS: Record<ProductGoal, string> = {
  muscle_gain: 'Tăng cơ',
  recovery: 'Phục hồi',
  energy: 'Năng lượng',
  weight_management: 'Kiểm soát cân nặng',
  wellness: 'Sức khỏe tổng quát',
};

export const FORM_LABELS: Record<ProductForm, string> = {
  powder: 'Bột',
  capsule: 'Viên nang',
  tablet: 'Viên nén',
  liquid: 'Nước',
  bar: 'Thanh',
  other: 'Khác',
};

export function orderStatusLabel(
  status: OrderStatus,
  fulfillment?: FulfillmentMethod | string | null,
  paymentMethod?: OrderPaymentMethod | string | null,
): string {
  switch (status) {
    case 'pending_payment':
      return paymentMethod === 'counter' ? 'Chờ trả tại quầy' : 'Chờ thanh toán';
    case 'paid':
      return 'Đã thanh toán';
    case 'processing':
      return 'Đang chuẩn bị';
    case 'shipping':
      return 'Đang giao';
    case 'ready_for_pickup':
      return 'Chờ nhận tại quầy';
    case 'completed':
      return fulfillment === 'pickup' ? 'Đã nhận tại quầy' : 'Đã giao';
    case 'cancelled':
      return 'Đã hủy';
    default:
      return status;
  }
}
