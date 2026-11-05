import { formatCenterDateTime } from '../../../shared/lib/centerTime';
import { formatVnd } from '../shopFormat';
import type { OrderDto } from '../shopTypes';
import { OrderStatusPill } from './OrderStatusPill';

export interface OrderTableProps {
  orders: OrderDto[];
  onOpen: (order: OrderDto) => void;
}

export function OrderTable({ orders, onOpen }: OrderTableProps) {
  return (
    <div className="portal-table-wrap">
      <table className="portal-table">
        <thead>
          <tr>
            <th scope="col">Mã đơn</th>
            <th scope="col">Thời gian</th>
            <th scope="col">Hội viên</th>
            <th scope="col">SĐT</th>
            <th scope="col">Hình thức nhận</th>
            <th scope="col">Tổng cộng</th>
            <th scope="col">Trạng thái</th>
            <th scope="col">Thao tác</th>
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
              <td>{order.fulfillment === 'pickup' ? 'Nhận tại quầy' : 'Giao tận nơi'}</td>
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
                  aria-label={`Mở đơn ${order.code}`}
                >
                  Mở
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
