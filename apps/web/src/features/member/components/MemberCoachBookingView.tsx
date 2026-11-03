import { VnpayPayButton } from '../../payments/VnpayPayButton';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../../shared/ui/Modal';
import { RecurrenceFields, RecurrenceSummary } from '../../../shared/ui/RecurrenceFields';
import { recurrenceRequest, type RecurrenceChoice } from '../../../shared/lib/recurrence';
import {
  getCoaches,
  getAvailableSlots,
  createCoachBooking,
  createRecurringCoachBooking,
  getMyCoachBookings,
  cancelCoachBooking,
  getMemberQuotaStatus,
  type CoachPublicDto,
  type CoachAvailableSlotDto,
  type CoachBookingDto,
  type CoachQuotaStatusDto,
  type CoachRecurringResult,
} from '../coachBookingApi';
import {
  createCoachReview,
  getMyCoachReviews,
  type CoachReviewDto,
} from '../../coaching/coachReviewApi';
import { coachIllustration } from '../../../shared/lib/coachIllustration';
import { formatPrice } from '../../../shared/lib/membershipPresentation';
import { notify } from '../../../shared/lib/portalNotices';
import { ApiError } from '../../../shared/api/client';
import { errorMessage } from '../../../shared/lib/errorMessage';
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
  return errorMessage(err, 'Không thể đặt lịch. Vui lòng thử lại.');
}

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function nextDays(count = 14): Array<{
  iso: string;
  dayName: string;
  dayNumber: string;
  monthText: string;
  label: string;
  isToday: boolean;
}> {
  const days: Array<{
    iso: string;
    dayName: string;
    dayNumber: string;
    monthText: string;
    label: string;
    isToday: boolean;
  }> = [];
  const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayName = dayNames[d.getDay()];
    const dayNumber = String(d.getDate()).padStart(2, '0');
    const monthText = `Tháng ${d.getMonth() + 1}`;
    days.push({
      iso,
      dayName,
      dayNumber,
      monthText,
      label: `${i === 0 ? 'Hôm nay' : dayName} (${dayNumber}/${String(d.getMonth() + 1).padStart(2, '0')})`,
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
  const [selectedSlot, setSelectedSlot] = useState<CoachAvailableSlotDto | null>(null);
  const [myBookings, setMyBookings] = useState<CoachBookingDto[]>([]);
  const [quotaStatus, setQuotaStatus] = useState<CoachQuotaStatusDto | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  // quotaStatus stays null while loading or when the request fails; only a loaded answer without a package means none.
  const hasNoPackage = quotaStatus !== null && !quotaStatus.packageName;
  const [myReviews, setMyReviews] = useState<CoachReviewDto[]>([]);

  const [loadingCoaches, setLoadingCoaches] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState('');

  // Booking Modal State
  const [modalSlot, setModalSlot] = useState<CoachAvailableSlotDto | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'package_quota' | 'hourly_pay'>('package_quota');
  const [notes, setNotes] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceChoice>({ period: 'once', days: [] });
  const [recurringOutcome, setRecurringOutcome] = useState<CoachRecurringResult | null>(null);

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

  // Load coaches, member bookings and reviews
  useEffect(() => {
    let active = true;
    async function init() {
      setLoadingCoaches(true);
      setError('');
      try {
        const [coachList, bookingsList, quota, reviews] = await Promise.all([
          getCoaches(),
          getMyCoachBookings(),
          getMemberQuotaStatus().catch(() => null),
          getMyCoachReviews().catch(() => []),
        ]);
        if (!active) return;
        setCoaches(coachList);
        setMyBookings(bookingsList);
        if (quota) setQuotaStatus(quota);
        setMyReviews(reviews);
        setSelectedCoachId((current) => current ?? coachList[0]?.id ?? null);
      } catch (err: unknown) {
        if (active) setError((errorMessage(err, 'Không thể tải danh sách huấn luyện viên.')));
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
      setSelectedSlot(null);
      try {
        const availableSlots = await getAvailableSlots(selectedCoachId!, selectedDate);
        if (active) setSlots(availableSlots);
      } catch (err: unknown) {
        if (active) setError((errorMessage(err, 'Không thể tải khung giờ trống.')));
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
    setRecurrence({ period: 'once', days: [] });
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
      const standing = recurrenceRequest(recurrence, selectedDate);
      if (standing) {
        const result = await createRecurringCoachBooking({
          coachId: selectedCoach.id,
          startDate: selectedDate,
          startTime: modalSlot.startTime,
          endTime: modalSlot.endTime,
          ...standing,
          paymentMethod: paymentMethod === 'package_quota' ? 'package_quota' : 'cash',
          notes: notes.trim() || undefined,
        });
        setModalSlot(null);
        setNotes('');
        setRecurringOutcome(result);
        const [updatedSlots, updatedBookings, updatedQuota] = await Promise.all([
          getAvailableSlots(selectedCoach.id, selectedDate),
          getMyCoachBookings(),
          getMemberQuotaStatus().catch(() => null),
        ]);
        setSlots(updatedSlots);
        setMyBookings(updatedBookings);
        if (updatedQuota) setQuotaStatus(updatedQuota);
        if (result.booked.length) onBookingSuccess?.();
        return;
      }
      const created = await createCoachBooking({
        coachId: selectedCoach.id,
        bookingDate: selectedDate,
        startTime: modalSlot.startTime,
        endTime: modalSlot.endTime,
        paymentMethod: paymentMethod === 'package_quota' ? 'package_quota' : 'cash',
        notes: notes.trim() || undefined,
      });

      setModalSlot(null);
      setSelectedSlot(null);
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

      const updatedReviews = await getMyCoachReviews().catch(() => []);
      setMyReviews(updatedReviews);

      notify(`Cảm ơn bạn! Đã gửi đánh giá ${reviewRating} sao cho HLV ${formatCoachName(reviewTargetBooking.coachName)} thành công.`, 'success');
      setReviewTargetBooking(null);
      setReviewComment('');
    } catch (err: unknown) {
      const errMsg = errorMessage(err, 'Không thể gửi đánh giá.');
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
      setError((errorMessage(err, 'Không thể hủy lịch.')));
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
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', minWidth: 0, gap: 24 }}>

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

      {/* Quota Info Banner */}
      <div
        className="portal-card"
        style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--portal-salmon) 12%, transparent) 0%, color-mix(in srgb, var(--portal-salmon) 3%, transparent) 100%)',
          borderColor: 'color-mix(in srgb, var(--portal-salmon) 35%, transparent)',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
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
            Chọn Huấn luyện viên cá nhân (PT 1:1)
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
                  src={c.avatarUrl || coachIllustration(c.specialization, c.fullName)}
                  alt={c.fullName}
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    flexShrink: 0,
                    border: '2px solid var(--portal-border-strong)',
                  }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.fullName}
                    </h4>
                    {isSelected && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-salmon, #ce9180)' }}>
                        Đang chọn
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

      {/* Chọn ngày và khung giờ */}
      {(() => {
        const morningSlots = slots.filter((s) => {
          const h = parseInt(s.startTime.split(':')[0], 10);
          return h < 12;
        });
        const afternoonSlots = slots.filter((s) => {
          const h = parseInt(s.startTime.split(':')[0], 10);
          return h >= 12 && h < 18;
        });
        const eveningSlots = slots.filter((s) => {
          const h = parseInt(s.startTime.split(':')[0], 10);
          return h >= 18;
        });

        const renderSlotPill = (slot: CoachAvailableSlotDto) => {
          const startFmt = slot.startTime.slice(0, 5);
          const endFmt = slot.endTime.slice(0, 5);
          const isSelected = selectedSlot?.startTime === slot.startTime;

          if (slot.available) {
            return (
              <button
                key={slot.startTime}
                type="button"
                onClick={() => {
                  setSelectedSlot(slot);
                  handleOpenBookingModal(slot);
                }}
                style={{
                  minWidth: 70,
                  padding: '9px 18px',
                  borderRadius: 12,
                  fontSize: 15,
                  fontWeight: isSelected ? 750 : 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  transition: 'all 160ms ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: isSelected ? '1px solid transparent' : '1px solid var(--portal-border, #e5e0db)',
                  background: isSelected
                    ? 'linear-gradient(155deg, #5c351c 0%, #3a2012 100%)'
                    : 'var(--portal-surface, #ffffff)',
                  color: isSelected ? '#ffffff' : 'var(--portal-paper, #201b17)',
                  boxShadow: isSelected
                    ? '0 4px 12px rgba(78, 45, 25, 0.32)'
                    : '0 1px 3px rgba(0, 0, 0, 0.04)',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--portal-salmon) 50%, transparent)';
                    e.currentTarget.style.background = 'color-mix(in srgb, var(--portal-salmon) 8%, var(--portal-surface, #ffffff))';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.borderColor = 'var(--portal-border, #e5e0db)';
                    e.currentTarget.style.background = 'var(--portal-surface, #ffffff)';
                  }
                }}
                title={`Còn trống: ${startFmt} – ${endFmt} (Nhấn để đặt lịch)`}
              >
                {startFmt}
              </button>
            );
          }

          let badgeText = 'Đã kín lịch';
          if (slot.reason === 'coach_on_leave') {
            badgeText = 'HLV nghỉ phép';
          } else if (slot.reason === 'too_soon') {
            badgeText = 'Cần đặt trước 2 tiếng';
          } else if (slot.reason === 'coach_busy') {
            badgeText = 'HLV đã có lịch';
          } else if (slot.reason === 'member_busy') {
            badgeText = 'Bạn đã có lịch trùng';
          }

          return (
            <div
              key={slot.startTime}
              style={{
                minWidth: 70,
                padding: '9px 18px',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--portal-border, #e5e0db)',
                background: 'var(--portal-raised, #f5f2ee)',
                color: 'var(--portal-muted, #9c948c)',
                opacity: 0.5,
                cursor: 'not-allowed',
              }}
              title={`${startFmt} – ${endFmt} (${badgeText})`}
            >
              {startFmt}
            </div>
          );
        };

        return (
          <section
            className="portal-card"
            style={{
              padding: '24px 24px',
              borderRadius: 20,
              background: 'var(--portal-surface, #ffffff)',
              border: '1px solid var(--portal-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 22,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--portal-paper)' }}>
                Chọn ngày và khung giờ
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span className="row-card__meta" style={{ fontSize: 13, color: 'var(--portal-star)' }}>
                  Quy tắc: Đặt trước <strong>2 tiếng</strong>
                </span>
                {selectedCoach && (
                  <span className="row-card__meta" style={{ fontSize: 13 }}>
                    HLV: <strong>{selectedCoach.fullName}</strong>
                  </span>
                )}
              </div>
            </div>

            {/* Calendar Day Cards Row */}
            <div>
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  overflowX: 'auto',
                  padding: '4px 2px 14px',
                  WebkitOverflowScrolling: 'touch',
                  scrollbarWidth: 'thin',
                }}
              >
                {daysList.map((d) => {
                  const isSelected = d.iso === selectedDate;
                  return (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => {
                        setSelectedDate(d.iso);
                        setSelectedSlot(null);
                        setError('');
                      }}
                      style={{
                        minWidth: 70,
                        width: 72,
                        height: 96,
                        padding: '12px 6px',
                        borderRadius: 16,
                        border: isSelected
                          ? '1px solid transparent'
                          : '1px solid var(--portal-border, #e5e0db)',
                        background: isSelected
                          ? 'linear-gradient(155deg, #5c351c 0%, #3a2012 100%)'
                          : 'var(--portal-surface, #ffffff)',
                        color: isSelected ? '#ffffff' : 'var(--portal-paper, #201b17)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 3,
                        cursor: 'pointer',
                        flexShrink: 0,
                        boxShadow: isSelected
                          ? '0 6px 16px rgba(78, 45, 25, 0.32)'
                          : '0 1px 3px rgba(0, 0, 0, 0.04)',
                        transition: 'all 180ms ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--portal-salmon) 50%, transparent)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.borderColor = 'var(--portal-border, #e5e0db)';
                        }
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: isSelected ? 'rgba(255, 255, 255, 0.85)' : 'var(--portal-muted, #736b63)',
                          lineHeight: 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {d.dayName}
                        {d.isToday && (
                          <span
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: '50%',
                              background: isSelected ? '#ffffff' : 'var(--portal-salmon)',
                            }}
                            title="Hôm nay"
                          />
                        )}
                      </span>
                      <span
                        style={{
                          fontSize: 24,
                          fontWeight: 800,
                          color: isSelected ? '#ffffff' : 'var(--portal-paper, #201b17)',
                          lineHeight: 1.1,
                        }}
                      >
                        {d.dayNumber}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: isSelected ? 'rgba(255, 255, 255, 0.8)' : 'var(--portal-muted, #8a8279)',
                          lineHeight: 1,
                        }}
                      >
                        {d.monthText}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Slots Grouped by Time of Day */}
            {loadingSlots ? (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <p className="row-card__meta" style={{ margin: 0 }}>
                  Đang kiểm tra lịch trống của huấn luyện viên...
                </p>
              </div>
            ) : slots.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <p className="row-card__meta" style={{ margin: 0 }}>
                  Huấn luyện viên không có khung giờ nào trong ngày này. Vui lòng chọn ngày khác!
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {morningSlots.length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 750, color: 'var(--portal-paper, #201b17)' }}>
                      Buổi sáng
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {morningSlots.map(renderSlotPill)}
                    </div>
                  </div>
                )}

                {afternoonSlots.length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 750, color: 'var(--portal-paper, #201b17)' }}>
                      Buổi chiều
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {afternoonSlots.map(renderSlotPill)}
                    </div>
                  </div>
                )}

                {eveningSlots.length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 750, color: 'var(--portal-paper, #201b17)' }}>
                      Buổi tối
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {eveningSlots.map(renderSlotPill)}
                    </div>
                  </div>
                )}

                {/* Selected Slot Summary Action */}
                {selectedSlot && (
                  <div
                    style={{
                      marginTop: 6,
                      padding: '14px 18px',
                      borderRadius: 14,
                      background: 'linear-gradient(135deg, color-mix(in srgb, var(--portal-salmon) 12%, transparent) 0%, color-mix(in srgb, var(--portal-salmon) 4%, transparent) 100%)',
                      border: '1px solid color-mix(in srgb, var(--portal-salmon) 35%, transparent)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: 'var(--portal-salmon)',
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />
                      <div>
                        <span style={{ fontSize: 13, color: 'var(--portal-muted)' }}>Khung giờ đã chọn: </span>
                        <strong style={{ fontSize: 15, color: 'var(--portal-paper)' }}>
                          {selectedSlot.startTime.slice(0, 5)} – {selectedSlot.endTime.slice(0, 5)}
                        </strong>
                        <span style={{ fontSize: 13, color: 'var(--portal-muted)' }}>
                          {` (${selectedDate} • HLV ${selectedCoach?.fullName})`}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{
                        padding: '8px 22px',
                        borderRadius: 99,
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                      onClick={() => handleOpenBookingModal(selectedSlot)}
                    >
                      Tiến hành đặt lịch
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })()}

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
                  <div style={{ display: 'flex', flexWrap: 'wrap', minWidth: 0, gap: 14, alignItems: 'center' }}>
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
                            Đã kết thúc buổi
                          </span>
                        ) : (
                          <span className="badge badge-success" style={{ fontSize: 11 }}>
                            Sắp diễn ra
                          </span>
                        )}
                        {existingReview && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-star)' }}>
                            Đã đánh giá ({existingReview.rating} sao)
                          </span>
                        )}
                      </div>
                      <p className="row-card__meta" style={{ margin: '3px 0 0' }}>
                        Ngày <strong>{b.bookingDate}</strong> • <strong>{b.startTime.slice(0, 5)} – {b.endTime.slice(0, 5)}</strong> • {b.paymentMethod === 'package_quota' ? 'Quyền lợi gói tập' : `Trả phí: ${formatPrice(b.hourlyRate)}`}
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
                            Đánh giá HLV
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--portal-muted, #71717a)' }}>
                            Đã gửi review
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
                          Đánh giá sau khi kết thúc buổi
                        </span>
                      )}

                      {b.paymentMethod !== 'package_quota' && b.paymentStatus === 'pending' && <VnpayPayButton target={{ coachBookingId: b.id }} />}
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

            {hasNoPackage && <div role="alert" style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--portal-star) 45%, transparent)', background: 'color-mix(in srgb, var(--portal-star) 10%, transparent)', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><span><strong>Bạn chưa có gói tập đang hoạt động.</strong> Hội viên cần đăng ký và kích hoạt gói tập trước khi đặt lịch HLV 1:1.</span><button type="button" className="btn-primary btn-sm" onClick={() => navigate('/member/packages')}>Đăng ký gói tập</button></div>}
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
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'color-mix(in srgb, var(--portal-salmon) 20%, #f5e8df)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60381e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                  <circle cx="8" cy="14" r="1.2" fill="#60381e"></circle>
                  <circle cx="12" cy="14" r="1.2" fill="#60381e"></circle>
                  <circle cx="16" cy="14" r="1.2" fill="#60381e"></circle>
                  <circle cx="8" cy="18" r="1.2" fill="#60381e"></circle>
                  <circle cx="12" cy="18" r="1.2" fill="#60381e"></circle>
                  <circle cx="16" cy="18" r="1.2" fill="#60381e"></circle>
                </svg>
              </span>
              <span style={{ fontSize: 22, fontWeight: 750, color: 'var(--portal-paper, #201b17)', fontFamily: 'inherit' }}>
                Xác nhận đặt lịch
              </span>
            </span>
          }
          onClose={() => setModalSlot(null)}
        >
          <div style={{ display: 'grid', gap: 18 }}>
            {/* Coach & Session Info Card */}
            <div
              style={{
                padding: '16px 20px',
                borderRadius: 18,
                background: 'color-mix(in srgb, var(--portal-salmon) 6%, var(--portal-surface, #ffffff))',
                border: '1px solid color-mix(in srgb, var(--portal-salmon) 22%, var(--portal-border, #e5dbd2))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              {/* Coach */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 200, flex: '1 1 auto' }}>
                <div style={{ position: 'relative', width: 62, height: 62, flexShrink: 0 }}>
                  <img
                    src={selectedCoach.avatarUrl || coachIllustration(selectedCoach.specialization, selectedCoach.fullName)}
                    alt={selectedCoach.fullName}
                    style={{
                      width: 62,
                      height: 62,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid #ffffff',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: '#5c351c',
                      border: '2px solid #ffffff',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 900,
                    }}
                  >
                    ✓
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--portal-muted, #8c827a)', marginBottom: 2 }}>
                    Huấn luyện viên
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 750, color: 'var(--portal-paper, #201b17)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedCoach.fullName}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--portal-muted, #8c827a)' }}>
                    {selectedCoach.specialization || 'Fitness & Cardio'}
                  </div>
                </div>
              </div>

              {/* Time */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 140, flex: '1 1 auto' }}>
                <span style={{ color: '#8c5b3e', marginTop: 2, flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </span>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--portal-muted, #8c827a)', marginBottom: 2 }}>
                    Thời gian
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-paper, #201b17)' }}>
                    {selectedDate}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-paper, #201b17)' }}>
                    {modalSlot.startTime.slice(0, 5)} – {modalSlot.endTime.slice(0, 5)}
                  </div>
                </div>
              </div>

              {/* Cost */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 140, flex: '1 1 auto' }}>
                <span style={{ color: '#8c5b3e', marginTop: 2, flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9"></circle>
                    <path d="M14.5 9a2.5 2.5 0 0 0-5 0c0 4 5 2 5 6a2.5 2.5 0 0 1-5 0"></path>
                    <line x1="12" y1="6" x2="12" y2="8"></line>
                    <line x1="12" y1="16" x2="12" y2="18"></line>
                  </svg>
                </span>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--portal-muted, #8c827a)', marginBottom: 2 }}>
                    Chi phí buổi tập
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 750, color: 'var(--portal-paper, #201b17)' }}>
                    {formatPrice(selectedCoach.defaultHourlyRate || 200000)} / buổi
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Method Section */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 12 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60381e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                  <line x1="1" y1="10" x2="23" y2="10"></line>
                </svg>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: 'var(--portal-paper, #201b17)' }}>
                  Phương thức thanh toán
                </h4>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                {/* Option 1: Gói tập */}
                <div
                  onClick={() => hasRemainingQuota && setPaymentMethod('package_quota')}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '14px 16px',
                    borderRadius: 14,
                    border: paymentMethod === 'package_quota'
                      ? '1.5px solid #60381e'
                      : '1px solid var(--portal-border, #e7ded5)',
                    background: paymentMethod === 'package_quota'
                      ? 'color-mix(in srgb, var(--portal-salmon) 8%, var(--portal-surface, #ffffff))'
                      : 'var(--portal-surface, #ffffff)',
                    cursor: hasRemainingQuota ? 'pointer' : 'not-allowed',
                    opacity: hasRemainingQuota ? 1 : 0.7,
                    transition: 'all 160ms ease',
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border: paymentMethod === 'package_quota' ? '2px solid #60381e' : '2px solid var(--portal-border, #c4b9af)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {paymentMethod === 'package_quota' && (
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#60381e' }} />
                    )}
                  </div>

                  <span style={{ color: '#60381e', marginTop: 2, flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                      <line x1="1" y1="10" x2="23" y2="10"></line>
                    </svg>
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 14, color: 'var(--portal-paper, #201b17)' }}>
                        Sử dụng quyền lợi PT trong gói tập (Gold / Platinum)
                      </strong>
                      {hasRemainingQuota ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: 'var(--portal-success, #226442)',
                            background: 'color-mix(in srgb, var(--portal-success) 12%, transparent)',
                            padding: '2px 8px',
                            borderRadius: 99,
                          }}
                        >
                          (Còn {quotaStatus?.remainingQuota} lượt miễn phí)
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#a45338',
                            background: '#f8eee7',
                            padding: '2px 8px',
                            borderRadius: 99,
                          }}
                        >
                          (Hết lượt hoặc không áp dụng)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--portal-muted, #71717a)', marginTop: 4, lineHeight: 1.4 }}>
                      {hasRemainingQuota
                        ? 'Tự động trừ 1 buổi tập PT trong hạn mức tháng của bạn (0 đ).'
                        : 'Gói hiện tại không có lượt PT miễn phí hoặc bạn đã dùng hết quota tháng. Vui lòng chọn đóng phí ' + formatPrice(selectedCoach.defaultHourlyRate || 200000) + '.'}
                    </div>
                  </div>
                </div>

                {/* Option 2: Trả phí theo giờ */}
                <div
                  onClick={() => setPaymentMethod('hourly_pay')}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '14px 16px',
                    borderRadius: 14,
                    border: paymentMethod === 'hourly_pay'
                      ? '1.5px solid #60381e'
                      : '1px solid var(--portal-border, #e7ded5)',
                    background: paymentMethod === 'hourly_pay'
                      ? 'color-mix(in srgb, var(--portal-salmon) 8%, var(--portal-surface, #ffffff))'
                      : 'var(--portal-surface, #ffffff)',
                    cursor: 'pointer',
                    transition: 'all 160ms ease',
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border: paymentMethod === 'hourly_pay' ? '2px solid #60381e' : '2px solid var(--portal-border, #c4b9af)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {paymentMethod === 'hourly_pay' && (
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#60381e' }} />
                    )}
                  </div>

                  <span style={{ color: '#60381e', marginTop: 2, flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 12 20 22 4 22 4 12"></polyline>
                      <rect x="2" y="7" width="20" height="5"></rect>
                      <line x1="12" y1="22" x2="12" y2="7"></line>
                      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path>
                      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>
                    </svg>
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 14, color: 'var(--portal-paper, #201b17)' }}>
                        Đăng ký trả phí theo giờ ({formatPrice(selectedCoach.defaultHourlyRate || 200000)} / giờ)
                      </strong>
                      {!hasRemainingQuota && !hasNoPackage && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#a45338',
                            background: '#f8eee7',
                            padding: '2px 8px',
                            borderRadius: 99,
                          }}
                        >
                          (Khuyến nghị cho gói của bạn)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--portal-muted, #71717a)', marginTop: 4, lineHeight: 1.4 }}>
                      Thanh toán tại quầy lễ tân hoặc chuyển khoản theo thông tin do lễ tân cung cấp.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recurrence Option (collapsible) */}
            <details style={{ cursor: 'pointer' }}>
              <summary style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-muted, #8c827a)' }}>
                Tùy chọn đặt lịch định kỳ (lặp lại hàng tuần/tháng)
              </summary>
              <div style={{ marginTop: 10 }}>
                <RecurrenceFields
                  startDate={selectedDate}
                  value={recurrence}
                  onChange={setRecurrence}
                  disabled={submitting}
                  hint="Hệ thống sẽ tự động gia hạn lịch tập vào cùng ngày này mỗi tháng. Bạn có thể hủy hoặc thay đổi lịch tập bất cứ lúc nào."
                />
              </div>
            </details>

            {/* Notes Section */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60381e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                </svg>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: 'var(--portal-paper, #201b17)' }}>
                  Ghi chú
                </h4>
              </div>
              <div
                style={{
                  position: 'relative',
                  borderRadius: 14,
                  border: '1px solid var(--portal-border, #e2dad2)',
                  background: 'color-mix(in srgb, var(--portal-salmon) 4%, var(--portal-surface, #ffffff))',
                  padding: '12px 14px 28px',
                }}
              >
                <textarea
                  rows={3}
                  placeholder="Ví dụ: Muốn tập trung cơ bụng và lưng, từng đau khớp gối nhẹ..."
                  value={notes}
                  maxLength={200}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{
                    width: '100%',
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    resize: 'none',
                    fontFamily: 'inherit',
                    fontSize: 14,
                    color: 'var(--portal-paper, #201b17)',
                    lineHeight: 1.5,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 8,
                    right: 14,
                    fontSize: 12,
                    color: 'var(--portal-muted, #a89f97)',
                    fontWeight: 500,
                  }}
                >
                  {notes.length}/200
                </div>
              </div>
            </div>

            {hasNoPackage && (
              <div role="alert" style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--portal-star) 45%, transparent)', background: 'color-mix(in srgb, var(--portal-star) 10%, transparent)', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span><strong>Bạn chưa có gói tập đang hoạt động.</strong> Hội viên cần đăng ký và kích hoạt gói tập trước khi đặt lịch HLV 1:1.</span>
                <button type="button" className="btn-primary btn-sm" onClick={() => navigate('/member/packages')}>Đăng ký gói tập</button>
              </div>
            )}

            {/* Footer Action Buttons */}
            <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setModalSlot(null)}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 9999,
                  border: '1.5px solid #60381e',
                  background: 'transparent',
                  color: 'var(--portal-paper, #201b17)',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 160ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'color-mix(in srgb, var(--portal-salmon) 10%, transparent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleConfirmBooking()}
                style={{
                  flex: 1.4,
                  height: 48,
                  borderRadius: 9999,
                  border: 'none',
                  background: 'linear-gradient(155deg, #6c3f21 0%, #4a2612 100%)',
                  color: '#ffffff',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: submitting ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontFamily: 'inherit',
                  boxShadow: '0 4px 14px rgba(78, 45, 25, 0.32)',
                  transition: 'all 160ms ease',
                  opacity: submitting ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!submitting) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 18px rgba(78, 45, 25, 0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!submitting) {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 4px 14px rgba(78, 45, 25, 0.32)';
                  }
                }}
              >
                <span>
                  {submitting
                    ? 'Đang xử lý…'
                    : recurrence.period !== 'once'
                      ? 'Xác nhận đặt định kỳ'
                      : 'Xác nhận & Đặt lịch'}
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {recurringOutcome && (
        <Modal title="Kết quả đặt lịch 1:1 định kỳ" onClose={() => setRecurringOutcome(null)}>
          <RecurrenceSummary
            booked={recurringOutcome.booked}
            skipped={recurringOutcome.skipped}
            describe={(b) => `${b.bookingDate} · ${b.startTime.slice(0, 5)}–${b.endTime.slice(0, 5)} · HLV ${formatCoachName(b.coachName)}`}
          />
          {recurringOutcome.booked.some((b) => b.paymentMethod !== 'package_quota') && (
            <p className="muted">Các buổi trả phí theo giờ cần được thanh toán tại quầy lễ tân.</p>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="btn-primary" onClick={() => setRecurringOutcome(null)}>Đóng</button>
          </div>
        </Modal>
      )}

      {/* Modal Hướng dẫn Thanh toán / VietQR */}
      {paymentModalBooking && (
        <Modal
          title="Thanh toán Buổi tập PT 1:1"
          onClose={() => setPaymentModalBooking(null)}
        >
          <VnpayPayButton target={{ coachBookingId: paymentModalBooking.id }} />
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
                Lịch tập 1:1 đã được ghi nhận thành công!
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
