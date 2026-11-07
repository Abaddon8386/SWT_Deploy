import { useSourceLanguage, sourceText, sourceFormat } from "../shopI18n";
import { formatCenterDateTime } from '../../../shared/lib/centerTime';
import { formatVnd } from '../shopFormat';
import type { OrderDto } from '../shopTypes';
import { OrderStatusPill } from './OrderStatusPill';

export interface OrderTableProps {
  orders: OrderDto[];
  onOpen: (order: OrderDto) => void;
}

export function OrderTable({ orders, onOpen }: OrderTableProps) {
  useSourceLanguage();
  return (
    <div className="portal-table-wrapper" role="region" aria-label={sourceText("Danh sách đơn hàng")} tabIndex={0}>
      <table className="portal-table">
        <thead>
          <tr>
            <th scope="col">{sourceText("Mã đơn")}</th>
            <th scope="col">{sourceText("Thời gian")}</th>
            <th scope="col">{sourceText("Hội viên")}</th>
            <th scope="col">{sourceText("SĐT")}</th>
            <th scope="col">{sourceText("Hình thức nhận")}</th>
            <th scope="col">{sourceText("Tổng cộng")}</th>
            <th scope="col">{sourceText("Trạng thái")}</th>
            <th scope="col">{sourceText("Thao tác")}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(order => (
            <tr key={order.id}>
              <td>
                <strong>{order.code}</strong>
              </td>
              <td>{formatCenterDateTime(order.createdAt)}</td>
              <td>{order.member?.fullName ?? '—'}</td>
              <td>{order.member?.phone ?? order.shipping?.phone ?? '—'}</td>
              <td>{order.fulfillment === 'pickup' ? sourceText('Nhận tại quầy') : sourceText('Giao tận nơi')}</td>
              <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                <strong>{formatVnd(order.total)}</strong>
              </td>
              <td>
                <OrderStatusPill
                  status={order.status}
                  fulfillment={order.fulfillment}
                  paymentMethod={order.paymentMethod}
                />
              </td>
              <td>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => onOpen(order)}
                  aria-label={sourceFormat("Mở đơn {0}", order.code)}
                >
                  {sourceText("Mở")}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
