import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../../shared/ui/Modal';
import {
  getCoaches,
  getAvailableSlots,
  createCoachBooking,
  getMyCoachBookings,
  cancelCoachBooking,
  getMemberQuotaStatus,
  type CoachPublicDto,
  type CoachAvailableSlotDto,
  type CoachBookingDto,
  type CoachQuotaStatusDto,
} from '../coachBookingApi';
import {
  createCoachReview,
  getMyCoachReviews,
  getCoachLeaderboard,
  type CoachReviewDto,
  type CoachLeaderboardItemDto,
} from '../../coaching/coachReviewApi';
import { coachIllustration } from '../../../shared/lib/coachIllustration';
import { formatPrice } from '../../../shared/lib/membershipPresentation';
import { notify } from '../../../shared/lib/portalNotices';
import { ApiError } from '../../../shared/api/client';
import { formatCoachName, isSessionCompleted } from '../coachBookingUtils';

function coachBookingErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'MEMBERSHIP_INACTIVE_OR_EXPIRED') {
      return 'Bạn chưa có gói tập đang hoạt động (hoặc gói tập không còn hiệu lực vào ngày đặt lịch). Vui lòng đăng ký hoặc kích hoạt gói tập trước khi đặt lịch HLV 1:1.';
    }
    if (err.code === 'COACH_BOOKING_PACKAGE_NO_QUOTA') {
      return 'Gói tập hiện tại không bao gồm lượt tập PT 1:1 miễn phí. Vui lòng chọn hình thức thanh toán theo giờ.';
    }
    if (err.code === 'COACH_BOOKING_QUOTA_EXCEEDED') {
      return 'Bạn đã sử dụng hết lượt tập PT 1:1 miễn phí trong tháng này của gói tập. Vui lòng chọn thanh toán theo giờ.';
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Không thể đặt lịch. Vui lòng thử lại.';
}

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function nextDays(count = 7): Array<{ iso: string; label: string; isToday: boolean }> {
  const days: Array<{ iso: string; label: string; isToday: boolean }> = [];
  const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const name = i === 0 ? 'Hôm nay' : dayNames[d.getDay()];
    days.push({
      iso,
      label: `${name} (${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')})`,
      isToday: i === 0,
    });
  }
  return days;
}

