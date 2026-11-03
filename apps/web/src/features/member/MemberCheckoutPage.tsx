import { VnpayPayButton } from '../payments/VnpayPayButton';
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { PageHeader } from '../../shared/ui/PageHeader';
import { notify } from '../../shared/lib/portalNotices';
import { formatPrice } from '../../shared/lib/membershipPresentation';
import { readReceiptImage } from '../../shared/lib/receiptImage';
import {
  getMembershipHistory,
  getMembershipPackages,
  createCashReceiptPayment,
  createMembershipSubscription,
  MembershipPackage,
} from './membershipApi';
import './member-checkout.css';
import { errorMessage } from '../../shared/lib/errorMessage';

export function MemberCheckoutPage() {
  const [searchParams] = useSearchParams();

  const packageIdParam = searchParams.get('packageId');
  const parsedPackageId = packageIdParam ? parseInt(packageIdParam, 10) : null;
  const subscriptionIdParam = searchParams.get('subscriptionId');
  const existingSubscriptionId = subscriptionIdParam ? parseInt(subscriptionIdParam, 10) : null;

  const preparedSubscriptionId = useRef<number | null>(existingSubscriptionId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<MembershipPackage | null>(null);
  // Số tiền thật phải thanh toán: yêu cầu nâng cấp đã được backend báo giá (bù chênh lệch hoặc đủ giá gói mới)
  const [quotedAmount, setQuotedAmount] = useState<number | null>(null);

  const [receiptImage, setReceiptImage] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [completedResult, setCompletedResult] = useState<{
    subscriptionId: number;
    amount: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    preparedSubscriptionId.current = existingSubscriptionId;
    async function initCheckout() {
      setLoading(true);
      setError(null);
      try {
        const [packages, history] = await Promise.all([
          getMembershipPackages(),
          existingSubscriptionId ? getMembershipHistory() : Promise.resolve([]),
        ]);
        if (!active) return;

        if (existingSubscriptionId) {
          const subscription = history.find(item => item.id === existingSubscriptionId);
          if (!subscription || subscription.status !== 'pending_payment' || (parsedPackageId && subscription.packageId !== parsedPackageId)) {
            setError('Yêu cầu gói tập không còn hợp lệ để thanh toán. Vui lòng quay lại danh mục.');
            return;
          }
          const quoted = subscription.upgradeCharge;
          setQuotedAmount(typeof quoted === 'number' ? quoted : null);
        }

        if (parsedPackageId) {
          const found = packages.find((p) => p.id === parsedPackageId);
          if (found) {
            setSelectedPackage(found);
          } else {
            setError(`Không tìm thấy thông tin gói tập #${parsedPackageId}.`);
          }
        } else if (packages.length > 0) {
          setSelectedPackage(packages[0]);
        } else {
          setError('Hiện tại chưa có gói tập nào trong hệ thống.');
        }
      } catch (err) {
        if (active) setError(errorMessage(err, 'Không thể tải thông tin gói tập.'));
      } finally {
        if (active) setLoading(false);
      }
    }

    void initCheckout();
    return () => { active = false; };
  }, [parsedPackageId, existingSubscriptionId]);

  const amount = selectedPackage ? quotedAmount ?? selectedPackage.price : 0;

  async function prepareVnpay() {
    if (!selectedPackage) throw new Error('Không tìm thấy gói tập.');
    if (!preparedSubscriptionId.current) {
      const history = await getMembershipHistory();
      const pending = history.find(item => item.packageId === selectedPackage.id && item.status === 'pending_payment');
      preparedSubscriptionId.current = pending?.id ?? (await createMembershipSubscription(selectedPackage.id)).id;
    }
    return { subscriptionId: preparedSubscriptionId.current };
  }

  async function handleReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFormError(null);
    try {
      setReceiptImage(await readReceiptImage(file));
    } catch (err) {
      setReceiptImage(null);
      setFormError(errorMessage(err, 'Không đọc được ảnh hóa đơn.'));
    }
  }

  // Tiền mặt: hội viên gửi ảnh hóa đơn, lễ tân đối chiếu rồi xác nhận thanh toán trên web.
  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPackage || isSubmitting) return;
    if (!receiptImage) {
      setFormError('Vui lòng chụp hoặc chọn ảnh hóa đơn thanh toán.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      // Yêu cầu đăng ký/nâng cấp/gia hạn đã có từ trang gói tập; chỉ tạo mới khi vào thẳng trang này
      let subscriptionId = preparedSubscriptionId.current;
      if (!subscriptionId) {
        subscriptionId = (await createMembershipSubscription(selectedPackage.id)).id;
        preparedSubscriptionId.current = subscriptionId;
      }
      const subscription = (await getMembershipHistory()).find(item => item.id === subscriptionId);
      if (!subscription) throw new Error('Không tìm thấy yêu cầu gói tập.');
      await createCashReceiptPayment(subscription, amount, receiptImage);

      setCompletedResult({ subscriptionId, amount });
      notify('Đã gửi ảnh hóa đơn. Lễ tân sẽ xác nhận thanh toán trên hệ thống.', 'success');
    } catch (err) {
      setFormError(errorMessage(err, 'Không thể gửi hóa đơn. Vui lòng thử lại.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="portal-container checkout-container">
        <div className="portal-state" style={{ minHeight: '300px' }}>
          <div className="spinner" />
          <p style={{ marginTop: 12 }}>Đang tải thông tin thanh toán gói tập...</p>
        </div>
      </div>
    );
  }

  if (error || !selectedPackage) {
    return (
      <div className="portal-container checkout-container">
        <div className="portal-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p role="alert" style={{ color: 'var(--portal-danger, #fca5a5)', fontSize: '1.1rem', marginBottom: 16 }}>
            {error || 'Không tìm thấy thông tin gói tập.'}
          </p>
          <Link to="/member/packages" className="btn-primary">
            Quay lại danh mục gói tập
          </Link>
        </div>
      </div>
    );
  }

  if (completedResult) {
    return (
      <div className="portal-container checkout-container">
        <div className="checkout-success-view">

          <h2 style={{ fontSize: '1.45rem', color: 'var(--portal-paper, var(--color-text-main, #202020))', marginBottom: 8, fontWeight: 700 }}>
            Đã gửi ảnh hóa đơn
          </h2>

          <p style={{ color: 'var(--portal-muted, #68645f)', fontSize: '0.95rem', margin: 0 }}>
            Gói tập có hiệu lực sau khi lễ tân đối chiếu hóa đơn và xác nhận thanh toán trên hệ thống.
          </p>

          <div className="appointment-voucher">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <span className="voucher-code-badge">Đơn #{completedResult.subscriptionId}</span>
                <h3 style={{ margin: '4px 0', fontSize: '1.2rem', fontWeight: 800, color: 'var(--portal-paper, var(--color-text-main, #202020))' }}>
                  {selectedPackage.name}
                </h3>
                <div style={{ color: 'var(--portal-muted, #68645f)', fontSize: '0.85rem' }}>
                  Thời hạn: {selectedPackage.durationDays} ngày
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--portal-salmon, #a35b49)' }}>
                  {formatPrice(completedResult.amount)}
                </div>
                <span className="badge badge-warning" style={{ marginTop: 4 }}>
                  Chờ lễ tân xác nhận
                </span>
              </div>
            </div>

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--portal-border, #e4e2de)', fontSize: '0.92rem', color: 'var(--portal-paper, var(--color-text-main, #202020))' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ color: 'var(--portal-muted, #68645f)', fontSize: '0.84rem' }}>
                  Mã đơn #{completedResult.subscriptionId}. Bạn có thể theo dõi trạng thái ở trang Gói tập.
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
            <Link to="/member/packages" className="btn-secondary">
              Về trang gói tập
            </Link>
            <Link to="/member/card" className="btn-primary">
              Xem Thẻ Hội Viên
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-container checkout-container">
      <div className="checkout-breadcrumb">
        <Link to="/member/packages">Gói tập hội viên</Link>
        <span>/</span>
        <span style={{ color: 'var(--portal-paper, var(--color-text-main, #202020))', fontWeight: 600 }}>Thanh toán</span>
      </div>

      <PageHeader
        eyebrow="Thanh toán"
        title="Thanh toán gói tập"
      />

      <div className="checkout-layout">
        <div>
          <section className="portal-card stack" aria-label="Thanh toán VNPay Sandbox">
            <h2 className="portal-card-title">VNPay Sandbox</h2>
            <p>Thanh toán thử nghiệm qua ngân hàng, thẻ hoặc QR trên VNPay. Gói tập được cập nhật khi hệ thống nhận xác nhận giao dịch.</p>
            <VnpayPayButton prepare={prepareVnpay} disabled={isSubmitting} />
          </section>
          <div className="appointment-form-box">
            <h3 className="appointment-form-title">
              <span>Thanh toán tiền mặt — gửi ảnh hóa đơn</span>
            </h3>
            <p style={{ color: 'var(--portal-muted, #68645f)', fontSize: '0.9rem', margin: '0 0 12px' }}>
              Sau khi thanh toán tiền mặt, chụp ảnh hóa đơn rồi gửi lên đây. Lễ tân đối chiếu và xác nhận thanh toán thì gói tập mới có hiệu lực.
            </p>

            <form onSubmit={handleConfirm}>
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="receipt-image">
                  Ảnh hóa đơn *
                </label>
                <input
                  id="receipt-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="portal-input"
                  onChange={(e) => void handleReceiptChange(e)}
                />
                {receiptImage && (
                  <img
                    src={receiptImage}
                    alt="Xem trước ảnh hóa đơn"
                    style={{ marginTop: 10, maxWidth: '100%', maxHeight: 320, borderRadius: 8, border: '1px solid var(--portal-border, #e4e2de)' }}
                  />
                )}
              </div>

              {formError && <p className="form-error" role="alert">{formError}</p>}
              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%', marginTop: 12, padding: '14px' }}
                disabled={isSubmitting || !receiptImage}
              >
                {isSubmitting ? 'Đang gửi...' : 'Gửi hóa đơn và chờ xác nhận'}
              </button>
            </form>
          </div>
        </div>

        <div>
          <div className="order-summary-card">
            <h3 className="order-summary-title">Tóm tắt đơn hàng</h3>

            <div className="order-package-info">
              <div className="order-package-name">{selectedPackage.name}</div>
              <div className="order-package-term">
                <span>Thời hạn: {selectedPackage.durationDays} ngày tập</span>
              </div>
              {selectedPackage.classCreditLimit !== null && (
                <div className="order-package-term" style={{ marginTop: 4 }}>
                  <span>Lớp học: Tối đa {selectedPackage.classCreditLimit} buổi</span>
                </div>
              )}
            </div>

            <div className="order-breakdown">
              <div className="order-breakdown-row">
                <span>Giá niêm yết</span>
                <span>{formatPrice(selectedPackage.price)}</span>
              </div>
              {amount !== selectedPackage.price && (
                <div className="order-breakdown-row">
                  <span>Nâng cấp từ gói hiện tại</span>
                  <span>{formatPrice(amount)}</span>
                </div>
              )}
              <div className="order-breakdown-row total">
                <span>Số tiền cần thanh toán</span>
                <span>{formatPrice(amount)}</span>
              </div>
            </div>

            <Link
              to="/member/packages"
              className="btn-secondary"
              style={{ width: '100%', textAlign: 'center', display: 'block' }}
            >
              Chọn gói tập khác
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
