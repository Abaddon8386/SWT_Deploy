import { sourceMessage, useI18n } from '../../shared/i18n';
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
import { getProfile, submitMemberKyc, Profile } from './profileApi';
import './member-checkout.css';
import { localizableError } from '../../shared/lib/errorMessage';

export function MemberCheckoutPage() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const packageIdParam = searchParams.get('packageId');
  const parsedPackageId = packageIdParam ? parseInt(packageIdParam, 10) : null;
  const subscriptionIdParam = searchParams.get('subscriptionId');
  const existingSubscriptionId = subscriptionIdParam ? parseInt(subscriptionIdParam, 10) : null;

  const preparedSubscriptionId = useRef<number | null>(existingSubscriptionId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | Error | { vi: string; en: string } | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<MembershipPackage | null>(null);
  // Số tiền thật phải thanh toán: yêu cầu nâng cấp hoặc gia hạn đã được backend báo giá
  const [quotedAmount, setQuotedAmount] = useState<number | null>(null);

  // Identity / KYC state for first-time package purchase
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasPriorSubscriptions, setHasPriorSubscriptions] = useState(false);
  const [kycDocType, setKycDocType] = useState<'CCCD' | 'PASSPORT'>('CCCD');
  const [kycNumber, setKycNumber] = useState('');
  const [kycFullName, setKycFullName] = useState('');
  const [kycNationality, setKycNationality] = useState('');
  const [kycFrontImage, setKycFrontImage] = useState('');
  const [kycBackImage, setKycBackImage] = useState('');
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycError, setKycError] = useState<string | Error>('');
  const [kycSuccess, setKycSuccess] = useState('');

  useEffect(() => {
    let active = true;
    let request = 0;
    preparedSubscriptionId.current = existingSubscriptionId;
    async function initCheckout() {
      const version = ++request;
      setLoading(true);
      setError(null);
      try {
        const [packages, history, userProfile] = await Promise.all([
          getMembershipPackages(),
          getMembershipHistory(),
          getProfile().catch(() => null),
        ]);
        if (!active || version !== request) return;

        setProfile(userProfile);
        setHasPriorSubscriptions(history.length > 0);
        if (userProfile?.fullName) {
          setKycFullName(userProfile.fullName);
        }

        const subscriptionId = preparedSubscriptionId.current;
        if (subscriptionId) {
          const subscription = history.find((item) => item.id === subscriptionId);
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
            setError({ vi: `Không tìm thấy thông tin gói tập #${parsedPackageId}.`, en: `Membership #${parsedPackageId} not found.` });
          }
        } else if (packages.length > 0) {
          setSelectedPackage(packages[0]);
        } else {
          setError('Hiện tại chưa có gói tập nào trong hệ thống.');
        }
      } catch (err) {
        if (active && version === request) setError(localizableError(err, 'Không thể tải thông tin gói tập.'));
      } finally {
        if (active && version === request) setLoading(false);
      }
    }

    void initCheckout();
    const restore = (event: PageTransitionEvent) => { if (event.persisted) void initCheckout(); };
    window.addEventListener('pageshow', restore);
    return () => {
      active = false;
      window.removeEventListener('pageshow', restore);
    };
  }, [parsedPackageId, existingSubscriptionId]);

  const amount = selectedPackage ? quotedAmount ?? selectedPackage.price : 0;
  const isKycVerified = Boolean(profile?.identityVerified || hasPriorSubscriptions);

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>, target: 'front' | 'back') {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setKycError('Dung lượng ảnh tối đa 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      if (target === 'front') setKycFrontImage(b64);
      else setKycBackImage(b64);
      setKycError('');
    };
    reader.readAsDataURL(file);
  }

  async function handleKycSubmit(e: React.FormEvent) {
    e.preventDefault();
    setKycError('');
    if (!kycNumber.trim()) {
      setKycError('Vui lòng nhập số CCCD hoặc Hộ chiếu.');
      return;
    }
    if (kycDocType === 'CCCD' && !/^\d{12}$/.test(kycNumber.trim())) {
      setKycError('Số Căn cước công dân (CCCD) phải bao gồm đúng 12 chữ số.');
      return;
    }
    if (kycDocType === 'PASSPORT') {
      if (!kycNationality.trim()) {
        setKycError('Vui lòng nhập quốc tịch của bạn.');
        return;
      }
      const nat = kycNationality.trim().toLowerCase();
      if (nat.includes('việt nam') || nat.includes('vietnam') || nat.includes('viet nam') || nat === 'vn') {
        setKycError('Hộ chiếu chỉ áp dụng cho người nước ngoài. Công dân Việt Nam vui lòng sử dụng CCCD.');
        return;
      }
    }
    if (!kycFullName.trim()) {
      setKycError('Vui lòng nhập họ và tên đúng như trên giấy tờ.');
      return;
    }
    if (!kycFrontImage) {
      setKycError('Vui lòng tải lên ảnh mặt trước của giấy tờ.');
      return;
    }
    if (kycDocType === 'CCCD' && !kycBackImage) {
      setKycError('Vui lòng tải lên ảnh mặt sau của CCCD.');
      return;
    }

    setKycSubmitting(true);
    try {
      const updated = await submitMemberKyc({
        documentType: kycDocType,
        citizenId: kycNumber.trim(),
        fullName: kycFullName.trim(),
        nationality: kycDocType === 'PASSPORT' ? kycNationality.trim() : 'Việt Nam',
        frontImageUrl: kycFrontImage,
        backImageUrl: kycDocType === 'CCCD' ? kycBackImage : undefined,
      });
      setProfile(updated);
      window.dispatchEvent(new Event('profile-updated'));
      setKycSuccess('Đã xác minh danh tính và đồng bộ họ tên tài khoản thành công! Bạn có thể tiếp tục thanh toán bên dưới.');
    } catch (err) {
      setKycError(localizableError(err, 'Không thể gửi xác minh danh tính. Vui lòng kiểm tra lại.'));
    } finally {
      setKycSubmitting(false);
    }
  }

  async function preparePaymentTarget() {
    if (!selectedPackage) throw new Error('Không tìm thấy gói tập.');
    const history = await getMembershipHistory();
    if (preparedSubscriptionId.current) {
      const subscription = history.find(item => item.id === preparedSubscriptionId.current);
      if (!subscription || subscription.status !== 'pending_payment' || subscription.packageId !== selectedPackage.id) {
        throw Object.assign(new Error('Yêu cầu gói tập không còn hợp lệ để thanh toán. Vui lòng quay lại danh mục.'), {
          translation: sourceMessage('Yêu cầu gói tập không còn hợp lệ để thanh toán. Vui lòng quay lại danh mục.', 'This membership request is no longer available for payment. Please return to the catalog.'),
        });
      }
    }
    if (!preparedSubscriptionId.current) {
      const pending = history.find((item) => item.packageId === selectedPackage.id && item.status === 'pending_payment');
      preparedSubscriptionId.current = pending?.id ?? (await createMembershipSubscription(selectedPackage.id)).id;
    }
    return { subscriptionId: preparedSubscriptionId.current };
  }

  if (loading) {
    return (
      <div className="portal-container checkout-container" data-i18n-managed>
        <div className="portal-state" style={{ minHeight: '300px' }}>
          <div className="spinner" />
          <p style={{ marginTop: 12 }}>{t("Đang tải thông tin thanh toán gói tập...")}</p>
        </div>
      </div>
    );
  }

  if (error || !selectedPackage) {
    return (
      <div className="portal-container checkout-container" data-i18n-managed>
        <div className="portal-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p role="alert" style={{ color: 'var(--portal-danger, #fca5a5)', fontSize: '1.1rem', marginBottom: 16 }}>
            {error ? t(error) : t("Không tìm thấy thông tin gói tập.")}
          </p>
          <Link to="/member/packages" className="btn-primary">
            {t(" Quay lại danh mục gói tập ")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-container checkout-container" data-i18n-managed>
      <div className="checkout-breadcrumb">
        <Link to="/member/packages">{t("Gói tập hội viên")}</Link>
        <span>/</span>
        <span style={{ color: 'var(--portal-paper, var(--color-text-main, #202020))', fontWeight: 600 }}>{t("Thanh toán")}</span>
      </div>

      <PageHeader eyebrow={t("Thanh toán")} title={t("Thanh toán gói tập")} />

      <div className="checkout-layout">
        <div className="stack" data-i18n-managed>
          {!isKycVerified ? (
            <section className="portal-card stack" aria-label={t("Xác minh CCCD hoặc Hộ chiếu trước khi đăng ký gói tập đầu tiên")}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.25rem' }}>🪪</span>
                <h2 className="portal-card-title" style={{ margin: 0 }}>
                  {t(" Xác minh danh tính trước khi đăng ký gói tập đầu tiên ")}</h2>
              </div>
              <p className="row-card__meta" style={{ margin: 0, color: '#f59e0b' }}>
                {t(" Hội viên mới cần cập nhật CCCD (hoặc Hộ chiếu cho người nước ngoài) để xác thực hợp đồng hội viên. Họ tên tài khoản sẽ được đồng bộ chính xác theo họ tên trên giấy tờ này. ")}</p>

              {kycError && (
                <div role="alert" style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.9rem' }}>
                  {t(kycError)}
                </div>
              )}
              {kycSuccess && (
                <div role="status" style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(34, 197, 94, 0.1)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.2)', fontSize: '0.9rem' }}>
                  {t(kycSuccess)}
                </div>
              )}

              <form onSubmit={handleKycSubmit} className="stack" style={{ gap: 14 }}>
                <div>
                  <label className="filter-label" style={{ display: 'block', marginBottom: 6 }}>{t("Loại giấy tờ định danh:")}</label>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.95rem' }}>
                      <input
                        type="radio"
                        name="checkoutDocType"
                        value="CCCD"
                        checked={kycDocType === 'CCCD'}
                        onChange={() => setKycDocType('CCCD')}
                      />
                      <span>{t("Căn cước công dân (Việt Nam)")}</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.95rem' }}>
                      <input
                        type="radio"
                        name="checkoutDocType"
                        value="PASSPORT"
                        checked={kycDocType === 'PASSPORT'}
                        onChange={() => setKycDocType('PASSPORT')}
                      />
                      <span>{t("Hộ chiếu (Người nước ngoài)")}</span>
                    </label>
                  </div>
                </div>

                {kycDocType === 'PASSPORT' && (
                  <div>
                    <label htmlFor="checkout-nationality" className="filter-label" style={{ display: 'block', marginBottom: 6 }}>
                      {t(" Quốc tịch (Nationality) ")}<span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      id="checkout-nationality"
                      type="text"
                      className="portal-input"
                      placeholder={t("Ví dụ: United States, France, Japan...")}
                      value={kycNationality}
                      onChange={(e) => setKycNationality(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="checkout-doc-number" className="filter-label" style={{ display: 'block', marginBottom: 6 }}>
                    {kycDocType === 'CCCD' ? t("Số Căn cước công dân (12 chữ số)") : t("Số Hộ chiếu (Passport Number)")} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    id="checkout-doc-number"
                    type="text"
                    className="portal-input"
                    placeholder={kycDocType === 'CCCD' ? t("Nhập 12 chữ số CCCD") : t("Nhập mã số hộ chiếu")}
                    value={kycNumber}
                    onChange={(e) => setKycNumber(e.target.value)}
                    maxLength={30}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="checkout-fullname" className="filter-label" style={{ display: 'block', marginBottom: 6 }}>
                    {t(" Họ và tên đầy đủ (trên CCCD / Hộ chiếu) ")}<span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    id="checkout-fullname"
                    type="text"
                    className="portal-input"
                    placeholder={t("Ví dụ: NGUYỄN VĂN A hoặc JOHN DOE")}
                    value={kycFullName}
                    onChange={(e) => setKycFullName(e.target.value)}
                    required
                  />
                  <span style={{ fontSize: '0.8rem', color: '#9ca3af', display: 'block', marginTop: 4 }}>
                    {t(" Họ tên tài khoản sẽ được đồng bộ theo tên này. ")}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: kycDocType === 'CCCD' ? '1fr 1fr' : '1fr', gap: 12 }}>
                  <div>
                    <label className="filter-label" style={{ display: 'block', marginBottom: 6 }}>
                      {t(" Ảnh mặt trước ")}{kycDocType === 'PASSPORT' ? t("Hộ chiếu") : 'CCCD'} <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    {kycFrontImage ? (
                      <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' }}>
                        <img src={kycFrontImage} alt={t("Mặt trước")} style={{ width: '100%', height: 110, objectFit: 'cover' }} />
                        <button type="button" onClick={() => setKycFrontImage('')} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', borderRadius: 4, padding: '2px 6px', fontSize: '0.75rem', cursor: 'pointer' }}>{t("Xóa")}</button>
                      </div>
                    ) : (
                      <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'front')} className="portal-input" style={{ fontSize: '0.85rem' }} />
                    )}
                  </div>

                  {kycDocType === 'CCCD' && (
                    <div>
                      <label className="filter-label" style={{ display: 'block', marginBottom: 6 }}>
                        {t(" Ảnh mặt sau CCCD ")}<span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      {kycBackImage ? (
                        <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' }}>
                          <img src={kycBackImage} alt={t("Mặt sau")} style={{ width: '100%', height: 110, objectFit: 'cover' }} />
                          <button type="button" onClick={() => setKycBackImage('')} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', borderRadius: 4, padding: '2px 6px', fontSize: '0.75rem', cursor: 'pointer' }}>{t("Xóa")}</button>
                        </div>
                      ) : (
                        <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'back')} className="portal-input" style={{ fontSize: '0.85rem' }} />
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={kycSubmitting}
                  className="btn-primary"
                  style={{ marginTop: 8 }}
                >
                  {kycSubmitting ? t("Đang xác minh & đồng bộ họ tên...") : t("Xác minh & Đồng bộ họ tên")}
                </button>
              </form>
            </section>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#4ade80', fontSize: '0.9rem' }}>
              <span>✓</span>
              <span>{t("Đã xác minh định danh theo ")}{profile?.documentType || 'CCCD'}: <strong>{profile?.fullName}</strong> {profile?.citizenId ? t(`(Số: ${profile.citizenId})`, `(Number: ${profile.citizenId})`) : ''}</span>
            </div>
          )}

          <section className="portal-card stack" aria-label={t("Phương thức thanh toán trực tuyến")} style={{ opacity: !isKycVerified ? 0.6 : 1, pointerEvents: !isKycVerified ? 'none' : 'auto' }}>
            <h2 className="portal-card-title">{t("Thanh toán qua VNPay hoặc Ví điện tử SÖL")}</h2>
            {!isKycVerified && (
              <p style={{ color: '#f59e0b', fontSize: '0.9rem', margin: 0 }}>
                {t(" ⚠️ Vui lòng hoàn tất biểu mẫu xác minh danh tính ở trên để mở khóa các nút thanh toán. ")}</p>
            )}
            <VnpayPayButton
              prepare={preparePaymentTarget}
              onPaid={() => navigate('/member/packages', { replace: true })}
            />
          </section>

          <section className="portal-card stack" aria-label={t("Lưu ý thanh toán tiền mặt")}>
            <h3 className="portal-card-title">{t("Thanh toán tiền mặt")}</h3>
            <p className="row-card__meta" style={{ margin: 0 }}>
              {t(" Lưu ý: Nếu bạn muốn thanh toán bằng tiền mặt, vui lòng gặp trực tiếp Lễ tân tại quầy để được hỗ trợ thu tiền và kích hoạt gói tập. ")}</p>
          </section>
        </div>

        <div>
          <div className="order-summary-card">
            <h3 className="order-summary-title">{t("Tóm tắt đơn hàng")}</h3>

            <div className="order-package-info">
              <div className="order-package-name">{selectedPackage.name}</div>
              <div className="order-package-term">
                <span>{t("Thời hạn: ")}{selectedPackage.durationDays} {t("ngày tập")}</span>
              </div>
              {selectedPackage.classCreditLimit !== null && (
                <div className="order-package-term" style={{ marginTop: 4 }}>
                  <span>{t("Lớp học: Tối đa ")}{selectedPackage.classCreditLimit} {t("buổi")}</span>
                </div>
              )}
            </div>

            <div className="order-breakdown">
              <div className="order-breakdown-row">
                <span>{t("Giá niêm yết")}</span>
                <span>{formatPrice(selectedPackage.price)}</span>
              </div>
              {amount !== selectedPackage.price && (
                <div className="order-breakdown-row">
                  <span>{t("Số tiền theo yêu cầu hiện tại")}</span>
                  <span>{formatPrice(amount)}</span>
                </div>
              )}
              <div className="order-breakdown-row total">
                <span>{t("Số tiền cần thanh toán")}</span>
                <span>{formatPrice(amount)}</span>
              </div>
            </div>

            <Link
              to="/member/packages"
              className="btn-secondary"
              style={{ width: '100%', textAlign: 'center', display: 'block' }}
            >
              {t(" Chọn gói tập khác ")}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
