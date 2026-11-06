import { useState } from 'react';
import { formatCenterDateTime } from '../../../shared/lib/centerTime';
import { errorMessage } from '../../../shared/lib/errorMessage';
import { notify } from '../../../shared/lib/portalNotices';
import { ActionMenu } from '../../../shared/ui/ActionMenu';
import { Modal } from '../../../shared/ui/Modal';
import { shopApi } from '../shopApi';
import { formatVnd } from '../shopFormat';
import type { CounterPaymentMethod, OrderDto } from '../shopTypes';
import { OrderStatusPill } from './OrderStatusPill';

export interface StaffOrderDialogProps {
  order: OrderDto;
  onClose: () => void;
  onUpdated: (order: OrderDto) => void;
}

export function StaffOrderDialog({ order, onClose, onUpdated }: StaffOrderDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Shipping form state
  const [carrier, setCarrier] = useState(order.trackingCarrier ?? '');
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber ?? '');
  const [trackingError, setTrackingError] = useState('');

  // Counter payment state
  const [counterMethod, setCounterMethod] = useState<CounterPaymentMethod>('cash');

  // Cancel form state
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState('');
  const [restock, setRestock] = useState(true);

  const isTerminal = order.status === 'completed' || order.status === 'cancelled';

  const runAction = async (
    fn: () => Promise<OrderDto>,
    successMsg: string,
    recordNotice = false,
  ) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const updated = await fn();
      notify(successMsg, 'success', recordNotice ? { record: true } : {});
      onUpdated(updated);
    } catch (err) {
      setError(errorMessage(err, 'Không thể cập nhật đơn hàng. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  };

  const handleShip = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTracking = trackingNumber.trim();
    if (trimmedTracking.length < 3 || trimmedTracking.length > 60) {
      setTrackingError('Vui lòng nhập mã vận đơn (từ 3 đến 60 ký tự).');
      return;
    }
    setTrackingError('');
    await runAction(
      () =>
        shopApi.staff.ship(order.id, {
          carrier: carrier.trim(),
          trackingNumber: trimmedTracking,
        }),
      `Đã giao đơn ${order.code} cho đơn vị vận chuyển.`,
    );
  };

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedReason = cancelReason.trim();
    if (trimmedReason.length < 5 || trimmedReason.length > 255) {
      setCancelReasonError('Vui lòng nhập lý do hủy đơn (từ 5 đến 255 ký tự).');
      return;
    }
    setCancelReasonError('');
    await runAction(
      () => shopApi.staff.cancel(order.id, { reason: trimmedReason, restock }),
      `Đã hủy đơn ${order.code}.`,
      true,
    );
  };

  return (
    <Modal
      title={`Đơn hàng ${order.code}`}
      className="shop-staff-dialog"
      busy={busy}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="stack">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <p style={{ margin: 0 }}>
              <strong>{order.member?.fullName ?? 'Hội viên'}</strong>
              {order.member?.phone ? ` · ${order.member.phone}` : ''}
            </p>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Đặt lúc {formatCenterDateTime(order.createdAt)} ·{' '}
              {order.fulfillment === 'pickup' ? 'Nhận tại quầy SÖL' : 'Giao tận nơi'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <OrderStatusPill
              status={order.status}
              fulfillment={order.fulfillment}
              paymentMethod={order.paymentMethod}
            />
            {!isTerminal && !showCancel && (
              <ActionMenu label="Thao tác khác">
                <button
                  type="button"
                  className="action-menu__item action-menu__item--danger"
                  disabled={busy}
                  onClick={() => {
                    setShowCancel(true);
                    setCancelReasonError('');
                  }}
                >
                  Hủy đơn
                </button>
              </ActionMenu>
            )}
          </div>
        </div>

        <div className="portal-table-wrapper" role="region" aria-label="Sản phẩm trong đơn" tabIndex={0}>
          <table className="portal-table">
            <thead>
              <tr>
                <th scope="col">Sản phẩm</th>
                <th scope="col">SKU</th>
                <th scope="col">SL</th>
                <th scope="col">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map(item => (
                <tr key={`${item.variantId}-${item.sku}`}>
                  <td>
                    <strong>{item.productName}</strong>
                    <div className="muted">{item.variantLabel}</div>
                  </td>
                  <td>{item.sku}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{item.quantity}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatVnd(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          className="portal-card"
          style={{ display: 'grid', gap: 6, padding: '12px 14px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted">Tạm tính</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatVnd(order.subtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted">Phí giao hàng</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatVnd(order.shippingFee)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>Tổng cộng</strong>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatVnd(order.total)}</strong>
          </div>
          {order.refundedAmount != null && order.refundedAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted">Đã hoàn vào Ví SÖL</span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatVnd(order.refundedAmount)}
              </strong>
            </div>
          )}
        </div>

        {order.fulfillment === 'delivery' && order.shipping ? (
          <div className="portal-card" style={{ padding: '12px 14px' }}>
            <h3 className="portal-card-title" style={{ marginBottom: 6 }}>
              Địa chỉ giao hàng
            </h3>
            <p style={{ margin: 0 }}>
              <strong>{order.shipping.recipientName}</strong> · {order.shipping.phone}
            </p>
            <p style={{ margin: '4px 0 0' }}>
              {order.shipping.streetLine}, {order.shipping.wardName}, {order.shipping.provinceName}
            </p>
            {order.shipping.note && (
              <p className="muted" style={{ margin: '4px 0 0' }}>
                Ghi chú: {order.shipping.note}
              </p>
            )}
            {order.trackingNumber && (
              <p style={{ margin: '6px 0 0' }}>
                Vận đơn: {order.trackingCarrier ? `${order.trackingCarrier} · ` : ''}
                <strong>{order.trackingNumber}</strong>
              </p>
            )}
          </div>
        ) : (
          <div className="portal-card" style={{ padding: '12px 14px' }}>
            <h3 className="portal-card-title" style={{ marginBottom: 6 }}>
              Nhận tại quầy SÖL
            </h3>
            <p style={{ margin: 0 }}>
              {order.pickupAddress || 'Quầy lễ tân trung tâm SÖL Fitness'}
            </p>
          </div>
        )}

        {/* Primary status actions */}
        {order.status === 'paid' && (
          <div className="form-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() =>
                void runAction(
                  () => shopApi.staff.startProcessing(order.id),
                  `Đã bắt đầu chuẩn bị đơn ${order.code}.`,
                )
              }
            >
              {busy ? 'Đang xử lý…' : 'Bắt đầu chuẩn bị'}
            </button>
          </div>
        )}

        {order.status === 'processing' && order.fulfillment === 'delivery' && (
          <form className="stack" onSubmit={e => void handleShip(e)} noValidate>
            <div className="shop-field">
              <label className="shop-label" htmlFor="staff-ship-carrier">
                Đơn vị vận chuyển
              </label>
              <input
                id="staff-ship-carrier"
                className="shop-input"
                type="text"
                maxLength={60}
                value={carrier}
                disabled={busy}
                onChange={e => setCarrier(e.target.value)}
                placeholder="GHN, GHTK, Viettel Post…"
              />
            </div>
            <div className="shop-field">
              <label className="shop-label" htmlFor="staff-ship-tracking">
                Mã vận đơn
              </label>
              <input
                id="staff-ship-tracking"
                className="shop-input"
                type="text"
                maxLength={60}
                required
                aria-invalid={Boolean(trackingError)}
                value={trackingNumber}
                disabled={busy}
                onChange={e => {
                  setTrackingNumber(e.target.value);
                  if (trackingError) setTrackingError('');
                }}
              />
              {trackingError && (
                <p className="form-error" role="alert">
                  {trackingError}
                </p>
              )}
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Đang gửi…' : 'Giao cho vận chuyển'}
              </button>
            </div>
          </form>
        )}

        {order.status === 'processing' && order.fulfillment === 'pickup' && (
          <div className="form-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() =>
                void runAction(
                  () => shopApi.staff.readyForPickup(order.id),
                  `Đơn ${order.code} đã sẵn sàng nhận tại quầy.`,
                )
              }
            >
              {busy ? 'Đang xử lý…' : 'Sẵn sàng nhận tại quầy'}
            </button>
          </div>
        )}

        {order.status === 'shipping' && (
          <div className="form-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() =>
                void runAction(
                  () => shopApi.staff.complete(order.id),
                  `Đã hoàn tất đơn ${order.code}.`,
                )
              }
            >
              {busy ? 'Đang xử lý…' : 'Đã giao thành công'}
            </button>
          </div>
        )}

        {order.status === 'ready_for_pickup' && (
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>
              Lưu ý: Kiểm tra thẻ hội viên trước khi giao sản phẩm tại quầy.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  void runAction(
                    () => shopApi.staff.complete(order.id),
                    `Đã giao đơn ${order.code} tại quầy.`,
                  )
                }
              >
                {busy ? 'Đang xử lý…' : 'Đã giao tại quầy'}
              </button>
            </div>
          </div>
        )}

        {order.status === 'pending_payment' && order.paymentMethod === 'counter' && (
          <div className="stack">
            <div className="shop-field">
              <label className="shop-label" htmlFor="staff-counter-method">
                Phương thức thu tiền
              </label>
              <select
                id="staff-counter-method"
                className="shop-select"
                value={counterMethod}
                disabled={busy}
                onChange={e => setCounterMethod(e.target.value as CounterPaymentMethod)}
              >
                <option value="cash">Tiền mặt</option>
                <option value="pos">Quẹt thẻ</option>
                <option value="bank_transfer">Chuyển khoản</option>
              </select>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  void runAction(
                    () => shopApi.staff.counterPayment(order.id, counterMethod),
                    `Đã thu tiền tại quầy cho đơn ${order.code}.`,
                    true,
                  )
                }
              >
                {busy ? 'Đang thu tiền…' : 'Thu tiền tại quầy'}
              </button>
            </div>
          </div>
        )}

        {!isTerminal && showCancel && (
          <form
            className="portal-card stack"
            style={{ padding: '12px 14px' }}
            onSubmit={e => void handleCancel(e)}
            noValidate
          >
            <h3 className="portal-card-title" style={{ margin: 0 }}>
              Hủy đơn hàng
            </h3>
            {order.paidAt != null && (
              <p style={{ margin: 0 }}>
                Đơn đã thanh toán — sẽ hoàn <strong>{formatVnd(order.total)}</strong> vào Ví SÖL của
                hội viên.
              </p>
            )}
            <div className="shop-field">
              <label className="shop-label" htmlFor="staff-cancel-reason">
                Lý do hủy đơn
              </label>
              <textarea
                id="staff-cancel-reason"
                className="shop-textarea"
                rows={2}
                maxLength={255}
                required
                aria-invalid={Boolean(cancelReasonError)}
                value={cancelReason}
                disabled={busy}
                onChange={e => {
                  setCancelReason(e.target.value);
                  if (cancelReasonError) setCancelReasonError('');
                }}
              />
              {cancelReasonError && (
                <p className="form-error" role="alert">
                  {cancelReasonError}
                </p>
              )}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={restock}
                disabled={busy}
                onChange={e => setRestock(e.target.checked)}
              />
              <span>Nhập lại kho</span>
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => setShowCancel(false)}
              >
                Quay lại
              </button>
              <button type="submit" className="btn-danger" disabled={busy}>
                {busy ? 'Đang hủy…' : 'Xác nhận hủy đơn'}
              </button>
            </div>
          </form>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
