import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

import { Link } from 'react-router-dom';
import { getProfile, type Profile } from './profileApi';
import { PageHeader } from '../../shared/ui/PageHeader';
import { notify } from '../../shared/lib/portalNotices';
import { cardStatus } from './cardStatus';
import { getMembershipHistory, getMySubscription, getDynamicQr, type CardSubscription } from './memberCardApi';

function displayDate(value: string) {
  if (!validDate(value)) return '—';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function validDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function MemberCard({ profile, subscription }: { profile: Profile; subscription: CardSubscription }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [qrImage, setQrImage] = useState('');
  const [qrLoaded, setQrLoaded] = useState(false);
  const [qrError, setQrError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dynamicQr, setDynamicQr] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(30);
  const paidThroughDate = subscription.paidThroughDate ?? subscription.endDate;
  const status = cardStatus(subscription.status, paidThroughDate);
  const periodStatus = cardStatus(subscription.status, subscription.endDate);
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const canShowQr =
    validDate(subscription.startDate) &&
    subscription.startDate <= localToday &&
    validDate(subscription.endDate) &&
    (periodStatus === 'active' || periodStatus === 'warning') &&
    (status === 'active' || status === 'warning') &&
    Boolean(subscription.qrCode?.trim());
  const border = status === 'warning' ? '#D6A638' : status === 'active' ? '#ce9180' : '#A45A53';

  // Fetch dynamic QR on interval
  useEffect(() => {
    if (!canShowQr || typeof getDynamicQr !== 'function') return;

    let mounted = true;
    let timerId: ReturnType<typeof setInterval> | null = null;

    async function fetchDynamic() {
      try {
        const res = await getDynamicQr();
        if (mounted && res?.qrCode) {
          setDynamicQr(res.qrCode);
          setCountdown(Math.min(res.expiresInSeconds || 30, 30));
        }
      } catch {
        // Fallback to static QR
      }
    }

    void fetchDynamic();
    const intervalId = setInterval(() => {
      void fetchDynamic();
    }, 30000);

    timerId = setInterval(() => {
      setCountdown((prev) => (prev > 1 ? prev - 1 : 30));
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
      if (timerId) clearInterval(timerId);
    };
  }, [canShowQr]);

  const activeQrCode = dynamicQr || subscription.qrCode;

  useEffect(() => {
    let cancelled = false;
    setQrImage('');
    setQrLoaded(false);
    setQrError(false);
    if (!canShowQr || !activeQrCode) return;
    QRCode.toDataURL(activeQrCode, { width: 240, margin: 2 })
      .then((image) => { if (!cancelled) { setQrImage(image); setQrError(false); } })
      .catch(() => { if (!cancelled) setQrError(true); });
    return () => { cancelled = true; };
  }, [canShowQr, activeQrCode]);

  async function downloadCard() {
    if (!cardRef.current || !canShowQr || !qrImage || !qrLoaded || qrError || downloading) return;
    setDownloading(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(cardRef.current, { backgroundColor: '#202020', scale: 2 });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = 'the-hoi-vien.png';
      link.click();
      notify('Đã tải thẻ hội viên về máy.', 'success');
    } catch {
      notify('Không thể tải thẻ. Vui lòng thử lại.', 'error');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <div ref={cardRef} className="pass-card" style={{ background: '#202020', color: '#faf9f6', border: `2px solid ${border}`, borderRadius: 16, padding: 32, maxWidth: 620 }}>
        <div style={{ color: '#ce9180', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 24 }}>SÖL FITNESS</div>
        <p style={{ fontSize: '0.75rem', letterSpacing: '0.16em', color: '#bcb8b5', marginTop: 4 }}>THẺ HỘI VIÊN ĐIỆN TỬ</p>
        <h2 style={{ margin: '14px 0 8px' }}>{profile.fullName}</h2>
        <p style={{ margin: '4px 0' }}>Mã hội viên: {profile.membershipCode || 'Chưa có mã hội viên'}</p>
        <p style={{ margin: '4px 0' }}>Gói tập: {subscription.packageName}</p>
        <p style={{ margin: '4px 0' }}>Ngày bắt đầu: {displayDate(subscription.startDate)}</p>
        <p style={{ margin: '4px 0 12px' }}>Ngày hết hạn: {displayDate(paidThroughDate)}</p>
        <p style={{ color: border, fontWeight: 600 }}>
          {status === 'warning'
            ? 'Gói tập sắp hết hạn'
            : status === 'expired'
              ? 'Gói tập đã hết hạn'
              : status === 'active'
                ? 'Gói tập đang hoạt động'
                : 'Gói tập chưa hoạt động'}
        </p>
        {canShowQr && qrImage && !qrError && (
          <div style={{ marginTop: 14 }}>
            <img
              src={qrImage}
              alt="Mã QR check-in của hội viên"
              width={180}
              height={180}
              style={{ background: 'white', padding: 8, borderRadius: 8 }}
              onLoad={() => setQrLoaded(true)}
              onError={() => {
                setQrLoaded(false);
                setQrError(true);
              }}
            />
            <div style={{ marginTop: 10, fontSize: '0.78rem', color: '#bcb8b5', fontFamily: 'monospace' }}>
              {dynamicQr ? (
                <span>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#48BB78', marginRight: 6 }} />
                  Dynamic QR (Bảo mật) - Đổi mới sau <strong>{countdown}s</strong>
                </span>
              ) : (
                <span>Mã QR định danh: <strong>{subscription.qrCode}</strong></span>
              )}
            </div>
          </div>
        )}
        {canShowQr && !qrImage && !qrError && (
          <div className="portal-skeleton" style={{ width: 180, height: 180, marginTop: 14 }}>
            <span className="sr-only">Đang tạo ảnh QR…</span>
          </div>
        )}
        {qrError && <p role="alert">Không thể hiển thị mã QR. Vui lòng tải lại trang.</p>}
        {!canShowQr && <p>Chưa có mã QR hợp lệ để check-in. Vui lòng kiểm tra gói tập.</p>}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
        <button
          type="button"
          className="btn-primary"
          onClick={downloadCard}
          disabled={!canShowQr || !qrImage || !qrLoaded || qrError || downloading}
        >
          {downloading ? 'Đang tải…' : 'Tải thẻ về máy'}
        </button>
        {canShowQr && activeQrCode && (
          <button
            type="button"
            className="btn-secondary"
            onClick={async () => {
              try {
                if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
                await navigator.clipboard.writeText(activeQrCode!);
                notify('Đã sao chép mã QR check-in vào bộ nhớ tạm!', 'success');
              } catch {
                notify('Không thể sao chép mã QR. Vui lòng thử lại.', 'error');
              }
            }}
          >
            {dynamicQr ? 'Sao chép Dynamic QR' : 'Sao chép mã QR Check-in'}
          </button>
        )}
      </div>
    </>
  );
}

export function MemberCardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<CardSubscription | null>(null);
  const [history, setHistory] = useState<CardSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadCard() {
    setLoading(true);
    setError('');
    setHistory([]);
    try {
      const [memberProfile, memberSubscription] = await Promise.all([getProfile(), getMySubscription()]);
      const memberHistory = memberSubscription ? [] : await getMembershipHistory();
      setProfile(memberProfile);
      setSubscription(memberSubscription);
      setHistory(memberHistory);
    } catch {
      setError('Không thể tải thông tin thẻ hội viên. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadCard(); }, []);

  const expired = history
    .filter((item) => validDate(item.startDate) && validDate(item.endDate) &&
      (item.status === 'expired' || (item.status === 'active' && cardStatus(item.status, item.endDate) === 'expired')))
    .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  const latestPending = history.find((item) => item.status === 'pending_payment');
  const pending = latestPending && (!expired || latestPending.createdAt > expired.createdAt) ? latestPending : null;

  return (
    <div className="portal-container">
      <PageHeader eyebrow="Hội viên" title="Thẻ thành viên & Mã QR" />
      {loading && (
        <div className="portal-card" role="status" aria-busy="true" style={{ maxWidth: 620 }}>
          <span className="sr-only">Đang tải thẻ hội viên…</span>
          <div className="portal-skeleton-line" style={{ width: '48%', height: 18, marginBottom: 12 }} />
          <div className="portal-skeleton-line" style={{ width: '32%', height: 12, marginBottom: 20 }} />
          <div className="portal-skeleton-line" style={{ width: '60%', height: 24, marginBottom: 14 }} />
          <div className="portal-skeleton-line" style={{ width: '45%', height: 14, marginBottom: 8 }} />
          <div className="portal-skeleton-line" style={{ width: '52%', height: 14, marginBottom: 8 }} />
          <div className="portal-skeleton-line" style={{ width: '40%', height: 14, marginBottom: 20 }} />
          <div className="portal-skeleton" style={{ width: 180, height: 180 }} />
        </div>
      )}
      {error && (
        <div className="portal-card" role="alert">
          <p>{error}</p>
          <button type="button" className="btn-secondary" onClick={() => void loadCard()}>Thử lại</button>
        </div>
      )}
      {!loading && !error && !subscription && pending && (
        <div className="portal-card" style={{ maxWidth: 620 }}>
          <div className="meta-label">Trạng thái thẻ</div>
          <h3 className="portal-card-title" style={{ marginTop: 8 }}>Đang chờ thanh toán: {pending.packageName}</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            <button type="button" className="btn-secondary btn-sm" onClick={() => void loadCard()}>
              Kiểm tra lại trạng thái
            </button>
            <Link className="btn-primary btn-sm" to="/member/packages">
              Xem yêu cầu gói tập
            </Link>
          </div>
        </div>
      )}
      {!loading && !error && !subscription && expired && profile && (
        <>
          <MemberCard profile={profile} subscription={{ ...expired, status: 'expired', qrCode: null }} />
          <p style={{ marginTop: 14 }}>Gói tập đã hết hạn. <Link to="/member/packages">Xem gói tập để gia hạn</Link></p>
        </>
      )}
      {!loading && !error && !subscription && history.length > 0 && !expired && !pending && (
        <div className="portal-card" style={{ maxWidth: 620 }}>
          <p>Bạn không còn gói tập hiệu lực.</p>
          <Link className="btn-primary" to="/member/packages">Xem gói tập</Link>
        </div>
      )}
      {!loading && !error && !subscription && history.length === 0 && (
        <div className="portal-card" style={{ maxWidth: 620 }}>
          <p>Chưa có gói tập để hiển thị thẻ hội viên.</p>
          <p>Vui lòng đăng ký hoặc gia hạn gói tập.</p>
          <Link className="btn-primary" to="/member/packages">Xem gói tập</Link>
        </div>
      )}
      {!loading && !error && profile && subscription && <MemberCard profile={profile} subscription={subscription} />}
    </div>
  );
}

