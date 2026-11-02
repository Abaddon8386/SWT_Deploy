import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { PageHeader } from '../../shared/ui/PageHeader';
import { toast } from '../../shared/ui/toast';
import { formatPrice } from '../../shared/lib/membershipPresentation';
import {
  getMembershipPackages,
  createMembershipSubscription,
  MembershipPackage,
} from './membershipApi';
import { getProfile, Profile } from './profileApi';
import { apiFetch } from '../../shared/api/client';
import './member-checkout.css';

// Danh sách các khung giờ gợi ý sẵn sàng phục vụ tại quầy
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

  // Loading & Data states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<MembershipPackage | null>(null);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);

  // Phương thức thanh toán được chọn: 'counter' (Tại quầy) hoặc 'vietqr' (Online)
  const [paymentMethod, setPaymentMethod] = useState<'counter' | 'vietqr'>('counter');

  // Form Đặt lịch hẹn tại quầy
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [appointmentDate, setAppointmentDate] = useState<string>(todayStr);
  const [appointmentTime, setAppointmentTime] = useState<string>('09:30');
  const [customTime, setCustomTime] = useState<string>('');
  const [appointmentNotes, setAppointmentNotes] = useState<string>('');

  // VietQR Data URL
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // Trạng thái xử lý gửi
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedResult, setCompletedResult] = useState<{
    type: 'counter' | 'vietqr';
    voucherCode: string;
    subscriptionId: number;
    amount: number;
    appointmentDateTime?: string;
  } | null>(null);

  // 1. Tải thông tin gói tập và hồ sơ hội viên
  useEffect(() => {
    async function initCheckout() {
      setLoading(true);
      setError(null);
      try {
        const [packages, profile] = await Promise.all([
          getMembershipPackages(),
          getProfile().catch(() => null),
        ]);

        if (profile) setUserProfile(profile);

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
        setError(err instanceof Error ? err.message : 'Không thể tải thông tin gói tập.');
      } finally {
        setLoading(false);
      }
    }

    void initCheckout();
  }, [parsedPackageId]);

  // Cú pháp chuyển khoản định danh
  const transferSyntax = useMemo(() => {
    const pkgCode = selectedPackage ? `PKG${selectedPackage.id}` : 'PKG';
    const memberCode = userProfile?.phone ? userProfile.phone.slice(-6) : (userProfile?.userId ? `MB${userProfile.userId}` : 'MB');
    return `SOL ${pkgCode} ${memberCode}`.toUpperCase();
  }, [selectedPackage, userProfile]);

  // 2. Tạo mã VietQR động khi chọn phương thức Online
  useEffect(() => {
    if (!selectedPackage || paymentMethod !== 'vietqr') return;

    const bankAccount = '999988886666';
    const amount = selectedPackage.price;

    // Chuỗi nội dung thanh toán chuẩn VietQR QuickLink / Banking payload
    const payload = `https://img.vietqr.io/image/MB-${bankAccount}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(transferSyntax)}&accountName=SOL%20FITNESS%20VIETNAM`;

    QRCode.toDataURL(payload, {
      width: 260,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Lỗi sinh mã VietQR:', err));
  }, [selectedPackage, paymentMethod, transferSyntax]);

  // Sao chép nhanh thông tin chuyển khoản
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast(`Đã sao chép ${label}!`, 'success');
  };

  // 3. Xử lý xác nhận thanh toán (hoặc đặt lịch)
  async function handleConfirmPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPackage || isSubmitting) return;

    const effectiveTime = customTime.trim() || appointmentTime;

    if (paymentMethod === 'counter') {
      if (!appointmentDate) {
        toast('Vui lòng chọn ngày hẹn tới quầy.', 'error');
        return;
      }
      if (!effectiveTime) {
        toast('Vui lòng chọn hoặc nhập giờ hẹn cụ thể.', 'error');
        return;
      }
      if (appointmentDate < todayStr) {
        toast('Ngày hẹn không thể ở trong quá khứ.', 'error');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Đảm bảo subscription đã được tạo (nếu chưa có subscriptionId)
      let subId = subscriptionIdParam ? parseInt(subscriptionIdParam, 10) : null;
      if (!subId) {
        const sub = await createMembershipSubscription(selectedPackage.id);
        subId = sub.id;
      }

      const noteText = paymentMethod === 'counter'
        ? `Lịch hẹn tại quầy: ${appointmentDate} lúc ${effectiveTime}. ${appointmentNotes ? `Ghi chú: ${appointmentNotes.trim()}` : ''}`.trim()
        : `Thanh toán VietQR online gói #${selectedPackage.id} (${transferSyntax})`;

      // Tạo bản ghi giao dịch (với role MEMBER, status mặc định là pending để đối soát)
      await apiFetch('/payments', {
        method: 'POST',
        body: JSON.stringify({
          memberId: userProfile?.userId || 1,
          subscriptionId: subId,
          amount: selectedPackage.price,
          method: paymentMethod === 'counter' ? 'cash' : 'bank_transfer',
          status: 'pending',
          note: noteText,
        }),
      }).catch((err) => {
        // Nếu backend đã có payment trùng lặp, bỏ qua để không chặn flow người dùng
        console.warn('Lưu payment backend:', err);
      });

      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const voucherCode = `SOL-VOUCHER-${subId}-${randomSuffix}`;

      setCompletedResult({
        type: paymentMethod,
        voucherCode,
        subscriptionId: subId,
        amount: selectedPackage.price,
        appointmentDateTime: paymentMethod === 'counter' ? `${effectiveTime} ngày ${appointmentDate}` : undefined,
      });

      toast(
        paymentMethod === 'counter'
          ? 'Đặt lịch hẹn thanh toán tại quầy thành công!'
          : 'Giao dịch chuyển khoản đã được ghi nhận!',
        'success'
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Có lỗi xảy ra khi tạo giao dịch.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Màn hình Loading
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

  // Màn hình Lỗi
  if (error || !selectedPackage) {
    return (
      <div className="portal-container checkout-container">
        <div className="portal-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ color: 'var(--portal-danger, #fca5a5)', fontSize: '1.1rem', marginBottom: 16 }}>
            {error || 'Không tìm thấy thông tin gói tập.'}
          </p>
          <Link to="/member/packages" className="btn-primary">
            Quay lại danh mục gói tập
          </Link>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MÀN HÌNH HOÀN TẤT (PHIẾU HẸN TIẾP ĐÓN HOẶC XÁC NHẬN CHUYỂN KHOẢN)
  // =========================================================================
  if (completedResult) {
    return (
      <div className="portal-container checkout-container">
        <div className="checkout-success-view">
          <div className="checkout-success-icon">✓</div>

          <h2 style={{ fontSize: '1.45rem', color: 'var(--portal-paper, var(--color-text-main, #202020))', marginBottom: 8, fontWeight: 700 }}>
            {completedResult.type === 'counter'
              ? 'Đặt lịch hẹn tiếp đón tại quầy thành công!'
              : 'Xác nhận chuyển khoản thành công!'}
          </h2>

          <p style={{ color: 'var(--portal-muted, #68645f)', fontSize: '0.95rem', margin: 0 }}>
            {completedResult.type === 'counter'
              ? 'Lễ tân tại trung tâm đã nhận được lịch hẹn của bạn và sẵn sàng tiếp đón.'
              : 'Yêu cầu kích hoạt gói tập của bạn đã được chuyển tới hệ thống để đối soát.'}
          </p>

          <div className="appointment-voucher">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <span className="voucher-code-badge">{completedResult.voucherCode}</span>
                <h3 style={{ margin: '4px 0', fontSize: '1.2rem', fontWeight: 800, color: 'var(--portal-paper, var(--color-text-main, #202020))' }}>
                  {selectedPackage.name}
                </h3>
                <div style={{ color: 'var(--portal-muted, #68645f)', fontSize: '0.85rem' }}>
                  Thời hạn: {selectedPackage.durationDays} ngày · Đơn hàng #{completedResult.subscriptionId}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--portal-salmon, #a35b49)' }}>
                  {formatPrice(completedResult.amount)}
                </div>
                <span className="badge badge-warning" style={{ marginTop: 4 }}>
                  ● Chờ đối soát tại quầy
                </span>
              </div>
            </div>

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--portal-border, #e4e2de)', fontSize: '0.92rem', color: 'var(--portal-paper, var(--color-text-main, #202020))' }}>
              {completedResult.type === 'counter' ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div><strong>🕒 Thời gian hẹn:</strong> {completedResult.appointmentDateTime}</div>
                  <div><strong>📍 Địa điểm:</strong> Sảnh Lễ tân chính — SÖL Fitness Center</div>
                  <div style={{ color: 'var(--portal-muted, #68645f)', fontSize: '0.84rem', marginTop: 4 }}>
                    * Vui lòng đọc Mã số phiếu hẹn hoặc Số điện thoại của bạn khi đến quầy để được phục vụ nhanh nhất.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div><strong>🏦 Phương thức:</strong> Quét mã QR chuyển khoản ngân hàng</div>
                  <div><strong>📝 Cú pháp giao dịch:</strong> {transferSyntax}</div>
                  <div style={{ color: 'var(--portal-muted, #68645f)', fontSize: '0.84rem', marginTop: 4 }}>
                    * Gói tập sẽ được kích hoạt tự động sau khi giao dịch ngân hàng khớp lệnh. Bạn có thể kiểm tra hóa đơn ngay bây giờ.
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
            <Link to="/member/invoices" className="btn-secondary">
              Xem Lịch sử Hóa đơn
            </Link>
            <Link to="/member/card" className="btn-primary">
              Xem Thẻ Hội Viên
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MÀN HÌNH CHÍNH CHECKOUT (2 CỘT)
  // =========================================================================
  const displayTime = customTime.trim() || appointmentTime;

  return (
    <div className="portal-container checkout-container">
      {/* Breadcrumb */}
      <div className="checkout-breadcrumb">
        <Link to="/member/packages">Gói tập hội viên</Link>
        <span>/</span>
        <span style={{ color: 'var(--portal-paper, var(--color-text-main, #202020))', fontWeight: 600 }}>Thanh toán & Đặt lịch</span>
      </div>

      <PageHeader
        eyebrow="Thanh toán"
        title="Xác nhận thanh toán gói tập"
      />

      <div className="checkout-layout">
        {/* CỘT TRÁI (2/3): CHỌN PHƯƠNG THỨC & NHẬP THÔNG TIN */}
        <div>
          <div className="payment-methods">
            {/* Phương thức 1: Thanh toán tại quầy & Đặt lịch hẹn */}
            <div
              className={`payment-method-card ${paymentMethod === 'counter' ? 'is-selected' : ''}`}
              onClick={() => setPaymentMethod('counter')}
            >
              <div className="payment-method-radio">
                <div className="payment-method-radio-dot" />
              </div>
              <div className="payment-method-content">
                <div className="payment-method-title">
                  <span>🏢 Thanh toán tại quầy lễ tân</span>
                  <span className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>Đặt lịch hẹn</span>
                </div>
                <div className="payment-method-desc">
                  Thanh toán bằng Tiền mặt hoặc Quẹt thẻ POS trực tiếp tại sảnh trung tâm. Tự chọn ngày và giờ hẹn tiếp đón thuận tiện.
                </div>
              </div>
            </div>

            {/* Phương thức 2: Quét mã QR Online */}
            <div
              className={`payment-method-card ${paymentMethod === 'vietqr' ? 'is-selected' : ''}`}
              onClick={() => setPaymentMethod('vietqr')}
            >
              <div className="payment-method-radio">
                <div className="payment-method-radio-dot" />
              </div>
              <div className="payment-method-content">
                <div className="payment-method-title">
                  <span>📱 Quét mã QR chuyển khoản nhanh (VietQR)</span>
                  <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>Online 24/7</span>
                </div>
                <div className="payment-method-desc">
                  Chuyển khoản liên ngân hàng miễn phí 24/7 qua app ngân hàng hoặc ví điện tử (Momo, VNPay, ZaloPay).
                </div>
              </div>
            </div>
          </div>

          {/* CHI TIẾT PHƯƠNG THỨC 1: FORM ĐẶT LỊCH HẸN TẠI QUẦY */}
          {paymentMethod === 'counter' && (
            <div className="appointment-form-box">
              <h3 className="appointment-form-title">
                <span>🗓️ Chọn lịch hẹn tiếp đón tại quầy</span>
              </h3>

              <form onSubmit={handleConfirmPayment}>
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
                    Khung giờ hẹn tiếp đón * (Đang chọn: <strong>{displayTime}</strong>)
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
                      style={{ width: '130px', padding: '6px 10px' }}
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      placeholder="HH:MM"
                    />
                  </div>
                </div>

                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="appointment-notes">
                    Ghi chú thêm cho Lễ tân (Tùy chọn)
                  </label>
                  <textarea
                    id="appointment-notes"
                    className="portal-input"
                    rows={2}
                    placeholder="Vd: Tôi muốn thanh toán bằng thẻ Visa/Mastercard, vui lòng chuẩn bị máy quẹt POS."
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
                  {isSubmitting ? 'Đang tạo lịch hẹn...' : 'Xác Nhận Đặt Lịch Hẹn & Thanh Toán Tại Quầy'}
                </button>
              </form>
            </div>
          )}

          {/* CHI TIẾT PHƯƠNG THỨC 2: KHUNG QUÉT MÃ VIETQR */}
          {paymentMethod === 'vietqr' && (
            <div className="vietqr-box">
              <div className="vietqr-layout">
                {/* Cột mã QR */}
                <div className="vietqr-frame">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="Mã VietQR thanh toán" width={220} height={220} />
                  ) : (
                    <div style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="spinner" />
                    </div>
                  )}
                  <span className="vietqr-frame-badge">VietQR · MBBank 24/7</span>
                </div>

                {/* Bảng thông tin chuyển khoản */}
                <div>
                  <table className="vietqr-details-table">
                    <tbody>
                      <tr>
                        <td className="label">Ngân hàng</td>
                        <td className="value">
                          <span>MBBank (Quân Đội)</span>
                        </td>
                      </tr>
                      <tr>
                        <td className="label">Chủ tài khoản</td>
                        <td className="value">
                          <span>SOL FITNESS VIETNAM</span>
                        </td>
                      </tr>
                      <tr>
                        <td className="label">Số tài khoản</td>
                        <td className="value">
                          <strong>999988886666</strong>
                          <button
                            type="button"
                            className="btn-copy"
                            onClick={() => handleCopy('999988886666', 'Số tài khoản')}
                          >
                            Copy
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td className="label">Số tiền</td>
                        <td className="value">
                          <strong style={{ color: 'var(--portal-salmon, #e07a5f)' }}>
                            {formatPrice(selectedPackage.price)}
                          </strong>
                          <button
                            type="button"
                            className="btn-copy"
                            onClick={() => handleCopy(String(selectedPackage.price), 'Số tiền')}
                          >
                            Copy
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td className="label">Nội dung CK</td>
                        <td className="value">
                          <strong style={{ letterSpacing: '0.04em' }}>{transferSyntax}</strong>
                          <button
                            type="button"
                            className="btn-copy"
                            onClick={() => handleCopy(transferSyntax, 'Nội dung chuyển khoản')}
                          >
                            Copy
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div style={{ marginTop: 16, fontSize: '0.84rem', color: 'var(--portal-muted, #68645f)', lineHeight: 1.45 }}>
                    * Mở app ngân hàng quét mã QR để điền tự động chính xác số tiền và nội dung chuyển khoản.
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: '100%', padding: '14px' }}
                  disabled={isSubmitting}
                  onClick={handleConfirmPayment}
                >
                  {isSubmitting ? 'Đang xác nhận giao dịch...' : 'Tôi Đã Hoàn Tất Chuyển Khoản'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* CỘT PHẢI (1/3): TÓM TẮT ĐƠN HÀNG (ORDER SUMMARY) */}
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
              <div className="order-breakdown-row">
                <span>Thuế VAT (0%)</span>
                <span>0 đ</span>
              </div>
              <div className="order-breakdown-row total">
                <span>Tổng thanh toán</span>
                <span>{formatPrice(selectedPackage.price)}</span>
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
