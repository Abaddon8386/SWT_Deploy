import { useSourceLanguage, sourceFormat, sourceText, sourceError, sourceNotify as notify, sourceFormatPair } from '../shopI18n';
import { useState } from 'react';
import { formatCenterDateTime } from '../../../shared/lib/centerTime';
import { ActionMenu } from '../../../shared/ui/ActionMenu';
import { Modal } from '../../../shared/ui/Modal';
import { shopApi } from '../shopApi';
import { formatVnd } from '../shopFormat';
import type { CounterPaymentMethod, OrderDto } from '../shopTypes';
import { OrderStatusPill } from './OrderStatusPill';

import { Select } from '../../../shared/ui/Select';
export interface StaffOrderDialogProps {
  order: OrderDto;
  onClose: () => void;
  onUpdated: (order: OrderDto) => void;
}

export function StaffOrderDialog({ order, onClose, onUpdated }: StaffOrderDialogProps) {
  useSourceLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | Error>('');

  // Shipping form state
  const [carrier, setCarrier] = useState(order.trackingCarrier ?? '');
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber ?? '');
  const [trackingError, setTrackingError] = useState<string | Error>('');

  // Counter payment state
  const [counterMethod, setCounterMethod] = useState<CounterPaymentMethod>('cash');

  // Cancel form state
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState<string | Error>('');
  const [restock, setRestock] = useState(true);

  const isTerminal = order.status === 'completed' || order.status === 'cancelled';

  const runAction = async (
    fn: () => Promise<OrderDto>,
    successMsg: string | import('../../../shared/i18n').SourceMessage,
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
      setError(sourceError(err, 'Không thể cập nhật đơn hàng. Vui lòng thử lại.'));
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
      sourceFormatPair("Đã giao đơn {0} cho đơn vị vận chuyển.", order.code),
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
      sourceFormatPair("Đã hủy đơn {0}.", order.code),
      true,
    );
  };

  return (
    <Modal
      title={sourceFormat("Đơn hàng {0}", order.code)}
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
              <strong>{order.member?.fullName ?? sourceText('Hội viên')}</strong>
              {order.member?.phone ? ` · ${order.member.phone}` : ''}
            </p>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {sourceText("Đặt lúc ")}{formatCenterDateTime(order.createdAt)} ·{' '}
              {order.fulfillment === 'pickup' ? sourceText('Nhận tại quầy SÖL') : sourceText('Giao tận nơi')}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <OrderStatusPill
              status={order.status}
              fulfillment={order.fulfillment}
              paymentMethod={order.paymentMethod}
            />
            {!isTerminal && !showCancel && (
              <ActionMenu label={sourceText("Thao tác khác")}>
                <button
                  type="button"
                  className="action-menu__item action-menu__item--danger"
                  disabled={busy}
                  onClick={() => {
                    setShowCancel(true);
                    setCancelReasonError('');
                  }}
                >
                  {sourceText("Hủy đơn")}</button>
              </ActionMenu>
            )}
          </div>
        </div>

        <div className="portal-table-wrapper" role="region" aria-label={sourceText("Sản phẩm trong đơn")} tabIndex={0}>
          <table className="portal-table">
            <thead>
              <tr>
                <th scope="col">{sourceText("Sản phẩm")}</th>
                <th scope="col">SKU</th>
                <th scope="col">{sourceText("SL")}</th>
                <th scope="col">{sourceText("Thành tiền")}</th>
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
            <span className="muted">{sourceText("Tạm tính")}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatVnd(order.subtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted">{sourceText("Phí giao hàng")}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatVnd(order.shippingFee)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{sourceText("Tổng cộng")}</strong>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatVnd(order.total)}</strong>
          </div>
          {order.refundedAmount != null && order.refundedAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted">{sourceText("Đã hoàn vào Ví SÖL")}</span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatVnd(order.refundedAmount)}
              </strong>
            </div>
          )}
        </div>

        {order.fulfillment === 'delivery' && order.shipping ? (
          <div className="portal-card" style={{ padding: '12px 14px' }}>
            <h3 className="portal-card-title" style={{ marginBottom: 6 }}>
              {sourceText("Địa chỉ giao hàng")}</h3>
            <p style={{ margin: 0 }}>
              <strong>{order.shipping.recipientName}</strong> · {order.shipping.phone}
            </p>
            <p style={{ margin: '4px 0 0' }}>
              {order.shipping.streetLine}, {order.shipping.wardName}, {order.shipping.provinceName}
            </p>
            {order.shipping.note && (
              <p className="muted" style={{ margin: '4px 0 0' }}>
                {sourceText("Ghi chú: ")}{order.shipping.note}
              </p>
            )}
            {order.trackingNumber && (
              <p style={{ margin: '6px 0 0' }}>
                {sourceText("Vận đơn: ")}{order.trackingCarrier ? `${order.trackingCarrier} · ` : ''}
                <strong>{order.trackingNumber}</strong>
              </p>
            )}
          </div>
        ) : (
          <div className="portal-card" style={{ padding: '12px 14px' }}>
            <h3 className="portal-card-title" style={{ marginBottom: 6 }}>
              {sourceText("Nhận tại quầy SÖL")}</h3>
            <p style={{ margin: 0 }}>
              {order.pickupAddress || sourceText('Quầy lễ tân trung tâm SÖL Fitness')}
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
                  sourceFormatPair("Đã bắt đầu chuẩn bị đơn {0}.", order.code),
                )
              }
            >
              {busy ? sourceText('Đang xử lý…') : sourceText('Bắt đầu chuẩn bị')}
            </button>
          </div>
        )}

        {order.status === 'processing' && order.fulfillment === 'delivery' && (
          <form className="stack" onSubmit={e => void handleShip(e)} noValidate>
            <div className="shop-field">
              <label className="shop-label" htmlFor="staff-ship-carrier">
                {sourceText("Đơn vị vận chuyển")}</label>
              <input
                id="staff-ship-carrier"
                className="shop-input"
                type="text"
                maxLength={60}
                value={carrier}
                disabled={busy}
                onChange={e => setCarrier(e.target.value)}
                placeholder={sourceText("GHN, GHTK, Viettel Post…")}
              />
            </div>
            <div className="shop-field">
              <label className="shop-label" htmlFor="staff-ship-tracking">
                {sourceText("Mã vận đơn")}</label>
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
                  {sourceText(trackingError)}
                </p>
              )}
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? sourceText('Đang gửi…') : sourceText('Giao cho vận chuyển')}
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
                  sourceFormatPair("Đơn {0} đã sẵn sàng nhận tại quầy.", order.code),
                )
              }
            >
              {busy ? sourceText('Đang xử lý…') : sourceText('Sẵn sàng nhận tại quầy')}
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
                  sourceFormatPair("Đã hoàn tất đơn {0}.", order.code),
                )
              }
            >
              {busy ? sourceText('Đang xử lý…') : sourceText('Đã giao thành công')}
            </button>
          </div>
        )}

        {order.status === 'ready_for_pickup' && (
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>
              {sourceText("Lưu ý: Kiểm tra thẻ hội viên trước khi giao sản phẩm tại quầy.")}</p>
            <div className="form-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  void runAction(
                    () => shopApi.staff.complete(order.id),
                    sourceFormatPair("Đã giao đơn {0} tại quầy.", order.code),
                  )
                }
              >
                {busy ? sourceText('Đang xử lý…') : sourceText('Đã giao tại quầy')}
              </button>
            </div>
          </div>
        )}

        {order.status === 'pending_payment' && order.paymentMethod === 'counter' && (
          <div className="stack">
            <div className="shop-field">
              <label className="shop-label" htmlFor="staff-counter-method">
                {sourceText("Phương thức thu tiền")}</label>
              <Select
                id="staff-counter-method"
                className="shop-select"
                value={counterMethod}
                disabled={busy}
                onChange={e => setCounterMethod(e.target.value as CounterPaymentMethod)}
              >
                <option value="cash">{sourceText("Tiền mặt")}</option>
                <option value="pos">{sourceText("Quẹt thẻ")}</option>
                <option value="bank_transfer">{sourceText("Chuyển khoản")}</option>
              </Select>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() =>
                  void runAction(
                    () => shopApi.staff.counterPayment(order.id, counterMethod),
                    sourceFormatPair("Đã thu tiền tại quầy cho đơn {0}.", order.code),
                    true,
                  )
                }
              >
                {busy ? sourceText('Đang thu tiền…') : sourceText('Thu tiền tại quầy')}
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
              {sourceText("Hủy đơn hàng")}</h3>
            {order.paidAt != null && (
              <p style={{ margin: 0 }}>
                {sourceText("Đơn đã thanh toán — sẽ hoàn ")}<strong>{formatVnd(order.total)}</strong> {sourceText(" vào Ví SÖL của hội viên.")}</p>
            )}
            <div className="shop-field">
              <label className="shop-label" htmlFor="staff-cancel-reason">
                {sourceText("Lý do hủy đơn")}</label>
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
                  {sourceText(cancelReasonError)}
                </p>
              )}
            </div>
            <label className="shop-checkbox">
              <input
                type="checkbox"
                checked={restock}
                disabled={busy}
                onChange={e => setRestock(e.target.checked)}
              />
              <span>{sourceText("Nhập lại kho")}</span>
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => setShowCancel(false)}
              >
                {sourceText("Quay lại")}</button>
              <button type="submit" className="btn-danger" disabled={busy}>
                {busy ? sourceText('Đang hủy…') : sourceText('Xác nhận hủy đơn')}
              </button>
            </div>
          </form>
        )}

        {error && (
          <p className="form-error" role="alert">
            {sourceText(error)}
          </p>
        )}
      </div>
    </Modal>
  );
}
