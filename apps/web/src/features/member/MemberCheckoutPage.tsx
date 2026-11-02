import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { PageHeader } from '../../shared/ui/PageHeader';
import { toast } from '../../shared/ui/toast';
import { formatPrice } from '../../shared/lib/membershipPresentation';
import { centerNowParts } from '../../shared/lib/centerTime';
import {
  getMembershipHistory,
  getMembershipPackages,
  createMembershipSubscription,
  MembershipPackage,
} from './membershipApi';
import './member-checkout.css';

// Khung giờ gợi ý để hội viên chọn giờ dự kiến tới quầy
const POPULAR_TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30',
];

export function MemberCheckoutPage() {
  const [searchParams] = useSearchParams();

  const packageIdParam = searchParams.get('packageId');
  const parsedPackageId = packageIdParam ? parseInt(packageIdParam, 10) : null;
  const subscriptionIdParam = searchParams.get('subscriptionId');
  const existingSubscriptionId = subscriptionIdParam ? parseInt(subscriptionIdParam, 10) : null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<MembershipPackage | null>(null);
  // Số tiền thật phải thanh toán: yêu cầu nâng cấp đã được backend báo giá (bù chênh lệch hoặc đủ giá gói mới)
  const [quotedAmount, setQuotedAmount] = useState<number | null>(null);

  // Ngày/giờ hiện tại theo múi giờ trung tâm, không dùng UTC của trình duyệt
  const todayStr = useMemo(() => centerNowParts().date, []);
  const [appointmentDate, setAppointmentDate] = useState<string>(todayStr);
  const [appointmentTime, setAppointmentTime] = useState<string>('09:30');
  const [customTime, setCustomTime] = useState<string>('');
  const [appointmentNotes, setAppointmentNotes] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedResult, setCompletedResult] = useState<{
    subscriptionId: number;
    amount: number;
    appointmentDateTime: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    async function initCheckout() {
      setLoading(true);
      setError(null);
      try {
        const [packages, history] = await Promise.all([
          getMembershipPackages(),
          existingSubscriptionId ? getMembershipHistory().catch(() => []) : Promise.resolve([]),
        ]);
        if (!active) return;

        if (existingSubscriptionId) {
          const quoted = history.find((item) => item.id === existingSubscriptionId)?.upgradeCharge;
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
        if (active) setError(err instanceof Error ? err.message : 'Không thể tải thông tin gói tập.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void initCheckout();
    return () => { active = false; };
  }, [parsedPackageId, existingSubscriptionId]);

  const amount = selectedPackage ? quotedAmount ?? selectedPackage.price : 0;

  // Hẹn giờ chỉ để hội viên chủ động sắp xếp; lễ tân xác nhận thanh toán thật khi hội viên tới quầy.
  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPackage || isSubmitting) return;

    const effectiveTime = customTime.trim() || appointmentTime;
    if (!appointmentDate) {
      toast('Vui lòng chọn ngày dự kiến tới quầy.', 'error');
      return;
    }
    if (!effectiveTime) {
      toast('Vui lòng chọn hoặc nhập giờ dự kiến.', 'error');
      return;
    }
    const now = centerNowParts();
    if (appointmentDate < now.date || (appointmentDate === now.date && effectiveTime <= now.time)) {
      toast('Thời gian dự kiến không thể ở trong quá khứ.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      // Yêu cầu đăng ký/nâng cấp/gia hạn đã có từ trang gói tập; chỉ tạo mới khi vào thẳng trang này
      let subscriptionId = existingSubscriptionId;
      if (!subscriptionId) {
        subscriptionId = (await createMembershipSubscription(selectedPackage.id)).id;
      }

      setCompletedResult({
        subscriptionId,
        amount,
        appointmentDateTime: `${effectiveTime} ngày ${appointmentDate.split('-').reverse().join('/')}`,
      });
      toast('Đã ghi lịch dự kiến tới quầy. Yêu cầu của bạn đang chờ lễ tân xác nhận thanh toán.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Không thể tạo yêu cầu gói tập. Vui lòng thử lại.', 'error');
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
          <div className="checkout-success-icon">✓</div>

          <h2 style={{ fontSize: '1.45rem', color: 'var(--portal-paper, var(--color-text-main, #202020))', marginBottom: 8, fontWeight: 700 }}>
            Đã ghi lịch dự kiến tới quầy
          </h2>

          <p style={{ color: 'var(--portal-muted, #68645f)', fontSize: '0.95rem', margin: 0 }}>
            Gói tập chỉ có hiệu lực sau khi lễ tân xác nhận thanh toán tại quầy.
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
                  ● Chờ thanh toán tại quầy
                </span>
              </div>
            </div>

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--portal-border, #e4e2de)', fontSize: '0.92rem', color: 'var(--portal-paper, var(--color-text-main, #202020))' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div><strong>🕒 Dự kiến tới quầy:</strong> {completedResult.appointmentDateTime}</div>
                <div style={{ color: 'var(--portal-muted, #68645f)', fontSize: '0.84rem', marginTop: 4 }}>
                  * Lịch này chỉ giúp bạn sắp xếp thời gian và không được gửi cho lễ tân. Khi tới quầy, đọc mã đơn #{completedResult.subscriptionId} hoặc tên của bạn để được phục vụ nhanh nhất.
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

  const displayTime = customTime.trim() || appointmentTime;

  return (
    <div className="portal-container checkout-container">
      <div className="checkout-breadcrumb">
        <Link to="/member/packages">Gói tập hội viên</Link>
        <span>/</span>
        <span style={{ color: 'var(--portal-paper, var(--color-text-main, #202020))', fontWeight: 600 }}>Thanh toán tại quầy</span>
      </div>

      <PageHeader
        eyebrow="Thanh toán"
        title="Thanh toán gói tập tại quầy"
      />

      <div className="checkout-layout">
        <div>
          <div className="payment-methods">
            <div className="payment-method-card is-selected">
              <div className="payment-method-radio">
                <div className="payment-method-radio-dot" />
              </div>
              <div className="payment-method-content">
                <div className="payment-method-title">
                  <span>🏢 Thanh toán tại quầy lễ tân</span>
                </div>
                <div className="payment-method-desc">
                  Thanh toán bằng tiền mặt hoặc quẹt thẻ POS trực tiếp tại sảnh trung tâm. Lễ tân xác nhận thanh toán thì gói tập mới có hiệu lực.
                </div>
              </div>
            </div>
          </div>

          <div className="appointment-form-box">
            <h3 className="appointment-form-title">
              <span>🗓️ Chọn thời gian dự kiến tới quầy</span>
            </h3>

            <form onSubmit={handleConfirm}>
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="appointment-date">
                  Ngày bạn dự kiến tới quầy thanh toán *
                </label>
                <input
                  id="appointment-date"
                  type="date"
                  className="portal-input"
                  min={todayStr}
                  value={appointmentDate}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                  required
                />
              </div>

              <div className="portal-form-group">
                <label className="portal-label">
                  Khung giờ dự kiến * (Đang chọn: <strong>{displayTime}</strong>)
                </label>
                <div className="time-slot-grid">
                  {POPULAR_TIME_SLOTS.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      className={`time-slot-btn ${appointmentTime === slot && !customTime ? 'is-active' : ''}`}
                      onClick={() => {
                        setAppointmentTime(slot);
                        setCustomTime('');
                      }}
                    >
                      {slot}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--portal-muted, #68645f)' }}>Hoặc nhập giờ tùy chọn:</span>
                  <input
                    type="time"
                    className="portal-input"
                    aria-label="Giờ tùy chọn"
                    style={{ width: '130px', padding: '6px 10px' }}
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="portal-form-group">
                <label className="portal-label" htmlFor="appointment-notes">
                  Ghi chú cho bản thân (Tùy chọn)
                </label>
                <textarea
                  id="appointment-notes"
                  className="portal-input"
                  rows={2}
                  placeholder="Vd: Mang theo thẻ ngân hàng để quẹt POS."
                  value={appointmentNotes}
                  onChange={(e) => setAppointmentNotes(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%', marginTop: 12, padding: '14px' }}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Đang xử lý...' : 'Xác nhận và tới quầy thanh toán'}
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
                <span>⏱️ Thời hạn: {selectedPackage.durationDays} ngày tập</span>
              </div>
              {selectedPackage.classCreditLimit !== null && (
                <div className="order-package-term" style={{ marginTop: 4 }}>
                  <span>🎯 Lớp học: Tối đa {selectedPackage.classCreditLimit} buổi</span>
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
