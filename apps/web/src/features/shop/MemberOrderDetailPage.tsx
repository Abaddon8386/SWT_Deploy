import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatCenterDateTime } from '../../shared/lib/centerTime';
import { errorMessage } from '../../shared/lib/errorMessage';
import { notify } from '../../shared/lib/portalNotices';
import { ActionMenu } from '../../shared/ui/ActionMenu';
import { useConfirm } from '../../shared/ui/ConfirmDialog';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { PageHeader } from '../../shared/ui/PageHeader';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import { VnpayPayButton } from '../payments/VnpayPayButton';
import { OrderStatusPill } from './components/OrderStatusPill';
import { OrderTimeline } from './components/OrderTimeline';
import './shop-portal.css';
import { shopApi } from './shopApi';
import { formatVnd } from './shopFormat';
import type { OrderDto } from './shopTypes';

export function MemberOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const numericId = Number(orderId);
  const validId = Number.isSafeInteger(numericId) && numericId > 0;
  const [confirm, confirmDialog] = useConfirm();
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!validId) {
      setError('Không tìm thấy đơn hàng.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await shopApi.getMyOrder(numericId);
      setOrder(res);
    } catch (err) {
      setError(errorMessage(err, 'Không thể tải thông tin đơn hàng. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  }, [numericId, validId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCancel = async () => {
    if (!order || busy) return;
    const ok = await confirm({
      title: 'Hủy đơn hàng',
      message:
        order.paidAt != null
          ? `Hủy đơn ${order.code}? Số tiền ${formatVnd(order.total)} sẽ được hoàn vào Ví SÖL của bạn.`
          : `Bạn có chắc chắn muốn hủy đơn hàng ${order.code}?`,
      confirmLabel: 'Xác nhận hủy',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const updated = await shopApi.cancelMyOrder(order.id);
      setOrder(updated);
      notify(`Đã hủy đơn ${order.code}`, 'success', { record: true });
    } catch (err) {
      const msg = errorMessage(err, 'Không thể hủy đơn hàng. Vui lòng thử lại.');
      notify(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="portal-container stack">
      <PageHeader
        eyebrow="Đơn hàng của tôi"
        title={order ? order.code : 'Chi tiết đơn hàng'}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link to="/member/orders" className="btn-secondary btn-sm">
              Danh sách đơn hàng
            </Link>
            <RefreshButton
              label="Làm mới chi tiết đơn"
              disabled={loading || busy}
              onClick={() => void load()}
            />
            {order?.canCancel && (
              <ActionMenu label="Thao tác khác">
                <button
                  type="button"
                  className="action-menu__item action-menu__item--danger"
                  disabled={busy}
                  onClick={() => void handleCancel()}
                >
                  Hủy đơn
                </button>
              </ActionMenu>
            )}
          </div>
        }
      />

      {loading ? (
        <LoadingSkeleton label="Đang tải chi tiết đơn hàng…" variant="rows" count={3} />
      ) : error ? (
        <div className="portal-alert" role="alert">
          <span>{error}</span>
          {validId && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => void load()}>
              Thử lại
            </button>
          )}
        </div>
      ) : (
        order && (
          <div className="stack">
            <section className="portal-card stack">
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
                  <strong>Mã đơn: {order.code}</strong>
                  <span className="muted"> · Đặt lúc {formatCenterDateTime(order.createdAt)}</span>
                </div>
                <OrderStatusPill
                  status={order.status}
                  fulfillment={order.fulfillment}
                  paymentMethod={order.paymentMethod}
                />
              </div>

              <OrderTimeline order={order} />

              {order.canPay && (
                <div className="stack" style={{ paddingTop: 8 }}>
                  <VnpayPayButton
                    target={{ productOrderId: order.id }}
                    disabled={busy}
                    onPaid={() => void load()}
                  />
                  {order.paymentDueAt && (
                    <p className="muted" style={{ margin: 0 }}>
                      Giữ hàng đến {formatCenterDateTime(order.paymentDueAt)}
                    </p>
                  )}
                </div>
              )}

              {!order.canPay &&
                order.status === 'pending_payment' &&
                order.paymentMethod === 'counter' &&
                order.paymentDueAt && (
                  <p className="muted" style={{ margin: 0 }}>
                    Giữ hàng đến {formatCenterDateTime(order.paymentDueAt)} — thanh toán khi nhận
                    tại quầy
                  </p>
                )}
            </section>

            <section className="portal-card stack" aria-label="Sản phẩm trong đơn">
              <h2 className="portal-card-title">Sản phẩm</h2>
              <div className="portal-table-wrapper" role="region" aria-label="Sản phẩm trong đơn" tabIndex={0}>
                <table className="portal-table">
                  <thead>
                    <tr>
                      <th scope="col">Sản phẩm</th>
                      <th scope="col">Đơn giá</th>
                      <th scope="col">Số lượng</th>
                      <th scope="col">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map(item => (
                      <tr key={`${item.variantId}-${item.sku}`}>
                        <td>
                          {item.slug ? (
                            <Link to={`/products/${item.slug}`}>
                              <strong>{item.productName}</strong>
                            </Link>
                          ) : (
                            <strong>{item.productName}</strong>
                          )}
                          <div className="muted">{item.variantLabel}</div>
                        </td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatVnd(item.unitPrice)}
                        </td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{item.quantity}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                          <strong>{formatVnd(item.lineTotal)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
                gap: 16,
              }}
            >
              <section className="portal-card stack" aria-label="Thông tin nhận hàng">
                <h2 className="portal-card-title">
                  {order.fulfillment === 'pickup' ? 'Nhận tại quầy' : 'Giao tới'}
                </h2>
                {order.fulfillment === 'delivery' && order.shipping ? (
                  <div className="stack" style={{ gap: 4 }}>
                    <p style={{ margin: 0 }}>
                      <strong>{order.shipping.recipientName}</strong> · {order.shipping.phone}
                    </p>
                    <p style={{ margin: 0 }}>
                      {order.shipping.streetLine}, {order.shipping.wardName},{' '}
                      {order.shipping.provinceName}
                    </p>
                    {order.shipping.note && (
                      <p className="muted" style={{ margin: 0 }}>
                        Ghi chú: {order.shipping.note}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="stack" style={{ gap: 4 }}>
                    <p style={{ margin: 0 }}>
                      {order.pickupAddress || 'Quầy lễ tân trung tâm SÖL Fitness'}
                    </p>
                    <p className="muted" style={{ margin: 0 }}>
                      Mang thẻ hội viên khi đến nhận hàng.
                    </p>
                  </div>
                )}
              </section>

              <section className="portal-card stack" aria-label="Thông tin thanh toán">
                <h2 className="portal-card-title">Thanh toán</h2>
                <p style={{ margin: 0 }}>
                  Phương thức:{' '}
                  <strong>
                    {order.paymentMethod === 'counter'
                      ? 'Trả tại quầy SÖL'
                      : 'Trực tuyến (VNPay / Ví SÖL)'}
                  </strong>
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">Tạm tính</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatVnd(order.subtotal)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">Phí giao hàng</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatVnd(order.shippingFee)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>Tổng cộng</strong>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatVnd(order.total)}
                  </strong>
                </div>
                {order.refundedAmount != null && order.refundedAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">Đã hoàn vào Ví SÖL</span>
                    <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatVnd(order.refundedAmount)}
                    </strong>
                  </div>
                )}
              </section>
            </div>
          </div>
        )
      )}

      {confirmDialog}
    </div>
  );
}
