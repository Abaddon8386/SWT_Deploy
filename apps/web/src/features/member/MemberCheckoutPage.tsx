import { VnpayPayButton } from '../payments/VnpayPayButton';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatPrice } from '../../shared/lib/membershipPresentation';
import {
  getMembershipHistory,
  getMembershipPackages,
  createMembershipSubscription,
  MembershipPackage,
} from './membershipApi';
import './member-checkout.css';
import { errorMessage } from '../../shared/lib/errorMessage';

export function MemberCheckoutPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const packageIdParam = searchParams.get('packageId');
  const parsedPackageId = packageIdParam ? parseInt(packageIdParam, 10) : null;
  const subscriptionIdParam = searchParams.get('subscriptionId');
  const existingSubscriptionId = subscriptionIdParam ? parseInt(subscriptionIdParam, 10) : null;

  const preparedSubscriptionId = useRef<number | null>(existingSubscriptionId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<MembershipPackage | null>(null);
  // Số tiền thật phải thanh toán: yêu cầu nâng cấp hoặc gia hạn đã được backend báo giá
  const [quotedAmount, setQuotedAmount] = useState<number | null>(null);

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
          const subscription = history.find((item) => item.id === existingSubscriptionId);
          if (!subscription || subscription.status !== 'pending_payment' || (parsedPackageId && subscription.packageId !== parsedPackageId)) {
            setError('Yêu cầu gói tập không còn hợp lệ để thanh toán. Vui lòng quay lại danh mục.');
            return;
          }
          const quoted = subscription.upgradeCharge ?? subscription.quotedPrice;
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
    return () => {
      active = false;
    };
  }, [parsedPackageId, existingSubscriptionId]);

  const amount = selectedPackage ? quotedAmount ?? selectedPackage.price : 0;

  async function preparePaymentTarget() {
    if (!selectedPackage) throw new Error('Không tìm thấy gói tập.');
    if (!preparedSubscriptionId.current) {
      const history = await getMembershipHistory();
      const pending = history.find((item) => item.packageId === selectedPackage.id && item.status === 'pending_payment');
      preparedSubscriptionId.current = pending?.id ?? (await createMembershipSubscription(selectedPackage.id)).id;
    }
    return { subscriptionId: preparedSubscriptionId.current };
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

  return (
    <div className="portal-container checkout-container">
      <div className="checkout-breadcrumb">
        <Link to="/member/packages">Gói tập hội viên</Link>
        <span>/</span>
        <span style={{ color: 'var(--portal-paper, var(--color-text-main, #202020))', fontWeight: 600 }}>Thanh toán</span>
      </div>

      <PageHeader eyebrow="Thanh toán" title="Thanh toán gói tập" />

      <div className="checkout-layout">
        <div className="stack">
          <section className="portal-card stack" aria-label="Phương thức thanh toán trực tuyến">
            <h2 className="portal-card-title">Thanh toán qua VNPay hoặc Ví điện tử SÖL</h2>
            <VnpayPayButton
              prepare={preparePaymentTarget}
              onPaid={() => navigate('/member/packages', { replace: true })}
            />
          </section>

          <section className="portal-card stack" aria-label="Lưu ý thanh toán tiền mặt">
            <h3 className="portal-card-title">Thanh toán tiền mặt</h3>
            <p className="row-card__meta" style={{ margin: 0 }}>
              Lưu ý: Nếu bạn muốn thanh toán bằng tiền mặt, vui lòng gặp trực tiếp Lễ tân tại quầy để được hỗ trợ thu tiền và kích hoạt gói tập.
            </p>
          </section>
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
                  <span>Số tiền theo yêu cầu hiện tại</span>
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
