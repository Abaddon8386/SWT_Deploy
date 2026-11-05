import { describe, expect, it } from 'vitest';
import { FORM_LABELS, formatVnd, GOAL_LABELS, orderStatusLabel, pricePerServingLabel } from './shopFormat';

describe('shopFormat', () => {
  it('formats VND amounts and price per serving labels', () => {
    expect(formatVnd(1290000)).toContain('1.290.000');
    expect(pricePerServingLabel(18971)).toBe(`${formatVnd(18971)} / lần dùng`);
    expect(pricePerServingLabel(0)).toBe('');
    expect(pricePerServingLabel(-100)).toBe('');
    expect(pricePerServingLabel(null)).toBe('');
    expect(pricePerServingLabel(undefined)).toBe('');
  });

  it('provides Vietnamese labels for goals and product forms', () => {
    expect(GOAL_LABELS.muscle_gain).toBe('Tăng cơ');
    expect(GOAL_LABELS.recovery).toBe('Phục hồi');
    expect(GOAL_LABELS.energy).toBe('Năng lượng');
    expect(GOAL_LABELS.weight_management).toBe('Kiểm soát cân nặng');
    expect(GOAL_LABELS.wellness).toBe('Sức khỏe tổng quát');

    expect(FORM_LABELS.powder).toBe('Bột');
    expect(FORM_LABELS.capsule).toBe('Viên nang');
    expect(FORM_LABELS.tablet).toBe('Viên nén');
    expect(FORM_LABELS.liquid).toBe('Nước');
    expect(FORM_LABELS.bar).toBe('Thanh');
    expect(FORM_LABELS.other).toBe('Khác');
  });

  it('maps order status labels based on fulfillment and payment method', () => {
    expect(orderStatusLabel('pending_payment', 'delivery', 'online')).toBe('Chờ thanh toán');
    expect(orderStatusLabel('pending_payment', 'pickup', 'counter')).toBe('Chờ trả tại quầy');
    expect(orderStatusLabel('paid')).toBe('Đã thanh toán');
    expect(orderStatusLabel('processing')).toBe('Đang chuẩn bị');
    expect(orderStatusLabel('shipping', 'delivery')).toBe('Đang giao');
    expect(orderStatusLabel('ready_for_pickup', 'pickup')).toBe('Chờ nhận tại quầy');
    expect(orderStatusLabel('completed', 'delivery')).toBe('Đã giao');
    expect(orderStatusLabel('completed', 'pickup')).toBe('Đã nhận tại quầy');
    expect(orderStatusLabel('cancelled')).toBe('Đã hủy');
  });
});
