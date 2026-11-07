import { memberMessage, memberText, memberRenderMessage, memberNotify } from './memberI18n';
import type { SourceMessage } from '../../shared/i18n/language';
import { useLanguage } from '../../shared/i18n/language';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Modal } from '../../shared/ui/Modal';
import { Select } from '../../shared/ui/Select';
import { ApiError } from '../../shared/api/client';
import { MemberCoachBookingView } from './components/MemberCoachBookingView';
import { MemberCalendar } from './components/MemberCalendar';
import { centerNowParts } from '../../shared/lib/centerTime';
import { getMySubscription } from './memberCardApi';
import { cardStatus } from './cardStatus';
import { DISCIPLINES } from '../../shared/lib/disciplines';
import {
  bookSession,
  cancelBooking,
  cancelEnrollment,
  currentWeek,
  filterSessions,
  getMyBookings,
  getMyEnrollments,
  getSessions,
  type ClassSessionDto,
  type EnrollmentDto,
  type SessionBookingDto,
} from './memberClassesApi';
import { weekRangeLabel } from '../schedule/timetable';
import '../schedule/timetable.css';
import './member-classes.css';

const SESSION_BATCH_SIZE = 6;

const days = [
  ['ALL', 'Tất cả các ngày'], ['1', 'Thứ 2'], ['2', 'Thứ 3'], ['3', 'Thứ 4'],
  ['4', 'Thứ 5'], ['5', 'Thứ 6'], ['6', 'Thứ 7'], ['0', 'Chủ nhật'],
];

function errorMessage(error: unknown): string | SourceMessage {
  if (error instanceof ApiError) {
    if (error.code === 'SCHEDULING_SESSION_FULL')
      return memberMessage('Buổi học đã đầy chỗ. Hãy chọn buổi khác.');
    if (['SCHEDULING_CLASS_FULL', 'CLASS_CAPACITY_EXCEEDED', 'SCHEDULING_CAPACITY_EXCEEDED'].includes(error.code ?? ''))
      return memberMessage('Lớp đã đầy chỗ. Hãy chọn buổi hoặc lớp khác.');
    if (['SCHEDULING_MEMBERSHIP_INVALID', 'MEMBERSHIP_INACTIVE_OR_EXPIRED', 'SCHEDULING_NO_ACTIVE_SUBSCRIPTION'].includes(error.code ?? ''))
      return memberMessage('Bạn chưa đăng ký gói tập, gói tập chưa kích hoạt hoặc đã hết hạn. Vui lòng đăng ký hoặc kích hoạt gói tập trước khi đặt lịch.');
    return error.message;
  }
  return memberMessage('Không thể tải lịch học. Vui lòng thử lại.');
}

/** A per-session booking in the shape the overlap check already understands. */
function bookingAsEnrollment(booking: SessionBookingDto): EnrollmentDto {
  return {
    id: booking.id, classId: booking.classId, className: booking.className, memberId: booking.memberId,
    sessionId: booking.sessionId, sessionDate: booking.sessionDate, startTime: booking.startTime,
    endTime: booking.endTime, status: 'booked', enrolledAt: booking.bookedAt, cancelledAt: null, cancelReason: null,
  };
}

/** Only Monday–Sunday calendar weeks are supported. */
function weekFromQuery(value: string | null): -1 | 0 | 1 {
  return value === '-1' ? -1 : value === '1' ? 1 : 0;
}

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

const DAY_NAMES_VI: Record<number, string> = {
  0: 'Chủ nhật',
  1: 'Thứ Hai',
  2: 'Thứ Ba',
  3: 'Thứ Tư',
  4: 'Thứ Năm',
  5: 'Thứ Sáu',
  6: 'Thứ Bảy',
};

