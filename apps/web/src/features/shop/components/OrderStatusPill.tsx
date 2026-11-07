import { useSourceLanguage } from "../shopI18n";
import { orderStatusLabel } from '../shopFormat';
import type { FulfillmentMethod, OrderPaymentMethod, OrderStatus } from '../shopTypes';

export function OrderStatusPill({
  status,
  fulfillment,
  paymentMethod,
}: {
  status: OrderStatus;
  fulfillment?: FulfillmentMethod | string | null;
  paymentMethod?: OrderPaymentMethod | string | null;
}) {
  useSourceLanguage();
  return (
    <span className={`shop-status-pill shop-status-pill--${status}`}>
      {orderStatusLabel(status, fulfillment, paymentMethod)}
    </span>
  );
}