export function MemberCoachBookingView({
  onBookingSuccess,
}: {
  onBookingSuccess?: () => void;
}) {
  const navigate = useNavigate();
  const [coaches, setCoaches] = useState<CoachPublicDto[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(localToday());
  const [slots, setSlots] = useState<CoachAvailableSlotDto[]>([]);
  const [myBookings, setMyBookings] = useState<CoachBookingDto[]>([]);
  const [quotaStatus, setQuotaStatus] = useState<CoachQuotaStatusDto | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  // quotaStatus stays null while loading or when the request fails; only a loaded answer without a package means none.
  const hasNoPackage = quotaStatus !== null && !quotaStatus.packageName;
  const [leaderboard, setLeaderboard] = useState<CoachLeaderboardItemDto[]>([]);
  const [myReviews, setMyReviews] = useState<CoachReviewDto[]>([]);

  const [loadingCoaches, setLoadingCoaches] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState('');

  // Booking Modal State
  const [modalSlot, setModalSlot] = useState<CoachAvailableSlotDto | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'package_quota' | 'hourly_pay'>('package_quota');
  const [notes, setNotes] = useState('');

  // Payment Checkout Modal State
  const [paymentModalBooking, setPaymentModalBooking] = useState<CoachBookingDto | null>(null);

  // Review Modal State
  const [reviewTargetBooking, setReviewTargetBooking] = useState<CoachBookingDto | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [reviewAnonymous, setReviewAnonymous] = useState<boolean>(false);
  const [reviewSubmitting, setReviewSubmitting] = useState<boolean>(false);

  // Cancel Modal State
  const [cancelTarget, setCancelTarget] = useState<CoachBookingDto | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const daysList = nextDays(10);

  // Load coaches, member bookings, reviews and leaderboard
  useEffect(() => {
    let active = true;
    async function init() {
      setLoadingCoaches(true);
      setError('');
      try {
        const [coachList, bookingsList, quota, board, reviews] = await Promise.all([
          getCoaches(),
          getMyCoachBookings(),
          getMemberQuotaStatus().catch(() => null),
          getCoachLeaderboard().catch(() => []),
          getMyCoachReviews().catch(() => []),
        ]);
        if (!active) return;
        setCoaches(coachList);
        setMyBookings(bookingsList);
        if (quota) setQuotaStatus(quota);
        setLeaderboard(board);
        setMyReviews(reviews);
        setSelectedCoachId((current) => current ?? coachList[0]?.id ?? null);
      } catch (err: unknown) {
        if (active) setError((err instanceof Error ? err.message : 'Không thể tải danh sách huấn luyện viên.'));
      } finally {
        if (active) setLoadingCoaches(false);
      }
    }
    void init();
    return () => { active = false; };
  }, []);

  // Load slots when coach or date changes
  useEffect(() => {
    if (!selectedCoachId || !selectedDate) return;
    let active = true;
    async function loadSlots() {
      setLoadingSlots(true);
      setSlots([]);
      try {
        const availableSlots = await getAvailableSlots(selectedCoachId!, selectedDate);
        if (active) setSlots(availableSlots);
      } catch (err: unknown) {
        if (active) setError((err instanceof Error ? err.message : 'Không thể tải khung giờ trống.'));
      } finally {
        if (active) setLoadingSlots(false);
      }
    }
    void loadSlots();
    return () => { active = false; };
  }, [selectedCoachId, selectedDate]);

  const selectedCoach = coaches.find((c) => c.id === selectedCoachId);
  const hasRemainingQuota = (quotaStatus?.remainingQuota ?? 0) > 0;

  function handleOpenBookingModal(slot: CoachAvailableSlotDto) {
    setModalSlot(slot);
    setError('');
    if (hasRemainingQuota) {
      setPaymentMethod('package_quota');
    } else {
      setPaymentMethod('hourly_pay');
    }
  }

  async function handleConfirmBooking() {
    if (!selectedCoach || !modalSlot) return;
    setSubmitting(true);
    setError('');
    
    try {
      const created = await createCoachBooking({
        coachId: selectedCoach.id,
        bookingDate: selectedDate,
        startTime: modalSlot.startTime,
        endTime: modalSlot.endTime,
        paymentMethod: paymentMethod === 'package_quota' ? 'package_quota' : 'bank_transfer',
        notes: notes.trim() || undefined,
      });

      setModalSlot(null);
      setNotes('');

      const [updatedSlots, updatedBookings, updatedQuota] = await Promise.all([
        getAvailableSlots(selectedCoach.id, selectedDate),
        getMyCoachBookings(),
        getMemberQuotaStatus().catch(() => null),
      ]);
      setSlots(updatedSlots);
      setMyBookings(updatedBookings);
      if (updatedQuota) setQuotaStatus(updatedQuota);
      onBookingSuccess?.();

      if (paymentMethod === 'hourly_pay') {
        setPaymentModalBooking(created);
      } else {
        notify(
          `Đặt lịch tập 1:1 với HLV ${formatCoachName(created.coachName)} ngày ${created.bookingDate} (${created.startTime.slice(0, 5)} - ${created.endTime.slice(0, 5)}) thành công (đã trừ 1 lượt quyền lợi gói)!`
        , 'success');
      }
    } catch (err: unknown) {
      setErrorCode(err instanceof ApiError ? err.code : undefined);
      setError(coachBookingErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmReview() {
    if (!reviewTargetBooking) return;
    setReviewSubmitting(true);
    setError('');
    try {
      await createCoachReview({
        coachId: reviewTargetBooking.coachId,
        bookingId: reviewTargetBooking.id,
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
        isAnonymous: reviewAnonymous,
      });

      const [updatedReviews, updatedLeaderboard] = await Promise.all([
        getMyCoachReviews().catch(() => []),
        getCoachLeaderboard().catch(() => []),
      ]);
      setMyReviews(updatedReviews);
      setLeaderboard(updatedLeaderboard);

      notify(`Cảm ơn bạn! Đã gửi đánh giá ${reviewRating} sao cho HLV ${formatCoachName(reviewTargetBooking.coachName)} thành công.`, 'success');
      setReviewTargetBooking(null);
      setReviewComment('');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Không thể gửi đánh giá.';
      setError(errMsg);
      notify(errMsg, 'error');
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function handleConfirmCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await cancelCoachBooking(cancelTarget.id, 'Hội viên chủ động hủy');
      notify(`Đã hủy lịch tập 1:1 với HLV ${formatCoachName(cancelTarget.coachName)} thành công.`, 'success');
      setCancelTarget(null);

      if (selectedCoachId) {
        const [updatedSlots, updatedBookings, updatedQuota] = await Promise.all([
          getAvailableSlots(selectedCoachId, selectedDate),
          getMyCoachBookings(),
          getMemberQuotaStatus().catch(() => null),
        ]);
        setSlots(updatedSlots);
        setMyBookings(updatedBookings);
        if (updatedQuota) setQuotaStatus(updatedQuota);
      }
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : 'Không thể hủy lịch.'));
    } finally {
      setCancelling(false);
    }
  }

  if (loadingCoaches) {
    return (
      <div className="portal-card" style={{ padding: 32, textAlign: 'center' }}>
        <p className="row-card__meta">Đang tải thông tin Huấn luyện viên và khung giờ trống...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>

      {error && (
        <div
          className="portal-card"
          role="alert"
          style={{
            borderColor: 'color-mix(in srgb, var(--portal-danger) 45%, transparent)',
            background: 'color-mix(in srgb, var(--portal-danger) 8%, transparent)',
            padding: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}><strong style={{ color: 'var(--portal-danger, #fca5a5)' }}>{error}</strong>{errorCode === 'MEMBERSHIP_INACTIVE_OR_EXPIRED' && <button type="button" className="btn-primary btn-sm" onClick={() => navigate('/member/packages')} style={{ padding: '4px 10px', fontSize: 12 }}>Đăng ký / Kích hoạt gói tập</button>}</div>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setError('')}
            style={{ padding: '2px 8px', fontSize: 12 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Coach Honor Ribbon */}
      {leaderboard.length > 0 && (
        <div
          className="portal-card"
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.12) 0%, rgba(206, 145, 128, 0.04) 100%)',
            borderColor: 'color-mix(in srgb, var(--portal-star) 35%, transparent)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: 'var(--portal-paper, #202020)' }}>
              🏆 Bảng vinh danh top huấn luyện viên xuất sắc tháng này
            </h4>
            <span style={{ fontSize: 12, color: 'var(--portal-muted, #71717a)' }}>
              Dựa trên đánh giá và mức độ hài lòng của hội viên
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {leaderboard.slice(0, 3).map((item) => (
              <div
                key={item.coachId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'var(--portal-surface, #ffffff)',
                  border: '1px solid color-mix(in srgb, var(--portal-star) 25%, transparent)',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: item.rankPosition === 1 ? 'var(--portal-rank-gold)' : item.rankPosition === 2 ? 'var(--portal-rank-silver)' : 'var(--portal-rank-bronze)',
                    color: 'var(--portal-rank-ink)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  #{item.rankPosition}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 750, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.coachName}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--portal-star)', fontWeight: 700 }}>
                    ⭐ {item.averageRating?.toFixed(1) || '5.0'} / 5.0 • {item.badge || 'Top Coach'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quota Info Banner */}
      <div
        className="portal-card"
        style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg, rgba(206, 145, 128, 0.12) 0%, rgba(206, 145, 128, 0.03) 100%)',
          borderColor: 'color-mix(in srgb, var(--portal-salmon) 35%, transparent)',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 750,
                textTransform: 'uppercase',
                padding: '3px 10px',
                borderRadius: 99,
                background: 'var(--portal-salmon, #ce9180)',
                color: 'var(--portal-on-accent)',
              }}
            >
              Gói: {quotaStatus?.packageName || 'Chưa có gói'}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              Chính sách Huấn luyện viên cá nhân (PT 1:1)
            </span>
          </div>

          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--portal-muted, #71717a)' }}>
            {quotaStatus?.monthlyQuota && quotaStatus.monthlyQuota > 0 ? (
              <>
                Gói {quotaStatus.packageName} được tặng <strong>{quotaStatus.monthlyQuota} lượt PT miễn phí/tháng</strong>.
                Tháng này bạn đã dùng <strong>{quotaStatus.usedThisMonth} lượt</strong> (còn lại:{' '}
                <strong style={{ color: quotaStatus.remainingQuota > 0 ? 'var(--portal-salmon, #ce9180)' : 'var(--portal-danger)' }}>
                  {quotaStatus.remainingQuota} lượt
                </strong>
                ).
                {quotaStatus.remainingQuota <= 0 && ' Khi hết lượt miễn phí, phí đăng ký thêm là 200.000 đ / giờ.'}
              </>
            ) : (
              <>
                {hasNoPackage ? 'Bạn chưa đăng ký gói tập hoặc gói tập chưa được kích hoạt (cần có gói tập đang hoạt động để đặt lịch HLV 1:1).' : `Gói ${quotaStatus?.packageName || 'hiện tại'} không bao gồm lượt tập PT 1:1 miễn phí.`} Phí đặt lịch HLV kèm riêng là{' '}
                <strong style={{ color: 'var(--portal-salmon, #ce9180)' }}>200.000 đ / giờ</strong>. (Gói Gold được tặng 3 lượt/tháng, Platinum 6 lượt/tháng).
              </>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => navigate('/member/packages')}
            style={{ fontSize: 12 }}
          >
            {hasNoPackage ? 'Đăng ký gói tập ngay' : 'Nâng cấp gói tập'}
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => navigate('/member/invoices')}
            style={{ fontSize: 12 }}
          >
            Lịch sử hóa đơn
          </button>
        </div>
      </div>

      {/* Bước 1: Chọn Huấn Luyện Viên */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            1. Chọn Huấn luyện viên cá nhân (PT 1:1)
          </h3>
          <span className="row-card__meta" style={{ fontSize: 13 }}>
            Phí tập tiêu chuẩn: <strong>{formatPrice(200000)} / giờ</strong> (Miễn phí với gói Gold/Platinum)
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 14,
          }}
        >
          {coaches.map((c) => {
            const isSelected = c.id === selectedCoachId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedCoachId(c.id);
                  setError('');
                }}
                className="portal-card"
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  padding: 16,
                  display: 'flex',
                  gap: 14,
                  alignItems: 'center',
                  borderColor: isSelected ? 'var(--portal-salmon, #ce9180)' : 'var(--portal-border, #e4e2de)',
                  background: isSelected ? 'color-mix(in srgb, var(--portal-salmon) 12%, transparent)' : 'var(--portal-surface, #ffffff)',
                  boxShadow: isSelected ? '0 0 0 2px var(--portal-salmon, #ce9180)' : undefined,
                  transition: 'background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease',
                }}
              >
                <img
                  src={c.avatarUrl || coachIllustration(c.specialization)}
                  alt={c.fullName}
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    flexShrink: 0,
                    border: '2px solid rgba(255,255,255,0.2)',
                  }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.fullName}
                    </h4>
                    {isSelected && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-salmon, #ce9180)' }}>
                        ✓ Đang chọn
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--portal-salmon, #ce9180)', fontWeight: 600 }}>
                    {c.specialization || 'Huấn luyện cá nhân'}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--portal-muted, #71717a)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {c.bio || 'Chuyên gia huấn luyện thể hình và phục hồi thể lực.'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Bước 2: Chọn Ngày tập */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            2. Chọn ngày tập luyện
          </h3>
          <span className="row-card__meta" style={{ fontSize: 13, color: 'var(--portal-star)' }}>
            ⚠️ Quy tắc: Buổi tập 1:1 phải được đặt trước ít nhất <strong>2 tiếng</strong>
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
          {daysList.map((d) => {
            const isSelected = d.iso === selectedDate;
            return (
              <button
                key={d.iso}
                type="button"
                className={`filter-chip ${isSelected ? 'is-active' : ''}`}
                style={{
                  minWidth: 105,
                  padding: '9px 12px',
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                }}
                onClick={() => {
                  setSelectedDate(d.iso);
                  setError('');
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Bước 3: Xem và Chọn Khung Giờ (Hourly Slots) */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            3. Chọn khung giờ (Theo giờ)
          </h3>
          <span className="row-card__meta">
            HLV: <strong>{selectedCoach?.fullName}</strong> • Ngày: <strong>{selectedDate}</strong>
          </span>
        </div>

        {loadingSlots ? (
          <div className="portal-card" style={{ padding: 24, textAlign: 'center' }}>
            <p className="row-card__meta">Đang kiểm tra lịch trống của huấn luyện viên...</p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
              gap: 10,
            }}
          >
            {slots.map((slot) => {
              const startFmt = slot.startTime.slice(0, 5);
              const endFmt = slot.endTime.slice(0, 5);

              if (slot.available) {
                return (
                  <button
                    key={slot.startTime}
                    type="button"
                    onClick={() => handleOpenBookingModal(slot)}
                    className="portal-card"
                    style={{
                      padding: '12px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      borderColor: 'color-mix(in srgb, var(--portal-success) 45%, transparent)',
                      background: 'color-mix(in srgb, var(--portal-success) 5%, transparent)',
                      transition: 'transform 160ms ease, background 160ms ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.background = 'color-mix(in srgb, var(--portal-success) 14%, transparent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.background = 'color-mix(in srgb, var(--portal-success) 5%, transparent)';
                    }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 750, color: 'var(--portal-paper, #202020)' }}>
                      {startFmt} – {endFmt}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--portal-success, #226442)' }}>
                      ✓ Còn trống • Đặt lịch
                    </span>
                  </button>
                );
              }

              let badgeText = 'Đã kín lịch';
              let badgeColor = 'var(--portal-muted, #71717a)';
              if (slot.reason === 'coach_on_leave') {
                badgeText = 'HLV nghỉ phép';
                badgeColor = 'var(--portal-warning)';
              } else if (slot.reason === 'too_soon') {
                badgeText = 'Cần đặt trước 2 tiếng';
                badgeColor = 'var(--portal-warning)';
              } else if (slot.reason === 'coach_busy') {
                badgeText = 'HLV đã có lịch';
                badgeColor = 'var(--portal-danger)';
              } else if (slot.reason === 'member_busy') {
                badgeText = 'Bạn đã có lịch trùng';
                badgeColor = 'var(--portal-danger)';
              }

              return (
                <div
                  key={slot.startTime}
                  className="portal-card"
                  style={{
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    opacity: 0.5,
                    background: 'var(--portal-raised, #f4f4f5)',
                    cursor: 'not-allowed',
                  }}
                  title={badgeText}
                >
                  <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--portal-muted, #a1a1aa)' }}>
                    {startFmt} – {endFmt}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: badgeColor }}>
                    ⛔ {badgeText}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Danh sách Lịch 1:1 đã đặt của Hội viên */}
      <section style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            Lịch tập HLV 1:1 của tôi (
            {myBookings.filter((b) => b.status === 'confirmed' && !isSessionCompleted(b)).length} buổi sắp tới
            {myBookings.some((b) => b.status === 'confirmed' && isSessionCompleted(b))
              ? ` • ${myBookings.filter((b) => b.status === 'confirmed' && isSessionCompleted(b)).length} buổi đã kết thúc`
              : ''}
            )
          </h3>
        </div>

        {myBookings.length === 0 ? (
          <div className="portal-card" style={{ padding: 24, textAlign: 'center' }}>
            <p className="row-card__meta" style={{ margin: 0 }}>
              Bạn chưa có lịch hẹn 1:1 nào với Huấn luyện viên. Hãy chọn HLV và khung giờ ở trên để bắt đầu!
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {myBookings.map((b) => {
              const isCancelled = b.status === 'cancelled';
              const hasEnded = isSessionCompleted(b);
              const isConfirmed = !isCancelled;
              const existingReview = myReviews.find((r) => r.bookingId === b.id);
              const coachDisplayName = formatCoachName(b.coachName);

              return (
                <div
                  key={b.id}
                  className="portal-card"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 18px',
                    borderColor: isConfirmed
                      ? hasEnded
                        ? 'var(--portal-border-strong)'
                        : 'color-mix(in srgb, var(--portal-salmon) 35%, transparent)'
                      : 'var(--portal-border, #e4e2de)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: hasEnded ? 'var(--portal-raised)' : 'var(--portal-salmon, #ce9180)',
                        color: hasEnded ? 'var(--portal-paper)' : 'var(--portal-on-accent)',
                        border: hasEnded ? '1px solid var(--portal-border-strong)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 750,
                        fontSize: 16,
                      }}
                    >
                      PT
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--portal-paper, #202020)' }}>
                          Tập 1:1 cùng HLV {coachDisplayName}
                        </h4>
                        {isCancelled ? (
                          <span className="badge badge-danger" style={{ fontSize: 11 }}>
                            Đã hủy
                          </span>
                        ) : hasEnded ? (
                          <span
                            className="badge badge-info"
                            style={{
                              fontSize: 11,
                              background: 'color-mix(in srgb, var(--portal-info) 12%, transparent)',
                              borderColor: 'color-mix(in srgb, var(--portal-info) 30%, transparent)',
                              color: 'var(--portal-info)',
                            }}
                          >
                            ✓ Đã kết thúc buổi
                          </span>
                        ) : (
                          <span className="badge badge-success" style={{ fontSize: 11 }}>
                            Sắp diễn ra
                          </span>
                        )}
                        {existingReview && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-star)' }}>
                            ⭐ Đã đánh giá ({existingReview.rating} sao)
                          </span>
                        )}
                      </div>
                      <p className="row-card__meta" style={{ margin: '3px 0 0' }}>
                        📅 Ngày <strong>{b.bookingDate}</strong> • ⏰ <strong>{b.startTime.slice(0, 5)} – {b.endTime.slice(0, 5)}</strong> • {b.paymentMethod === 'package_quota' ? '🎁 Quyền lợi gói tập' : `💳 Trả phí: ${formatPrice(b.hourlyRate)}`}
                      </p>
                      {b.notes && (
                        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--portal-muted, #71717a)', fontStyle: 'italic' }}>
                          Ghi chú: {b.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {isConfirmed && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      {/* Đánh giá HLV sau khi kết thúc buổi */}
                      {hasEnded ? (
                        !existingReview ? (
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            onClick={() => {
                              setReviewTargetBooking(b);
                              setReviewRating(5);
                              setReviewComment('');
                              setReviewAnonymous(false);
                            }}
                          >
                            ⭐ Đánh giá HLV
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--portal-muted, #71717a)' }}>
                            ✓ Đã gửi review
                          </span>
                        )
                      ) : (
                        <span
                          className="badge badge-neutral"
                          style={{
                            fontSize: 11,
                            color: 'var(--portal-muted, #71717a)',
                            padding: '4px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          title="Hệ thống sẽ mở đánh giá HLV sau khi buổi học kết thúc"
                        >
                          ⏳ Đánh giá sau khi kết thúc buổi
                        </span>
                      )}

                      {b.paymentMethod !== 'package_quota' && (
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => setPaymentModalBooking(b)}
                        >
                          Xem thông tin thanh toán
                        </button>
                      )}

                      {!hasEnded && (
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          style={{ color: 'var(--portal-danger)', borderColor: 'var(--portal-danger)' }}
                          onClick={() => setCancelTarget(b)}
                        >
                          Hủy lịch hẹn
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal Đánh giá Huấn luyện viên */}
      {reviewTargetBooking && (
        <Modal
          title={`Đánh giá Huấn luyện viên: ${formatCoachName(reviewTargetBooking.coachName)}`}
          onClose={() => setReviewTargetBooking(null)}
        >
          <div style={{ display: 'grid', gap: 16 }}>
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                background: 'var(--portal-raised, #f4f4f5)',
                color: 'var(--portal-paper, #202020)',
                fontSize: 13,
                border: '1px solid var(--portal-border, #e4e2de)',
              }}
            >
              Buổi tập 1:1 đã kết thúc ngày <strong>{reviewTargetBooking.bookingDate}</strong> ({reviewTargetBooking.startTime.slice(0, 5)} - {reviewTargetBooking.endTime.slice(0, 5)})
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--portal-paper, #202020)' }}>
                Mức độ hài lòng của bạn:
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewRating(star)}
                    style={{
                      border: '1px solid',
                      borderColor: star <= reviewRating ? 'var(--portal-star)' : 'var(--portal-border, #e4e2de)',
                      background: star <= reviewRating ? 'color-mix(in srgb, var(--portal-star) 15%, transparent)' : 'transparent',
                      borderRadius: 8,
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontSize: 18,
                    }}
                  >
                    {star <= reviewRating ? '⭐' : '☆'}
                  </button>
                ))}
                <span style={{ alignSelf: 'center', fontWeight: 700, fontSize: 14, color: 'var(--portal-star)', marginLeft: 8 }}>
                  {reviewRating === 5
                    ? 'Xuất sắc (5 sao)'
                    : reviewRating === 4
                    ? 'Rất tốt (4 sao)'
                    : reviewRating === 3
                    ? 'Bình thường (3 sao)'
                    : reviewRating === 2
                    ? 'Chưa hài lòng (2 sao)'
                    : 'Rất thất vọng (1 sao)'}
                </span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--portal-paper, #202020)' }}>
                Nhận xét chi tiết (Gửi tới Quản lý và Huấn luyện viên):
              </label>
              <textarea
                rows={4}
                className="portal-input"
                style={{ width: '100%', resize: 'vertical', color: 'var(--portal-paper, #202020)' }}
                placeholder="Chia sẻ về tác phong, chuyên môn, sự nhiệt tình hoặc điểm cần cải thiện của HLV..."
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--portal-paper, #202020)' }}>
              <input
                type="checkbox"
                checked={reviewAnonymous}
                onChange={(e) => setReviewAnonymous(e.target.checked)}
              />
              <span>Đánh giá ẩn danh (Không hiển thị họ tên của tôi với Huấn luyện viên)</span>
            </label>

            {hasNoPackage && <div role="alert" style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--portal-star) 45%, transparent)', background: 'color-mix(in srgb, var(--portal-star) 10%, transparent)', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><span>⚠️ <strong>Bạn chưa có gói tập đang hoạt động.</strong> Hội viên cần đăng ký và kích hoạt gói tập trước khi đặt lịch HLV 1:1.</span><button type="button" className="btn-primary btn-sm" onClick={() => navigate('/member/packages')}>Đăng ký gói tập</button></div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={reviewSubmitting}
                onClick={() => setReviewTargetBooking(null)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={reviewSubmitting}
                onClick={() => void handleConfirmReview()}
              >
                {reviewSubmitting ? 'Đang gửi…' : 'Gửi đánh giá'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Xác nhận Đặt lịch */}
      {modalSlot && selectedCoach && (
        <Modal
          title="Xác nhận Đặt lịch HLV 1:1 (PT riêng)"
          onClose={() => setModalSlot(null)}
        >
          <div style={{ display: 'grid', gap: 16 }}>
            <div
              style={{
                padding: 14,
                borderRadius: 12,
                background: 'var(--portal-raised, #f4f4f5)',
                display: 'grid',
                gap: 6,
              }}
            >
              <div>
                Huấn luyện viên: <strong>{selectedCoach.fullName}</strong> ({selectedCoach.specialization})
              </div>
              <div>
                Thời gian: <strong>{selectedDate}</strong> từ <strong>{modalSlot.startTime.slice(0, 5)} đến {modalSlot.endTime.slice(0, 5)}</strong>
              </div>
              <div>
                Chi phí buổi tập: <strong>{formatPrice(200000)} / buổi</strong>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                Phương thức thanh toán / Sử dụng quyền lợi:
              </label>
              <div style={{ display: 'grid', gap: 8 }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--portal-border, #e4e2de)',
                    cursor: hasRemainingQuota ? 'pointer' : 'not-allowed',
                    opacity: hasRemainingQuota ? 1 : 0.6,
                    background: paymentMethod === 'package_quota' ? 'color-mix(in srgb, var(--portal-salmon) 10%, transparent)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    disabled={!hasRemainingQuota}
                    checked={paymentMethod === 'package_quota'}
                    onChange={() => setPaymentMethod('package_quota')}
                  />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <strong>Sử dụng quyền lợi PT trong gói tập (Gold / Platinum)</strong>
                      {hasRemainingQuota ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-success, #226442)' }}>
                          (Còn {quotaStatus?.remainingQuota} lượt miễn phí)
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-danger)' }}>
                          (Hết lượt hoặc không áp dụng)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--portal-muted, #71717a)' }}>
                      {hasRemainingQuota
                        ? 'Tự động trừ 1 buổi tập PT trong hạn mức tháng của bạn (0 đ).'
                        : 'Gói hiện tại không có lượt PT miễn phí hoặc bạn đã dùng hết quota tháng. Vui lòng chọn đóng phí 200.000 đ.'}
                    </div>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--portal-border, #e4e2de)',
                    cursor: 'pointer',
                    background: paymentMethod === 'hourly_pay' ? 'color-mix(in srgb, var(--portal-salmon) 10%, transparent)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={paymentMethod === 'hourly_pay'}
                    onChange={() => setPaymentMethod('hourly_pay')}
                  />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <strong>Đăng ký trả phí theo giờ (200.000 đ / giờ)</strong>
                      {!hasRemainingQuota && !hasNoPackage && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-salmon, #ce9180)' }}>
                          (Khuyến nghị cho gói của bạn)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--portal-muted, #71717a)' }}>
                      Thanh toán tại quầy lễ tân hoặc chuyển khoản theo thông tin do lễ tân cung cấp.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Ghi chú cho HLV (Mục tiêu, tình trạng sức khỏe...):
              </label>
              <textarea
                rows={3}
                className="portal-input"
                placeholder="Ví dụ: Muốn tập trung cơ bụng và lưng, từng đau khớp gối nhẹ..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>

            {hasNoPackage && <div role="alert" style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--portal-star) 45%, transparent)', background: 'color-mix(in srgb, var(--portal-star) 10%, transparent)', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><span>⚠️ <strong>Bạn chưa có gói tập đang hoạt động.</strong> Hội viên cần đăng ký và kích hoạt gói tập trước khi đặt lịch HLV 1:1.</span><button type="button" className="btn-primary btn-sm" onClick={() => navigate('/member/packages')}>Đăng ký gói tập</button></div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={submitting}
                onClick={() => setModalSlot(null)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={submitting}
                onClick={() => void handleConfirmBooking()}
              >
                {submitting ? 'Đang xử lý…' : paymentMethod === 'hourly_pay' ? 'Xác nhận & Đến thanh toán' : 'Xác nhận Đặt lịch (0 đ)'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Hướng dẫn Thanh toán / VietQR */}
      {paymentModalBooking && (
        <Modal
          title="Thanh toán Buổi tập PT 1:1"
          onClose={() => setPaymentModalBooking(null)}
        >
          <div style={{ display: 'grid', gap: 16 }}>
            <div
              style={{
                padding: 14,
                borderRadius: 12,
                background: 'color-mix(in srgb, var(--portal-success) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--portal-success) 35%, transparent)',
              }}
            >
              <h4 style={{ margin: '0 0 6px', color: 'var(--portal-success, #226442)', fontSize: 15, fontWeight: 750 }}>
                ✓ Lịch tập 1:1 đã được ghi nhận thành công!
              </h4>
              <p style={{ margin: 0, fontSize: 13 }}>
                HLV: <strong>{formatCoachName(paymentModalBooking.coachName)}</strong> • Thời gian:{' '}
                <strong>{paymentModalBooking.bookingDate} ({paymentModalBooking.startTime.slice(0, 5)} - {paymentModalBooking.endTime.slice(0, 5)})</strong>
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: 16,
                alignItems: 'center',
                padding: 16,
                borderRadius: 12,
                background: 'var(--portal-raised, #f4f4f5)',
              }}
            >
              <div style={{ fontSize: 13, display: 'grid', gap: 6 }}>
                <div>Vui lòng liên hệ quầy Lễ tân để xác nhận thông tin và hoàn tất thanh toán.</div>
                <div>Số tiền cần thanh toán: <strong style={{ color: 'var(--portal-salmon, #ce9180)', fontSize: 16 }}>{formatPrice(paymentModalBooking.hourlyRate)}</strong></div>
                <div>Nội dung chuyển khoản: <strong style={{ color: 'var(--portal-salmon, #ce9180)' }}>PT{paymentModalBooking.id} {paymentModalBooking.memberName}</strong></div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--portal-muted, #71717a)' }}>
                  * Bạn cũng có thể thanh toán trực tiếp bằng tiền mặt hoặc thẻ tại quầy Lễ tân trước giờ tập.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPaymentModalBooking(null)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setPaymentModalBooking(null);
                  navigate('/member/invoices');
                }}
              >
                Xem Hóa đơn & Lịch sử thanh toán →
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Hủy lịch */}
      {cancelTarget && (
        <Modal
          title="Hủy lịch tập 1:1"
          onClose={() => setCancelTarget(null)}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <p>
              Bạn có chắc chắn muốn hủy lịch tập 1:1 với HLV <strong>{formatCoachName(cancelTarget.coachName)}</strong> vào{' '}
              <strong>{cancelTarget.startTime.slice(0, 5)} – {cancelTarget.endTime.slice(0, 5)} ngày {cancelTarget.bookingDate}</strong>?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={cancelling}
                onClick={() => setCancelTarget(null)}
              >
                Giữ lịch
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={cancelling}
                onClick={() => void handleConfirmCancel()}
              >
                {cancelling ? 'Đang hủy…' : 'Xác nhận Hủy'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