function formatDayGroupLabel(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00`);
  const dayLabel = Number.isNaN(parsed.getTime()) ? '' : DAY_NAMES_VI[parsed.getDay()] ?? '';
  return dayLabel ? `${memberText(dayLabel)} • ${formatShortDate(iso)}` : formatShortDate(iso);
}

function findOverlappingEnrollment(
  targetSession: ClassSessionDto,
  activeEnrollments: EnrollmentDto[],
  allSessions: ClassSessionDto[],
): { className: string; startTime: string; endTime: string } | null {
  const targetStart = targetSession.startTime.slice(0, 5);
  const targetEnd = targetSession.endTime.slice(0, 5);
  for (const enrollment of activeEnrollments) {
    if (enrollment.sessionId ? enrollment.sessionId === targetSession.id : enrollment.classId === targetSession.classId) {
      continue;
    }
    const matchedSession =
      enrollment.sessionDate && enrollment.startTime && enrollment.endTime
        ? {
            sessionDate: enrollment.sessionDate,
            startTime: enrollment.startTime,
            endTime: enrollment.endTime,
          }
        : allSessions.find(
            (s) =>
              s.id === enrollment.sessionId ||
              (enrollment.sessionId === null && s.classId === enrollment.classId && s.sessionDate === targetSession.sessionDate),
          );
    if (!matchedSession || matchedSession.sessionDate !== targetSession.sessionDate) {
      continue;
    }
    const otherStart = matchedSession.startTime.slice(0, 5);
    const otherEnd = matchedSession.endTime.slice(0, 5);
    if (targetStart < otherEnd && targetEnd > otherStart) {
      return {
        className: enrollment.className,
        startTime: otherStart,
        endTime: otherEnd,
      };
    }
  }
  return null;
}

/** Liên kết từ trang bộ môn (`?discipline=Boxing`); giá trị lạ quay về tất cả bộ môn. */
function disciplineFromQuery(value: string | null): string {
  const found = DISCIPLINES.find((item) => item.name.toLocaleLowerCase('vi') === value?.toLocaleLowerCase('vi'));
  return found?.name ?? 'ALL';
}

export function MemberClassesPage() {
  const { lang } = useLanguage();
  const text = (vi: string, en: string) => lang === 'en' ? en : vi;
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState<'timetable' | 'schedule' | 'coach_booking'>(
    initialTab === 'coach' || initialTab === 'pt' || initialTab === 'coach_booking'
      ? 'coach_booking'
      : initialTab === 'list'
      ? 'schedule'
      : 'timetable',
  );
  const weekOffset = weekFromQuery(searchParams.get('week'));
  const [sessions, setSessions] = useState<ClassSessionDto[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentDto[]>([]);
  const [bookings, setBookings] = useState<SessionBookingDto[]>([]);
  const [discipline, setDiscipline] = useState(() => disciplineFromQuery(searchParams.get('discipline')));
  const [day, setDay] = useState('ALL');
  // null: chưa biết (đang tải hoặc lỗi) — khi đó không hiện lời nhắc mua gói
  const [hasActivePackage, setHasActivePackage] = useState<boolean | null>(null);
  const [visibleCount, setVisibleCount] = useState(SESSION_BATCH_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | SourceMessage>('');
  const [retry, setRetry] = useState(0);
  const [myScheduleLoading, setMyScheduleLoading] = useState(true);
  const [myScheduleError, setMyScheduleError] = useState<string | SourceMessage>('');
  const [myScheduleRetry, setMyScheduleRetry] = useState(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | SourceMessage>('');
  const [cancelTarget, setCancelTarget] = useState<{ id: number; className: string; kind: 'enrollment' | 'booking' } | null>(null);
  const cancelFocusRef = useRef<HTMLButtonElement | null>(null);
  const busyRef = useRef<string | null>(null);
  const actionGenRef = useRef(0);

  function clearActionFeedback() {
    setVisibleCount(SESSION_BATCH_SIZE);
    actionGenRef.current += 1;
    setActionError('');
  }

  function handleSelectTab(nextTab: 'timetable' | 'schedule' | 'coach_booking') {
    clearActionFeedback();
    setTab(nextTab);
    const params = new URLSearchParams(searchParams);
    if (nextTab === 'coach_booking') {
      params.set('tab', 'pt');
    } else if (nextTab === 'schedule') {
      params.set('tab', 'list');
    } else {
      params.delete('tab');
    }
    setSearchParams(params, { replace: true });
  }

  // Normalize removed/unknown URL ranges without losing tab or discipline.
  useEffect(() => {
    const week = searchParams.get('week');
    const next = weekFromQuery(week);
    if (week !== null && week !== String(next)) {
      const params = new URLSearchParams(searchParams);
      params.set('week', String(next));
      setSearchParams(params, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  function changeWeek(next: -1 | 0 | 1) {
    clearActionFeedback();
    const params = new URLSearchParams(searchParams);
    params.set('week', String(next));
    setSearchParams(params, { replace: true });
  }

  useEffect(() => {
    let active = true;
    void getMySubscription()
      .then((subscription) => {
        if (active) setHasActivePackage(!!subscription && ['active', 'warning'].includes(cardStatus(subscription.status, subscription.endDate)));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const nextSessions = weekOffset === 0 ? await getSessions() : await getSessions(weekOffset);
        if (active) setSessions(nextSessions);
      } catch (cause) {
        if (active) setError(errorMessage(cause));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [retry, weekOffset]);

  useEffect(() => {
    let active = true;
    async function loadMySchedule() {
      setMyScheduleLoading(true);
      setMyScheduleError('');
      try {
        const [nextEnrollments, nextBookings] = await Promise.all([
          getMyEnrollments(),
          getMyBookings(),
        ]);
        if (active) {
          setEnrollments(nextEnrollments ?? []);
          setBookings(nextBookings ?? []);
        }
      } catch (cause) {
        if (active) setMyScheduleError(errorMessage(cause));
      } finally {
        if (active) setMyScheduleLoading(false);
      }
    }
    void loadMySchedule();
    return () => { active = false; };
  }, [myScheduleRetry]);

  /** Every seat the member holds: class-wide enrollments and per-session bookings. */
  function currentSeats(): EnrollmentDto[] {
    return [
      ...enrollments.filter((item) => item.status === 'booked' || item.status === 'enrolled'),
      ...bookings.filter((item) => item.status === 'booked').map(bookingAsEnrollment),
    ];
  }

  async function handleBook(session: ClassSessionDto) {
    const key = `session-${session.id}`;
    if (busyRef.current || !myScheduleReady) return;
    const overlap = findOverlappingEnrollment(
      session,
      currentSeats(),
      sessions,
    );
    if (overlap) {
      
      setActionError(
        memberMessage(`Trùng giờ học: Bạn đã đặt chỗ lớp "${overlap.className}" (${overlap.startTime}–${overlap.endTime}) ngày ${formatShortDate(session.sessionDate)}. Không thể đặt hai lớp học chồng chéo thời gian.`, `Time conflict: You booked "${overlap.className}" (${overlap.startTime}–${overlap.endTime}) on ${formatShortDate(session.sessionDate)}. Overlapping classes cannot be booked.`),
      );
      return;
    }
    busyRef.current = key;
    setBusyKey(key);
    const gen = ++actionGenRef.current;
    
    setActionError('');
    try {
      await bookSession(session.id);
      if (actionGenRef.current === gen) {
        memberNotify(memberMessage(`Đã đặt chỗ lớp "${session.className}" (${formatShortDate(session.sessionDate)} • ${session.startTime.slice(0, 5)}) thành công!`, `Class "${session.className}" booked (${formatShortDate(session.sessionDate)} • ${session.startTime.slice(0, 5)})!`), 'success', { record: true });
      }
      setRetry((v) => v + 1);
      setMyScheduleRetry((v) => v + 1);
    } catch (cause) {
      if (actionGenRef.current === gen) {
        setActionError(errorMessage(cause));
        if (cause instanceof ApiError && (cause.status === 409 || cause.status === 403)) { setRetry((v) => v + 1); setMyScheduleRetry((v) => v + 1); }
      }
    } finally {
      busyRef.current = null;
      setBusyKey(null);
    }
  }

  async function handleCancelEnrollment(enrollmentId: number, className: string) {
    const key = `enroll-${enrollmentId}`;
    if (busyRef.current || !myScheduleReady) return;
    busyRef.current = key;
    setBusyKey(key);
    const gen = ++actionGenRef.current;
    
    setActionError('');
    try {
      await cancelEnrollment(enrollmentId);
      if (actionGenRef.current === gen) {
        memberNotify(memberMessage(`Đã hủy đặt chỗ lớp "${className}".`, `Booking for class "${className}" cancelled.`), 'success', { record: true });
      }
      setRetry((v) => v + 1);
      setMyScheduleRetry((v) => v + 1);
    } catch (cause) {
      if (actionGenRef.current === gen) {
        setActionError(errorMessage(cause));
        if (cause instanceof ApiError && (cause.status === 409 || cause.status === 403)) { setRetry((v) => v + 1); setMyScheduleRetry((v) => v + 1); }
      }
    } finally {
      busyRef.current = null;
      setBusyKey(null);
    }
  }

  async function handleCancelBooking(bookingId: number, className: string) {
    const key = `booking-${bookingId}`;
    if (busyRef.current || !myScheduleReady) return;
    busyRef.current = key;
    setBusyKey(key);
    const gen = ++actionGenRef.current;
    setActionError('');
    try {
      await cancelBooking(bookingId);
      if (actionGenRef.current === gen) {
        memberNotify(memberMessage(`Đã hủy chỗ buổi học "${className}".`, `Booking for session "${className}" cancelled.`), 'success', { record: true });
      }
      setRetry((v) => v + 1);
      setMyScheduleRetry((v) => v + 1);
    } catch (cause) {
      if (actionGenRef.current === gen) {
        setActionError(errorMessage(cause));
        if (cause instanceof ApiError && [400, 403, 404, 409].includes(cause.status)) { setRetry((v) => v + 1); setMyScheduleRetry((v) => v + 1); }
      }
    } finally {
      busyRef.current = null;
      setBusyKey(null);
    }
  }

  const weekRange = currentWeek(weekOffset);
  const disciplines = DISCIPLINES.map(item => item.name);
  const visible = filterSessions(sessions, discipline, day)
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate) || a.startTime.localeCompare(b.startTime));
  const myScheduleReady = !myScheduleLoading && !myScheduleError;
  const activeEnrollments = myScheduleReady ? enrollments.filter((item) => item.status === 'booked' || item.status === 'enrolled') : [];
  const activeBookings = myScheduleReady ? bookings.filter((item) => item.status === 'booked') : [];
  const seatsInView: EnrollmentDto[] = [...activeEnrollments, ...activeBookings.map(bookingAsEnrollment)];

  return (
    <div data-i18n-managed className="portal-container member-classes">
      <div data-i18n-managed><PageHeader
        eyebrow={text("Hội viên", 'Member')}
        title={text("Lịch học & đặt chỗ", 'Classes & bookings')}
      /></div>

      <div className="portal-tabs" data-i18n-managed role="tablist" aria-label={text("Lịch học", "Class schedule")} style={{ marginBottom: 18 }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'timetable'}
          className={`portal-tab ${tab === 'timetable' ? 'active' : ''}`}
          onClick={() => handleSelectTab('timetable')}
        >
          {text("Lịch của tôi", "My schedule")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'schedule'}
          className={`portal-tab ${tab === 'schedule' ? 'active' : ''}`}
          onClick={() => {
            handleSelectTab('schedule');
          }}
        >
          {text("Lịch lớp học", "Class schedule")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'coach_booking'}
          className={`portal-tab ${tab === 'coach_booking' ? 'active' : ''}`}
          onClick={() => handleSelectTab('coach_booking')}
        >
          {text("Đặt lịch HLV 1:1 (PT)", "Book a personal trainer (PT)")}
        </button>
      </div>

      {actionError && (
        <div className="portal-card" role="alert" style={{ marginBottom: 16, borderColor: 'color-mix(in srgb, var(--portal-danger) 35%, transparent)' }}>
          <strong style={{ color: 'var(--portal-danger, #fca5a5)' }}>{memberRenderMessage(actionError)}</strong>
          <div style={{ marginTop: 8 }}>
            <Link to="/member/packages" className="btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
              {text("Kiểm tra gói tập của tôi", "Check my membership")}
            </Link>
          </div>
        </div>
      )}

      {tab === 'timetable' ? (
        <MemberCalendar onBookingChange={() => { setRetry((v) => v + 1); setMyScheduleRetry((v) => v + 1); }} />
      ) : tab === 'coach_booking' ? (
        <MemberCoachBookingView onBookingSuccess={() => { setRetry(v => v + 1); setMyScheduleRetry(v => v + 1); }} />
      ) : (
        <div>
          {myScheduleError && (
            <div data-i18n-managed className="portal-card portal-empty" role="alert" style={{ marginBottom: 16 }}>
              <h3>{text("Không tải được lịch học của tôi", "Unable to load my schedule")}</h3>
              <p>{memberRenderMessage(myScheduleError)} {text("Chưa thể xác nhận trạng thái đặt chỗ của bạn.", "Your booking status could not be confirmed.")}</p>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setMyScheduleRetry(value => value + 1)}>
                {text("Thử lại lịch học của tôi", "Retry my schedule")}
              </button>
            </div>
          )}

          {/* Thanh công cụ và bộ lọc bộ môn của Lịch lớp học */}
          <div
            className="portal-card"
            style={{
              padding: '16px 20px',
              marginBottom: 20,
              display: 'grid',
              gap: 14,
            }}
          >
            <div className="tt__toolbar" style={{ margin: 0 }}>
              <div className="tt__nav" role="group" aria-label={memberText("Lọc theo tuần")}>
                {([-1, 0, 1] as const).map((offset) => (
                  <button key={offset} type="button" className={`filter-chip ${weekOffset === offset ? 'is-active' : ''}`}
                    aria-pressed={weekOffset === offset} onClick={() => changeWeek(offset)}>
                    {offset === -1 ? memberText("Tuần trước") : offset === 0 ? memberText("Tuần này") : memberText("Tuần kế tiếp")}
                  </button>
                ))}
              </div>
              <strong className="tt__range" aria-live="polite">{weekRangeLabel(weekRange.fromDate)}</strong>
            </div>

            <div className="filter-chips" role="group" aria-label={memberText("Lọc theo bộ môn")}>
              {['ALL', ...disciplines].map((value) => (
                <button key={value} type="button" className={`filter-chip ${discipline === value ? 'is-active' : ''}`}
                  aria-pressed={discipline === value} onClick={() => { clearActionFeedback(); setDiscipline(value); }}>
                  {value === 'ALL' ? memberText("Tất cả bộ môn") : value}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingTop: 10, borderTop: '1px solid var(--portal-border, #e4e2de)' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <label htmlFor="member-classes-day" className="meta-label">{memberText("Thứ trong tuần")}</label>
                <Select
                  id="member-classes-day"
                  className="portal-select"
                  style={{ width: 'auto', minWidth: 196 }}
                  value={day}
                  onChange={(event) => {
                    clearActionFeedback();
                    setDay(event.target.value);
                  }}
                >
                  {days.map(([value, label]) => <option key={value} value={value}>{memberText(label)}</option>)}
                </Select>
              </div>
              {hasActivePackage === false && (
                <p className="row-card__meta" style={{ margin: 0 }}>
                  {memberText("Cần gói tập đang hoạt động để đặt chỗ. ")}<Link className="member-classes-package-link" to="/member/packages">{memberText("Xem gói tập")}</Link>
                </p>
              )}
            </div>
          </div>

          {loading ? (
          <div className="stack" role="status" aria-busy="true">
            <span className="sr-only">{text("Đang tải lịch học...", "Loading classes...")}</span>
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="portal-card portal-card--list" aria-hidden="true">
                <div style={{ flex: 1 }}>
                  <div className="portal-skeleton-line" style={{ width: '32%', height: 14, marginBottom: 10 }} />
                  <div className="portal-skeleton-line" style={{ width: '55%', height: 22, marginBottom: 10 }} />
                  <div className="portal-skeleton-line" style={{ width: '68%', height: 14 }} />
                </div>
                <div style={{ width: 150 }}>
                  <div className="portal-skeleton-line" style={{ width: '100%', height: 16, marginBottom: 10 }} />
                  <div className="portal-skeleton-line" style={{ width: '100%', height: 34 }} />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div data-i18n-managed className="portal-card portal-empty" role="alert">
            <h3>{text("Không tải được lịch học", "Unable to load class schedule")}</h3>
            <p>{memberRenderMessage(error)}</p>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setRetry((value) => value + 1)}>
              {text("Thử lại", "Retry")}
            </button>
          </div>
        ) : (
          <div className="stack" id="member-class-results">
            {sessions.length === 0 ? (
              <div data-i18n-managed className="portal-card portal-empty">
                <h3>{text("Chưa có lịch học", "No classes scheduled")}</h3>
                <p>{text("Chưa có buổi học nào trong tuần này. Bạn có thể chuyển sang xem lịch tuần sau.", "There are no classes this week. You can view next week instead.")}</p>
                {weekOffset === 0 && (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      changeWeek(1);
                    }}
                  >
                    {text("Xem lịch tuần sau", "View next week")}
                  </button>
                )}
              </div>
            ) : visible.length === 0 ? (
              <div data-i18n-managed className="portal-card portal-empty">
                <h3>{text("Không có buổi học phù hợp", "No matching classes")}</h3>
                <p>{text("Hãy thử bộ lọc khác.", "Try another filter.")}</p>
              </div>
            ) : (
              <>{visible.slice(0, visibleCount).map((item, index) => {
                const [year, month, date] = item.sessionDate.split('-');
                const now = centerNowParts();
                const past =
                  item.sessionDate < now.date ||
                  (item.sessionDate === now.date && item.startTime.slice(0, 5) <= now.time);
                const unavailable = past || item.status !== 'scheduled';
                const overlap = findOverlappingEnrollment(item, seatsInView, sessions);
                const myBooking = activeBookings.find((b) => b.sessionId === item.id);
                const myEnrollment = activeEnrollments.find(
                  (e) => e.sessionId === item.id || (e.sessionId === null && e.classId === item.classId),
                );
                const isBusy = busyKey === `session-${item.id}` ||
                  (myBooking ? busyKey === `booking-${myBooking.id}` : false) ||
                  (myEnrollment ? busyKey === `enroll-${myEnrollment.id}` : false);

                return (
                  <div key={item.id} className="portal-card portal-card--list member-class-session">
                    <div>
                      {(index === 0 || visible[index - 1].sessionDate !== item.sessionDate) && <h4 data-testid={`day-group-${item.sessionDate}`}>{formatDayGroupLabel(item.sessionDate)}</h4>}
                      <div className="row-card__meta row-card__meta--inline">
                        <span className="badge badge-info">{item.disciplineName}</span>
                        {overlap && <span className="badge badge-warning" data-testid={`overlap-badge-${item.id}`}>{memberText("Trùng giờ đã đặt")}</span>}
                        <span>{date}/{month}/{year}</span>
                        {(myEnrollment || myBooking) && (
                          <span className="badge badge-success">{memberText("Đã đặt chỗ")}</span>
                        )}
                      </div>
                      <h3 className="row-card__title">{item.className}</h3>
                      <div className="row-card__meta row-card__meta--inline">
                        <span><strong>{item.startTime.slice(0, 5)}–{item.endTime.slice(0, 5)}</strong></span>
                        <span>{item.roomName}</span>
                        <span>{item.coachName.trim().toLowerCase().startsWith('hlv') ? item.coachName : `HLV ${item.coachName}`}</span>
                      </div>
                      <div className="row-card__meta">
                        {memberText("Trạng thái: ")}{past ? memberText("Đã qua giờ mở lớp") : item.status === 'scheduled' ? memberText("Đã lên lịch") : item.status === 'cancelled' ? memberText("Đã hủy") : item.status}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="meta-label">{memberText("SĨ SỐ HIỆN TẠI")}</div>
                      <strong>{item.bookedCount} / {item.capacity}{memberText(" học viên")}</strong>
                      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {!myScheduleReady ? <button type="button" className="btn-secondary btn-sm" disabled>
                          {myScheduleLoading ? memberText("Đang kiểm tra đặt chỗ...") : memberText("Chưa thể kiểm tra đặt chỗ")}
                        </button> : myBooking ? (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            disabled={isBusy || past}
                            onClick={(event) => { cancelFocusRef.current = event.currentTarget; setCancelTarget({ id: myBooking.id, className: item.className, kind: 'booking' }); }}
                          >
                            {isBusy ? memberText("Đang xử lý...") : memberText("Hủy buổi này")}
                          </button>
                        ) : myEnrollment ? (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            disabled={isBusy || past}
                            onClick={(event) => { cancelFocusRef.current = event.currentTarget; setCancelTarget({ id: myEnrollment.id, className: item.className, kind: 'enrollment' }); }}
                          >
                            {isBusy ? memberText("Đang xử lý...") : memberText("Hủy đặt chỗ")}
                          </button>
                        ) : overlap ? <button type="button" className="btn-secondary btn-sm" data-testid={`overlap-btn-${item.id}`} disabled>{memberText("Trùng giờ đã đặt")}</button> : unavailable ? (
                          <button type="button" className="btn-secondary btn-sm" disabled>
                            {memberText("Không thể đặt")}</button>
                        ) : item.bookedCount < item.capacity ? (
                          <button
                            type="button"
                            className="btn-primary member-class-enroll"
                            aria-label={`${isBusy ? memberText("Đang đặt chỗ") : memberText("Đặt chỗ ngay")}: ${item.className}`}
                            title={memberText(`Đặt chỗ ngay: ${item.className}`, `Book now: ${item.className}`)}
                            disabled={isBusy}
                            onClick={() => void handleBook(item)}
                          >
                            <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg><span className="sr-only">{isBusy ? memberText("Đang đặt chỗ...") : memberText("Đặt chỗ ngay")}</span>
                          </button>
                        ) : (
                          <button type="button" className="btn-secondary btn-sm" disabled>
                            {memberText("Buổi đã đầy")}</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="member-classes-more">
                <p role="status">{memberText("Hiển thị ")}{Math.min(visibleCount, visible.length)} / {visible.length}{memberText(" buổi học")}</p>
                {visibleCount < visible.length && <button type="button" className="btn-secondary" aria-controls="member-class-results" onClick={() => setVisibleCount(count => count + SESSION_BATCH_SIZE)}>{memberText("Xem thêm (")}{visible.length - visibleCount})</button>}
              </div></>
            )}
          </div>)}
        </div>
      )}
      {cancelTarget && (
        <Modal title={memberText("Hủy đặt chỗ?")} onClose={() => setCancelTarget(null)} returnFocusRef={cancelFocusRef}>
          <p className="row-card__meta">
            {cancelTarget.kind === 'booking'
              ? memberText(`Bạn có chắc muốn hủy chỗ của buổi học lớp ${cancelTarget.className}?`, `Cancel your booking for the ${cancelTarget.className} session?`)
              : memberText(`Bạn có chắc muốn hủy đặt chỗ lớp ${cancelTarget.className}?`, `Cancel your booking for class ${cancelTarget.className}?`)}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
            <button type="button" className="btn-secondary" onClick={() => setCancelTarget(null)}>{memberText("Giữ đặt chỗ")}</button>
            <button type="button" className="btn-danger" onClick={() => { const target = cancelTarget; setCancelTarget(null); if (target.kind === 'booking') void handleCancelBooking(target.id, target.className); else void handleCancelEnrollment(target.id, target.className); }}>{memberText("Xác nhận hủy")}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
