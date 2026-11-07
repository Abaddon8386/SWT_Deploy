import { memberMessage, memberError, memberText, memberRenderMessage, memberNotify } from '../memberI18n';
import type { SourceMessage } from '../../../shared/i18n/language';
import { useLanguage } from '../../../shared/i18n/language';
import { VnpayPayButton } from '../../payments/VnpayPayButton';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../../shared/ui/Modal';
import { RecurrenceFields, RecurrenceSummary } from '../../../shared/ui/RecurrenceFields';
import { expandRecurrence, recurrenceRequest, type RecurrenceChoice } from '../../../shared/lib/recurrence';
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
import {
  formatCoachName,
  isSessionCompleted,
  COACH_FILTER_DISCIPLINES,
  matchesCoachDiscipline,
  type CoachDisciplineFilter,
} from '../coachBookingUtils';

function coachBookingErrorMessage(err: unknown): string | SourceMessage {
  if (err instanceof ApiError) {
    if (err.code === 'MEMBERSHIP_INACTIVE_OR_EXPIRED') {
      return memberMessage('Bạn chưa có gói tập đang hoạt động (hoặc gói tập không còn hiệu lực vào ngày đặt lịch). Vui lòng đăng ký hoặc kích hoạt gói tập trước khi đặt lịch HLV 1:1.');
    }
    if (err.code === 'COACH_BOOKING_PACKAGE_NO_QUOTA') {
      return memberMessage('Gói tập hiện tại không bao gồm lượt tập PT 1:1 miễn phí. Vui lòng chọn hình thức thanh toán theo giờ.');
    }
    if (err.code === 'COACH_BOOKING_QUOTA_EXCEEDED') {
      return memberMessage('Bạn đã sử dụng hết lượt tập PT 1:1 miễn phí trong tháng này của gói tập. Vui lòng chọn thanh toán theo giờ.');
    }
    return err.message;
  }
  return memberError(err, 'Không thể đặt lịch. Vui lòng thử lại.');
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
    const dayName = memberText(dayNames[d.getDay()], ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]);
    const dayNumber = String(d.getDate()).padStart(2, '0');
    const monthText = memberText(`Tháng ${d.getMonth() + 1}`, `Month ${d.getMonth() + 1}`);
    days.push({
      iso,
      dayName,
      dayNumber,
      monthText,
      label: `${i === 0 ? memberText('Hôm nay') : dayName} (${dayNumber}/${String(d.getMonth() + 1).padStart(2, '0')})`,
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
  useLanguage();
  const navigate = useNavigate();
  const [coaches, setCoaches] = useState<CoachPublicDto[]>([]);
  const [coachDiscipline, setCoachDiscipline] = useState<CoachDisciplineFilter>('ALL');
  const [selectedCoachId, setSelectedCoachId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(localToday());
  const [slots, setSlots] = useState<CoachAvailableSlotDto[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<CoachAvailableSlotDto | null>(null);
  const [myBookings, setMyBookings] = useState<CoachBookingDto[]>([]);
  const [quotaStatus, setQuotaStatus] = useState<CoachQuotaStatusDto | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined | SourceMessage>();
  // quotaStatus stays null while loading or when the request fails; only a loaded answer without a package means none.
  const hasNoPackage = quotaStatus !== null && !quotaStatus.packageName;
  const isTrial = Boolean(
    quotaStatus &&
    (quotaStatus.monthlyQuota === 1 ||
     (quotaStatus.packageName && (
       quotaStatus.packageName.includes('Trải Nghiệm') ||
       quotaStatus.packageName.toUpperCase().includes('TRIAL')
     )))
  );
  const displayedPackageName = isTrial
    ? 'Gói Trải Nghiệm 3 Ngày'
    : (quotaStatus?.packageName || 'Gold / Platinum');
  const [myReviews, setMyReviews] = useState<CoachReviewDto[]>([]);

  const [loadingCoaches, setLoadingCoaches] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState<string | SourceMessage>('');

  // Booking Modal State
  const [modalSlot, setModalSlot] = useState<CoachAvailableSlotDto | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'package_quota' | 'hourly_pay'>('package_quota');
  const [notes, setNotes] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceChoice>({ period: 'once', days: [] });
  const [recurringOutcome, setRecurringOutcome] = useState<CoachRecurringResult | null>(null);

  const slotDate = expandRecurrence(selectedDate, recurrence)[0] ?? selectedDate;

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
        if (active) setError((memberError(err, 'Không thể tải danh sách huấn luyện viên.')));
      } finally {
        if (active) setLoadingCoaches(false);
      }
    }
    void init();
    return () => { active = false; };
  }, []);

  // Load slots when coach or date changes
  useEffect(() => {
    if (!selectedCoachId || !slotDate) return;
    let active = true;
    async function loadSlots() {
      setLoadingSlots(true);
      setSlots([]);
      setSelectedSlot(null);
      try {
        const availableSlots = await getAvailableSlots(selectedCoachId!, slotDate);
        if (active) setSlots(availableSlots);
      } catch (err: unknown) {
        if (active) setError((memberError(err, 'Không thể tải khung giờ trống.')));
      } finally {
        if (active) setLoadingSlots(false);
      }
    }
    void loadSlots();
    return () => { active = false; };
  }, [selectedCoachId, slotDate]);

  const selectedCoach = coaches.find((c) => c.id === selectedCoachId);
  const filteredCoaches = coaches.filter((c) => matchesCoachDiscipline(c, coachDiscipline));

  function handleFilterCoachDiscipline(discipline: CoachDisciplineFilter) {
    setCoachDiscipline(discipline);
    const nextFiltered = coaches.filter((c) => matchesCoachDiscipline(c, discipline));
    if (nextFiltered.length > 0) {
      if (!nextFiltered.some((c) => c.id === selectedCoachId)) {
        setSelectedCoachId(nextFiltered[0].id);
        setError('');
      }
    } else {
      setSelectedCoachId(null);
    }
  }

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
          getAvailableSlots(selectedCoach.id, slotDate),
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
        bookingDate: slotDate,
        startTime: modalSlot.startTime,
        endTime: modalSlot.endTime,
        paymentMethod: paymentMethod === 'package_quota' ? 'package_quota' : 'cash',
        notes: notes.trim() || undefined,
      });

      setModalSlot(null);
      setSelectedSlot(null);
      setNotes('');

      const [updatedSlots, updatedBookings, updatedQuota] = await Promise.all([
        getAvailableSlots(selectedCoach.id, slotDate),
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
        memberNotify(
          memberMessage(`Đặt lịch tập 1:1 với HLV ${formatCoachName(created.coachName)} ngày ${created.bookingDate} (${created.startTime.slice(0, 5)} - ${created.endTime.slice(0, 5)}) thành công (đã trừ 1 lượt quyền lợi gói)!`, `1:1 session booked with coach ${formatCoachName(created.coachName)} on ${created.bookingDate} (${created.startTime.slice(0, 5)} - ${created.endTime.slice(0, 5)}) using 1 membership session!`)
          , 'success', { record: true });
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

      memberNotify(memberMessage(`Cảm ơn bạn! Đã gửi đánh giá ${reviewRating} sao cho HLV ${formatCoachName(reviewTargetBooking.coachName)} thành công.`, `Thank you! Your ${reviewRating}-star review for coach ${formatCoachName(reviewTargetBooking.coachName)} was submitted.`), 'success');
      setReviewTargetBooking(null);
      setReviewComment('');
    } catch (err: unknown) {
      const errMsg = memberError(err, 'Không thể gửi đánh giá.');
      setError(errMsg);
      notify(memberRenderMessage(errMsg), 'error', typeof errMsg === 'string' ? {} : { translation: errMsg });
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function handleConfirmCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await cancelCoachBooking(cancelTarget.id, 'Hội viên chủ động hủy');
      memberNotify(memberMessage(`Đã hủy lịch tập 1:1 với HLV ${formatCoachName(cancelTarget.coachName)} thành công.`, `Your 1:1 session with coach ${formatCoachName(cancelTarget.coachName)} was cancelled.`), 'success');
      setCancelTarget(null);

      if (selectedCoachId) {
        const [updatedSlots, updatedBookings, updatedQuota] = await Promise.all([
          getAvailableSlots(selectedCoachId, slotDate),
          getMyCoachBookings(),
          getMemberQuotaStatus().catch(() => null),
        ]);
        setSlots(updatedSlots);
        setMyBookings(updatedBookings);
        if (updatedQuota) setQuotaStatus(updatedQuota);
      }
    } catch (err: unknown) {
      setError((memberError(err, 'Không thể hủy lịch.')));
    } finally {
      setCancelling(false);
    }
  }

  if (loadingCoaches) {
    return (
      <div className="portal-card" style={{ padding: 32, textAlign: 'center' }}>
        <p className="row-card__meta">{memberText("Đang tải thông tin Huấn luyện viên và khung giờ trống...")}</p>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}><strong style={{ color: 'var(--portal-danger)' }}>{memberRenderMessage(error)}</strong>{errorCode === 'MEMBERSHIP_INACTIVE_OR_EXPIRED' && <button type="button" className="btn-primary btn-sm" onClick={() => navigate('/member/packages')} style={{ padding: '4px 10px', fontSize: 12 }}>{memberText("Đăng ký / Kích hoạt gói tập")}</button>}</div>
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
                background: 'var(--portal-salmon)',
                color: 'var(--portal-on-accent)',
              }}
            >
              {memberText("Gói: ")}{quotaStatus?.packageName || memberText("Chưa có gói")}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              {memberText("Chính sách Huấn luyện viên cá nhân (PT 1:1)")}</span>
          </div>

          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--portal-muted)' }}>
            {isTrial ? (
              <>
                <strong>{displayedPackageName}</strong>{memberText(" bao gồm đặc quyền ")}<strong>{memberText("01 buổi tập HLV 1:1 miễn phí")}</strong> {memberText(" duy nhất trong suốt thời gian trải nghiệm.")}{quotaStatus && (
                  <>
                    {' '}{memberText("Bạn đã dùng ")}<strong>{quotaStatus.usedThisMonth}{memberText(" lượt")}</strong>{memberText(" (còn lại:")}{' '}
                    <strong style={{ color: quotaStatus.remainingQuota > 0 ? 'var(--portal-salmon)' : 'var(--portal-danger)' }}>
                      {quotaStatus.remainingQuota}{memberText(" lượt")}</strong>).
                  </>
                )}
                {quotaStatus && quotaStatus.remainingQuota <= 0 && memberText(" Khi đã sử dụng hết buổi trải nghiệm 1:1, bạn có thể đăng ký thêm HLV theo giờ (200.000 đ / giờ).")}
              </>
            ) : quotaStatus?.monthlyQuota && quotaStatus.monthlyQuota > 0 ? (
              <>
                {memberText("Gói ")}{displayedPackageName}{memberText(" được tặng ")}<strong>{quotaStatus.monthlyQuota}{memberText(" lượt PT miễn phí/tháng")}</strong>{memberText(". Tháng này bạn đã dùng ")}<strong>{quotaStatus.usedThisMonth}{memberText(" lượt")}</strong>{memberText(" (còn lại:")}{' '}
                <strong style={{ color: quotaStatus.remainingQuota > 0 ? 'var(--portal-salmon)' : 'var(--portal-danger)' }}>
                  {quotaStatus.remainingQuota}{memberText(" lượt")}</strong>
                ).
                {quotaStatus.remainingQuota <= 0 && memberText(" Khi hết lượt miễn phí, phí đăng ký thêm là 200.000 đ / giờ.")}
              </>
            ) : (
              <>
                {hasNoPackage ? memberText("Bạn chưa đăng ký gói tập hoặc gói tập chưa được kích hoạt (cần có gói tập đang hoạt động để đặt lịch HLV 1:1).") : memberText(`Gói ${displayedPackageName} không bao gồm lượt tập PT 1:1 miễn phí.`, `Membership ${displayedPackageName} does not include free 1:1 PT sessions.`)}{memberText(" Phí đặt lịch HLV kèm riêng là")}{' '}
                <strong style={{ color: 'var(--portal-salmon)' }}>{memberText("200.000 đ / giờ")}</strong>{memberText(". (Gói Gold được tặng 3 lượt/tháng, Platinum 6 lượt/tháng).")}</>
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
            {hasNoPackage ? memberText("Đăng ký gói tập ngay") : memberText("Nâng cấp gói tập")}
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => navigate('/member/invoices')}
            style={{ fontSize: 12 }}
          >
            {memberText("Lịch sử hóa đơn")}</button>
        </div>
      </div>

      {/* Bước 1: Chọn Huấn Luyện Viên */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {memberText("Chọn Huấn luyện viên cá nhân (PT 1:1)")}</h3>
          <span className="row-card__meta" style={{ fontSize: 13 }}>
            {memberText("Phí tập tiêu chuẩn: ")}<strong>{formatPrice(200000)}{memberText(" / giờ")}</strong> ({isTrial ? memberText("Miễn phí 01 buổi với Gói Trải Nghiệm") : memberText("Miễn phí với gói Gold/Platinum")})
          </span>
        </div>

        {/* Lọc HLV theo bộ môn: Tất cả bộ môn, Gym, Boxing, Yoga */}
        <div
          className="filter-chips tt-chips"
          role="group"
          aria-label={memberText("Lọc huấn luyện viên theo bộ môn")}
          style={{ marginBottom: 14 }}
        >
          {COACH_FILTER_DISCIPLINES.map((value) => (
            <button
              key={value}
              type="button"
              className={`filter-chip ${coachDiscipline === value ? 'is-active' : ''}`}
              aria-pressed={coachDiscipline === value}
              onClick={() => handleFilterCoachDiscipline(value)}
            >
              {value === 'ALL' ? memberText("Tất cả bộ môn") : value}
            </button>
          ))}
        </div>

        {filteredCoaches.length === 0 ? (
          <div
            className="portal-card"
            style={{
              padding: '28px 20px',
              textAlign: 'center',
              borderRadius: 14,
              background: 'var(--portal-surface)',
              border: '1px dashed var(--portal-border)',
              color: 'var(--portal-muted)',
            }}
          >
            <p style={{ margin: '0 0 10px', fontSize: 14 }}>
              {memberText("Chưa có huấn luyện viên nào cho bộ môn ")}<strong>{coachDiscipline}</strong>.
            </p>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => handleFilterCoachDiscipline('ALL')}
            >
              {memberText("Xem tất cả huấn luyện viên")}</button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 14,
            }}
          >
            {filteredCoaches.map((c) => {
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
                    borderColor: isSelected ? 'var(--portal-salmon)' : 'var(--portal-border)',
                    background: isSelected ? 'color-mix(in srgb, var(--portal-salmon) 12%, transparent)' : 'var(--portal-surface)',
                    boxShadow: isSelected ? '0 0 0 2px var(--portal-salmon)' : undefined,
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
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-salmon)' }}>
                          {memberText("Đang chọn")}</span>
                      )}
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--portal-salmon)', fontWeight: 600 }}>
                      {c.specialization || memberText("Huấn luyện cá nhân")}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--portal-muted)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {c.bio || memberText("Chuyên gia huấn luyện thể hình và phục hồi thể lực.")}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
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
          const slotRange = `${startFmt} – ${endFmt}`;
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
                  minWidth: 110,
                  padding: '9px 16px',
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: isSelected ? 750 : 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  transition: 'all 160ms ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: isSelected ? '1px solid transparent' : '1px solid var(--portal-border)',
                  background: isSelected
                    ? 'var(--portal-salmon)'
                    : 'var(--portal-surface)',
                  color: isSelected ? 'var(--portal-on-accent)' : 'var(--portal-paper)',
                  boxShadow: isSelected
                    ? '0 4px 12px color-mix(in srgb, var(--portal-salmon) 32%, transparent)'
                    : '0 1px 3px color-mix(in srgb, var(--portal-paper) 4%, transparent)',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--portal-salmon) 50%, transparent)';
                    e.currentTarget.style.background = 'color-mix(in srgb, var(--portal-salmon) 8%, var(--portal-surface))';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.borderColor = 'var(--portal-border)';
                    e.currentTarget.style.background = 'var(--portal-surface)';
                  }
                }}
                title={memberText(`Còn trống: ${slotRange} (Nhấn để đặt lịch)`, `Available: ${slotRange} (Click to book)`)}
              >
                {slotRange}
              </button>
            );
          }

          let badgeText = memberText("Đã kín lịch");
          if (slot.reason === 'coach_on_leave') {
            badgeText = memberText("HLV nghỉ phép");
          } else if (slot.reason === 'too_soon') {
            badgeText = memberText("Cần đặt trước 2 tiếng");
          } else if (slot.reason === 'coach_rest') {
            badgeText = memberText("HLV nghỉ sau 3 slot liên tiếp");
          } else if (slot.reason === 'coach_busy') {
            badgeText = memberText("HLV đã có lịch");
          } else if (slot.reason === 'member_busy') {
            badgeText = memberText("Bạn đã có lịch trùng");
          }

          return (
            <div
              key={slot.startTime}
              style={{
                minWidth: 110,
                padding: '9px 16px',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--portal-border)',
                background: 'var(--portal-raised)',
                color: 'var(--portal-muted)',
                opacity: 0.5,
                cursor: 'not-allowed',
              }}
              title={`${slotRange} (${badgeText})`}
            >
              {slotRange}
            </div>
          );
        };

        return (
          <section
            className="portal-card"
            style={{
              padding: '24px 24px',
              borderRadius: 20,
              background: 'var(--portal-surface)',
              border: '1px solid var(--portal-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 22,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--portal-paper)' }}>
                {memberText("Chọn ngày và khung giờ")}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span className="row-card__meta" style={{ fontSize: 13, color: 'var(--portal-star)' }}>
                  {memberText("Quy tắc: Đặt trước ")}<strong>{memberText("2 tiếng")}</strong>
                </span>
                {selectedCoach && (
                  <span className="row-card__meta" style={{ fontSize: 13 }}>
                    {memberText("HLV: ", "Coach: ")}<strong>{selectedCoach.fullName}</strong>
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
                  scrollbarWidth: 'none',
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
                          : '1px solid var(--portal-border)',
                        background: isSelected
                          ? 'var(--portal-salmon)'
                          : 'var(--portal-surface)',
                        color: isSelected ? 'var(--portal-on-accent)' : 'var(--portal-paper)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 3,
                        cursor: 'pointer',
                        flexShrink: 0,
                        boxShadow: isSelected
                          ? '0 6px 16px color-mix(in srgb, var(--portal-salmon) 32%, transparent)'
                          : '0 1px 3px color-mix(in srgb, var(--portal-paper) 4%, transparent)',
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
                          e.currentTarget.style.borderColor = 'var(--portal-border)';
                        }
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: isSelected ? 'color-mix(in srgb, var(--portal-on-accent) 85%, transparent)' : 'var(--portal-muted)',
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
                              background: isSelected ? 'var(--portal-on-accent)' : 'var(--portal-salmon)',
                            }}
                            title={memberText("Hôm nay")}
                          />
                        )}
                      </span>
                      <span
                        style={{
                          fontSize: 24,
                          fontWeight: 800,
                          color: isSelected ? 'var(--portal-on-accent)' : 'var(--portal-paper)',
                          lineHeight: 1.1,
                        }}
                      >
                        {d.dayNumber}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: isSelected ? 'color-mix(in srgb, var(--portal-on-accent) 80%, transparent)' : 'var(--portal-muted)',
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

            <RecurrenceFields
              startDate={selectedDate}
              value={recurrence}
              onChange={setRecurrence}
              disabled={submitting}
              allowedPeriods={['once', 'week']}
              hint={memberText("Đặt các thứ đã chọn trong 7 ngày kể từ ngày bắt đầu. Thứ đã qua trong tuần này được tính sang tuần sau; ngày trùng lịch hoặc hết quyền lợi sẽ được báo riêng.")}
            />
            <p className="row-card__meta" style={{ margin: 0 }}>
              {memberText("Khung giờ cho ngày ")}{slotDate.split('-').reverse().join('/')} {memberText(" · HLV nghỉ 1 slot sau 3 slot 1:1 liên tiếp.")}</p>

            {/* Time Slots Grouped by Time of Day */}
            {loadingSlots ? (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <p className="row-card__meta" style={{ margin: 0 }}>
                  {memberText("Đang kiểm tra lịch trống của huấn luyện viên...")}</p>
              </div>
            ) : slots.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <p className="row-card__meta" style={{ margin: 0 }}>
                  {memberText("Huấn luyện viên không có khung giờ nào trong ngày này. Vui lòng chọn ngày khác!")}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {morningSlots.length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 750, color: 'var(--portal-paper)' }}>
                      {memberText("Buổi sáng")}</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {morningSlots.map(renderSlotPill)}
                    </div>
                  </div>
                )}

                {afternoonSlots.length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 750, color: 'var(--portal-paper)' }}>
                      {memberText("Buổi chiều")}</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {afternoonSlots.map(renderSlotPill)}
                    </div>
                  </div>
                )}

                {eveningSlots.length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 750, color: 'var(--portal-paper)' }}>
                      {memberText("Buổi tối")}</h4>
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
                        <span style={{ fontSize: 13, color: 'var(--portal-muted)' }}>{memberText("Khung giờ đã chọn: ")}</span>
                        <strong style={{ fontSize: 15, color: 'var(--portal-paper)' }}>
                          {selectedSlot.startTime.slice(0, 5)} – {selectedSlot.endTime.slice(0, 5)}
                        </strong>
                        <span style={{ fontSize: 13, color: 'var(--portal-muted)' }}>
                          {` (${slotDate} • HLV ${selectedCoach?.fullName})`}
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
                      {memberText("Tiến hành đặt lịch")}</button>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })()}

      {/* Danh sách Lịch 1:1 đã đặt của Hội viên */}
      <section data-i18n-managed style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {memberText("Lịch tập HLV 1:1 của tôi (")}{myBookings.filter((b) => b.status === 'confirmed' && !isSessionCompleted(b)).length} {memberText(" buổi sắp tới")}{myBookings.some((b) => b.status === 'confirmed' && isSessionCompleted(b))
              ? memberText(` • ${myBookings.filter((b) => b.status === 'confirmed' && isSessionCompleted(b)).length} buổi đã kết thúc`, ` • ${myBookings.filter((b) => b.status === 'confirmed' && isSessionCompleted(b)).length} completed sessions`)
              : ''}
            )
          </h3>
        </div>

        {myBookings.length === 0 ? (
          <div className="portal-card" style={{ padding: 24, textAlign: 'center' }}>
            <p className="row-card__meta" style={{ margin: 0 }}>
              {memberText("Bạn chưa có lịch hẹn 1:1 nào với Huấn luyện viên. Hãy chọn HLV và khung giờ ở trên để bắt đầu!")}</p>
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
                      : 'var(--portal-border)',
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', minWidth: 0, gap: 14, alignItems: 'center' }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: hasEnded ? 'var(--portal-raised)' : 'var(--portal-salmon)',
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
                        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--portal-paper)' }}>
                          {memberText("Tập 1:1 cùng HLV ")}{coachDisplayName}
                        </h4>
                        {isCancelled ? (
                          <span className="badge badge-danger" style={{ fontSize: 11 }}>
                            {memberText("Đã hủy")}</span>
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
                            {memberText("Đã kết thúc buổi")}</span>
                        ) : (
                          <span className="badge badge-success" style={{ fontSize: 11 }}>
                            {memberText("Sắp diễn ra")}</span>
                        )}
                        {existingReview && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-star)' }}>
                            {memberText("Đã đánh giá (")}{existingReview.rating} {memberText(" sao)", " stars)")}</span>
                        )}
                      </div>
                      <p className="row-card__meta" style={{ margin: '3px 0 0' }}>
                        {memberText("Ngày ")}<strong>{b.bookingDate}</strong> • <strong>{b.startTime.slice(0, 5)} – {b.endTime.slice(0, 5)}</strong> • {b.paymentMethod === 'package_quota' ? memberText("Quyền lợi gói tập") : memberText(`Trả phí: ${formatPrice(b.hourlyRate)}`, `Paid session: ${formatPrice(b.hourlyRate)}`)}
                      </p>
                      {b.notes && (
                        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--portal-muted)', fontStyle: 'italic' }}>
                          {memberText("Ghi chú: ")}{b.notes}
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
                            {memberText("Đánh giá HLV")}</button>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--portal-muted)' }}>
                            {memberText("Đã gửi review")}</span>
                        )
                      ) : (
                        <span
                          className="badge badge-neutral"
                          style={{
                            fontSize: 11,
                            color: 'var(--portal-muted)',
                            padding: '4px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          title={memberText("Hệ thống sẽ mở đánh giá HLV sau khi buổi học kết thúc")}
                        >
                          {memberText("Đánh giá sau khi kết thúc buổi")}</span>
                      )}

                      {b.paymentMethod !== 'package_quota' && b.paymentStatus === 'pending' && <VnpayPayButton target={{ coachBookingId: b.id }} onPaid={() => void getMyCoachBookings().then(setMyBookings)} />}
                      {b.paymentMethod !== 'package_quota' && (
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => setPaymentModalBooking(b)}
                        >
                          {memberText("Xem thông tin thanh toán")}</button>
                      )}

                      {!hasEnded && (
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          style={{ color: 'var(--portal-danger)', borderColor: 'var(--portal-danger)' }}
                          onClick={() => setCancelTarget(b)}
                        >
                          {memberText("Hủy lịch hẹn")}</button>
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
          title={memberText(`Đánh giá Huấn luyện viên: ${formatCoachName(reviewTargetBooking.coachName)}`, `Review coach: ${formatCoachName(reviewTargetBooking.coachName)}`)}
          onClose={() => setReviewTargetBooking(null)}
        >
          <div style={{ display: 'grid', gap: 16 }}>
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                background: 'var(--portal-raised)',
                color: 'var(--portal-paper)',
                fontSize: 13,
                border: '1px solid var(--portal-border)',
              }}
            >
              {memberText("Buổi tập 1:1 đã kết thúc ngày ")}<strong>{reviewTargetBooking.bookingDate}</strong> ({reviewTargetBooking.startTime.slice(0, 5)} - {reviewTargetBooking.endTime.slice(0, 5)})
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--portal-paper)' }}>
                {memberText("Mức độ hài lòng của bạn:")}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewRating(star)}
                    style={{
                      border: '1px solid',
                      borderColor: star <= reviewRating ? 'var(--portal-star)' : 'var(--portal-border)',
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
                    ? memberText("Xuất sắc (5 sao)")
                    : reviewRating === 4
                      ? memberText("Rất tốt (4 sao)")
                      : reviewRating === 3
                        ? memberText("Bình thường (3 sao)")
                        : reviewRating === 2
                          ? memberText("Chưa hài lòng (2 sao)")
                          : memberText("Rất thất vọng (1 sao)")}
                </span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--portal-paper)' }}>
                {memberText("Nhận xét chi tiết (Gửi tới Quản lý và Huấn luyện viên):")}</label>
              <textarea
                rows={4}
                className="portal-input"
                style={{ width: '100%', resize: 'vertical', color: 'var(--portal-paper)' }}
                placeholder={memberText("Chia sẻ về tác phong, chuyên môn, sự nhiệt tình hoặc điểm cần cải thiện của HLV...")}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--portal-paper)' }}>
              <input
                type="checkbox"
                checked={reviewAnonymous}
                onChange={(e) => setReviewAnonymous(e.target.checked)}
              />
              <span>{memberText("Đánh giá ẩn danh (Không hiển thị họ tên của tôi với Huấn luyện viên)")}</span>
            </label>

            {/* Review modal is for already completed sessions; no active package alert needed here */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={reviewSubmitting}
                onClick={() => setReviewTargetBooking(null)}
              >
                {memberText("Đóng")}</button>
              <button
                type="button"
                className="btn-primary"
                disabled={reviewSubmitting}
                onClick={() => void handleConfirmReview()}
              >
                {reviewSubmitting ? memberText("Đang gửi…") : memberText("Gửi đánh giá")}
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
                  background: 'color-mix(in srgb, var(--portal-salmon) 20%, var(--portal-surface))',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--portal-salmon)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                  <circle cx="8" cy="14" r="1.2" fill="var(--portal-salmon)"></circle>
                  <circle cx="12" cy="14" r="1.2" fill="var(--portal-salmon)"></circle>
                  <circle cx="16" cy="14" r="1.2" fill="var(--portal-salmon)"></circle>
                  <circle cx="8" cy="18" r="1.2" fill="var(--portal-salmon)"></circle>
                  <circle cx="12" cy="18" r="1.2" fill="var(--portal-salmon)"></circle>
                  <circle cx="16" cy="18" r="1.2" fill="var(--portal-salmon)"></circle>
                </svg>
              </span>
              <span style={{ fontSize: 22, fontWeight: 750, color: 'var(--portal-paper)', fontFamily: 'inherit' }}>
                {memberText("Xác nhận đặt lịch")}</span>
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
                background: 'color-mix(in srgb, var(--portal-salmon) 6%, var(--portal-surface))',
                border: '1px solid color-mix(in srgb, var(--portal-salmon) 22%, var(--portal-border))',
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
                      border: '2px solid var(--portal-surface)',
                      boxShadow: '0 2px 8px color-mix(in srgb, var(--portal-paper) 8%, transparent)',
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
                      background: 'var(--portal-salmon)',
                      border: '2px solid var(--portal-surface)',
                      color: 'var(--portal-on-accent)',
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
                  <div style={{ fontSize: 12, color: 'var(--portal-muted)', marginBottom: 2 }}>
                    {memberText("Huấn luyện viên")}</div>
                  <div style={{ fontSize: 16, fontWeight: 750, color: 'var(--portal-paper)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedCoach.fullName}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--portal-muted)' }}>
                    {selectedCoach.specialization || 'Fitness & Cardio'}
                  </div>
                </div>
              </div>

              {/* Time */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 140, flex: '1 1 auto' }}>
                <span style={{ color: 'var(--portal-muted)', marginTop: 2, flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </span>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--portal-muted)', marginBottom: 2 }}>
                    {memberText("Thời gian")}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-paper)' }}>
                    {slotDate}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-paper)' }}>
                    {modalSlot.startTime.slice(0, 5)} – {modalSlot.endTime.slice(0, 5)}
                  </div>
                </div>
              </div>

              {/* Cost */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 140, flex: '1 1 auto' }}>
                <span style={{ color: 'var(--portal-muted)', marginTop: 2, flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9"></circle>
                    <path d="M14.5 9a2.5 2.5 0 0 0-5 0c0 4 5 2 5 6a2.5 2.5 0 0 1-5 0"></path>
                    <line x1="12" y1="6" x2="12" y2="8"></line>
                    <line x1="12" y1="16" x2="12" y2="18"></line>
                  </svg>
                </span>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--portal-muted)', marginBottom: 2 }}>
                    {memberText("Chi phí buổi tập")}</div>
                  <div style={{ fontSize: 14, fontWeight: 750, color: 'var(--portal-paper)' }}>
                    {formatPrice(selectedCoach.defaultHourlyRate || 200000)} {memberText(" / buổi")}</div>
                </div>
              </div>
            </div>

            {/* Payment Method Section */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 12 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--portal-salmon)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                  <line x1="1" y1="10" x2="23" y2="10"></line>
                </svg>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: 'var(--portal-paper)' }}>
                  {memberText("Phương thức thanh toán")}</h4>
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
                      ? '1.5px solid var(--portal-salmon)'
                      : '1px solid var(--portal-border)',
                    background: paymentMethod === 'package_quota'
                      ? 'color-mix(in srgb, var(--portal-salmon) 8%, var(--portal-surface))'
                      : 'var(--portal-surface)',
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
                      border: paymentMethod === 'package_quota' ? '2px solid var(--portal-salmon)' : '2px solid var(--portal-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {paymentMethod === 'package_quota' && (
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--portal-salmon)' }} />
                    )}
                  </div>

                  <span style={{ color: 'var(--portal-salmon)', marginTop: 2, flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                      <line x1="1" y1="10" x2="23" y2="10"></line>
                    </svg>
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 14, color: 'var(--portal-paper)' }}>
                        {isTrial
                          ? memberText("Sử dụng đặc quyền PT 1:1 trong Gói Trải Nghiệm (01 buổi miễn phí)")
                          : memberText(`Sử dụng quyền lợi PT trong gói tập (${displayedPackageName})`, `Use membership PT benefit (${displayedPackageName})`)}
                      </strong>
                      {hasRemainingQuota ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: 'var(--portal-success)',
                            background: 'color-mix(in srgb, var(--portal-success) 12%, transparent)',
                            padding: '2px 8px',
                            borderRadius: 99,
                          }}
                        >
                          {memberText("(Còn ")}{quotaStatus?.remainingQuota} {memberText(" lượt miễn phí)")}</span>
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--portal-salmon)',
                            background: 'var(--portal-tint)',
                            padding: '2px 8px',
                            borderRadius: 99,
                          }}
                        >
                          {memberText("(Hết lượt hoặc không áp dụng)")}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--portal-muted)', marginTop: 4, lineHeight: 1.4 }}>
                      {hasRemainingQuota
                        ? (isTrial
                            ? memberText("Tự động áp dụng đặc quyền 01 buổi tập HLV 1:1 miễn phí của Gói Trải Nghiệm (0 đ).")
                            : memberText("Tự động trừ 1 buổi tập PT trong hạn mức tháng của bạn (0 đ)."))
                        : (isTrial
                            ? memberText("Bạn đã sử dụng buổi tập HLV 1:1 miễn phí của gói trải nghiệm. Vui lòng chọn đóng phí ") + formatPrice(selectedCoach.defaultHourlyRate || 200000) + memberText(" nếu muốn tập thêm cùng HLV.")
                            : memberText("Gói hiện tại không có lượt PT miễn phí hoặc bạn đã dùng hết quota tháng. Vui lòng chọn đóng phí ") + formatPrice(selectedCoach.defaultHourlyRate || 200000) + '.')}
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
                      ? '1.5px solid var(--portal-salmon)'
                      : '1px solid var(--portal-border)',
                    background: paymentMethod === 'hourly_pay'
                      ? 'color-mix(in srgb, var(--portal-salmon) 8%, var(--portal-surface))'
                      : 'var(--portal-surface)',
                    cursor: 'pointer',
                    transition: 'all 160ms ease',
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border: paymentMethod === 'hourly_pay' ? '2px solid var(--portal-salmon)' : '2px solid var(--portal-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {paymentMethod === 'hourly_pay' && (
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--portal-salmon)' }} />
                    )}
                  </div>

                  <span style={{ color: 'var(--portal-salmon)', marginTop: 2, flexShrink: 0 }}>
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
                      <strong style={{ fontSize: 14, color: 'var(--portal-paper)' }}>
                        {memberText("Đăng ký trả phí theo giờ qua VNPay / Ví SÖL (")}{formatPrice(selectedCoach.defaultHourlyRate || 200000)} {memberText(" / giờ)")}</strong>
                      {!hasRemainingQuota && !hasNoPackage && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--portal-salmon)',
                            background: 'var(--portal-tint)',
                            padding: '2px 8px',
                            borderRadius: 99,
                          }}
                        >
                          {memberText("(Khuyến nghị cho gói của bạn)")}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--portal-muted)', marginTop: 4, lineHeight: 1.4 }}>
                      {memberText("Thanh toán trực tuyến qua VNPay Sandbox hoặc Ví điện tử SÖL. Lưu ý: Nếu thanh toán bằng tiền mặt, vui lòng gặp trực tiếp Lễ tân tại quầy.")}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes Section */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--portal-salmon)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                </svg>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: 'var(--portal-paper)' }}>
                  {memberText("Ghi chú")}</h4>
              </div>
              <div
                style={{
                  position: 'relative',
                  borderRadius: 14,
                  border: '1px solid var(--portal-border)',
                  background: 'color-mix(in srgb, var(--portal-salmon) 4%, var(--portal-surface))',
                  padding: '12px 14px 28px',
                }}
              >
                <textarea
                  rows={3}
                  placeholder={memberText("Ví dụ: Muốn tập trung cơ bụng và lưng, từng đau khớp gối nhẹ...")}
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
                    color: 'var(--portal-paper)',
                    lineHeight: 1.5,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 8,
                    right: 14,
                    fontSize: 12,
                    color: 'var(--portal-muted)',
                    fontWeight: 500,
                  }}
                >
                  {notes.length}/200
                </div>
              </div>
            </div>

            {hasNoPackage && (
              <div role="alert" style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--portal-star) 45%, transparent)', background: 'color-mix(in srgb, var(--portal-star) 10%, transparent)', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span><strong>{memberText("Bạn chưa có gói tập đang hoạt động.")}</strong>{memberText(" Hội viên cần đăng ký và kích hoạt gói tập trước khi đặt lịch HLV 1:1.")}</span>
                <button type="button" className="btn-primary btn-sm" onClick={() => navigate('/member/packages')}>{memberText("Đăng ký gói tập")}</button>
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
                  border: '1.5px solid var(--portal-salmon)',
                  background: 'transparent',
                  color: 'var(--portal-paper)',
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
                {memberText("Đóng")}</button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleConfirmBooking()}
                style={{
                  flex: 1.4,
                  height: 48,
                  borderRadius: 9999,
                  border: 'none',
                  background: 'linear-gradient(155deg, var(--portal-salmon) 0%, var(--portal-salmon) 100%)',
                  color: 'var(--portal-on-accent)',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: submitting ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontFamily: 'inherit',
                  boxShadow: '0 4px 14px color-mix(in srgb, var(--portal-salmon) 32%, transparent)',
                  transition: 'all 160ms ease',
                  opacity: submitting ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!submitting) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 18px color-mix(in srgb, var(--portal-salmon) 40%, transparent)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!submitting) {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 4px 14px color-mix(in srgb, var(--portal-salmon) 32%, transparent)';
                  }
                }}
              >
                <span>
                  {submitting
                    ? memberText("Đang xử lý…")
                    : recurrence.period !== 'once'
                      ? memberText("Xác nhận đặt định kỳ")
                      : memberText("Xác nhận & Đặt lịch")}
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
        <Modal title={memberText("Kết quả đặt lịch 1:1 định kỳ")} onClose={() => setRecurringOutcome(null)}>
          <RecurrenceSummary
            booked={recurringOutcome.booked}
            skipped={recurringOutcome.skipped}
            describe={(b) => `${b.bookingDate} · ${b.startTime.slice(0, 5)}–${b.endTime.slice(0, 5)} · HLV ${formatCoachName(b.coachName)}`}
          />
          {recurringOutcome.booked.some((b) => b.paymentMethod !== 'package_quota') && (
            <p className="muted">{memberText("Các buổi trả phí theo giờ có thể thanh toán qua VNPay Sandbox hoặc Ví SÖL tại danh sách lịch tập. Lưu ý: Nếu thanh toán bằng tiền mặt, vui lòng gặp trực tiếp Lễ tân tại quầy.")}</p>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="btn-primary" onClick={() => setRecurringOutcome(null)}>{memberText("Đóng")}</button>
          </div>
        </Modal>
      )}

      {/* Modal Hướng dẫn Thanh toán / VietQR */}
      {paymentModalBooking && (
        <Modal
          title={memberText("Thanh toán Buổi tập PT 1:1")}
          onClose={() => setPaymentModalBooking(null)}
        >
          <VnpayPayButton target={{ coachBookingId: paymentModalBooking.id }} onPaid={() => { setPaymentModalBooking(null); void getMyCoachBookings().then(setMyBookings); }} />
          <div style={{ display: 'grid', gap: 16 }}>
            <div
              style={{
                padding: 14,
                borderRadius: 12,
                background: 'color-mix(in srgb, var(--portal-success) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--portal-success) 35%, transparent)',
              }}
            >
              <h4 style={{ margin: '0 0 6px', color: 'var(--portal-success)', fontSize: 15, fontWeight: 750 }}>
                {memberText("Lịch tập 1:1 đã được ghi nhận thành công!")}</h4>
              <p style={{ margin: 0, fontSize: 13 }}>
                {memberText("HLV: ", "Coach: ")}<strong>{formatCoachName(paymentModalBooking.coachName)}</strong>{memberText(" • Thời gian:")}{' '}
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
                background: 'var(--portal-raised)',
              }}
            >
              <div style={{ fontSize: 13, display: 'grid', gap: 6 }}>
                <div>{memberText("Chọn ")}<strong>{memberText("Thanh toán VNPay Sandbox")}</strong>{memberText(" hoặc ")}<strong>{memberText("Thanh toán bằng Ví SÖL")}</strong>{memberText(" ở trên để hoàn tất thanh toán trực tuyến.")}</div>
                <div>{memberText("Số tiền cần thanh toán: ")}<strong style={{ color: 'var(--portal-salmon)', fontSize: 16 }}>{formatPrice(paymentModalBooking.hourlyRate)}</strong></div>
                <div>{memberText("Nội dung chuyển khoản: ")}<strong style={{ color: 'var(--portal-salmon)' }}>PT{paymentModalBooking.id} {paymentModalBooking.memberName}</strong></div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--portal-muted)' }}>
                  {memberText("Lưu ý: Nếu thanh toán bằng tiền mặt, vui lòng gặp trực tiếp Lễ tân tại quầy trước giờ tập để được hỗ trợ thu tiền.")}</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPaymentModalBooking(null)}
              >
                {memberText("Đóng")}</button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setPaymentModalBooking(null);
                  navigate('/member/invoices');
                }}
              >
                {memberText("Xem Hóa đơn & Lịch sử thanh toán →")}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Hủy lịch */}
      {cancelTarget && (
        <Modal
          title={memberText("Hủy lịch tập 1:1")}
          onClose={() => setCancelTarget(null)}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <p>
              {memberText("Bạn có chắc chắn muốn hủy lịch tập 1:1 với HLV ")}<strong>{formatCoachName(cancelTarget.coachName)}</strong>{memberText(" vào")}{' '}
              <strong>{cancelTarget.startTime.slice(0, 5)} – {cancelTarget.endTime.slice(0, 5)}{memberText(" ngày ")}{cancelTarget.bookingDate}</strong>?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={cancelling}
                onClick={() => setCancelTarget(null)}
              >
                {memberText("Giữ lịch")}</button>
              <button
                type="button"
                className="btn-danger"
                disabled={cancelling}
                onClick={() => void handleConfirmCancel()}
              >
                {cancelling ? memberText("Đang hủy…") : memberText("Xác nhận Hủy")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
