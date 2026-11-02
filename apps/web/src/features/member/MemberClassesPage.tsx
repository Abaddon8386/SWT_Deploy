import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Modal } from '../../shared/ui/Modal';
import { Select } from '../../shared/ui/Select';
import { PortalIcon } from '../portal/PortalIcon';
import { ApiError } from '../../shared/api/client';
import { MemberCoachBookingView } from './components/MemberCoachBookingView';
import { getFavoriteDisciplines, toggleFavoriteDiscipline } from './favoriteDisciplinesApi';
import { getMySubscription } from './memberCardApi';
import { cardStatus } from './cardStatus';
import { DISCIPLINES } from '../../shared/lib/disciplines';
import {
  cancelEnrollment,
  currentWeek,
  enroll,
  filterSessions,
  getMyEnrollments,
  getMyWaitlists,
  getSessions,
  joinWaitlist,
  leaveWaitlist,
  type ClassSessionDto,
  type EnrollmentDto,
  type WaitlistDto,
} from './memberClassesApi';
import './member-classes.css';
import { notify } from '../../shared/lib/portalNotices';

const SESSION_BATCH_SIZE = 6;

const days = [
  ['ALL', 'Tất cả các ngày'], ['1', 'Thứ 2'], ['2', 'Thứ 3'], ['3', 'Thứ 4'],
  ['4', 'Thứ 5'], ['5', 'Thứ 6'], ['6', 'Thứ 7'], ['0', 'Chủ nhật'],
];

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (['SCHEDULING_CLASS_FULL', 'CLASS_CAPACITY_EXCEEDED', 'SCHEDULING_CAPACITY_EXCEEDED'].includes(error.code ?? ''))
      return 'Lớp đã đầy. Bạn có thể tham gia hàng chờ để được tự động đôn lên khi có chỗ trống.';
    if (['SCHEDULING_MEMBERSHIP_INVALID', 'MEMBERSHIP_INACTIVE_OR_EXPIRED', 'SCHEDULING_NO_ACTIVE_SUBSCRIPTION'].includes(error.code ?? ''))
      return 'Gói tập chưa hoạt động hoặc đã hết hạn. Vui lòng kích hoạt gói tập trước khi đặt lịch.';
    return error.message;
  }
  return 'Không thể tải lịch học. Vui lòng thử lại.';
}

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
  return dayLabel ? `${dayLabel} • ${formatShortDate(iso)}` : formatShortDate(iso);
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
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState<'schedule' | 'coach_booking' | 'my'>(
    initialTab === 'coach' || initialTab === 'pt' || initialTab === 'coach_booking'
      ? 'coach_booking'
      : initialTab === 'my'
      ? 'my'
      : 'schedule',
  );
  const [weekOffset, setWeekOffset] = useState<0 | 1>(0);
  const [sessions, setSessions] = useState<ClassSessionDto[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentDto[]>([]);
  const [waitlists, setWaitlists] = useState<WaitlistDto[]>([]);
  const [discipline, setDiscipline] = useState(() => disciplineFromQuery(searchParams.get('discipline')));
  const [day, setDay] = useState('ALL');
  const [favoriteDisciplineIds, setFavoriteDisciplineIds] = useState<number[]>([]);
  // null: chưa biết (đang tải hoặc lỗi) — khi đó không hiện lời nhắc mua gói
  const [hasActivePackage, setHasActivePackage] = useState<boolean | null>(null);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [visibleCount, setVisibleCount] = useState(SESSION_BATCH_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [myScheduleLoading, setMyScheduleLoading] = useState(true);
  const [myScheduleError, setMyScheduleError] = useState('');
  const [myScheduleRetry, setMyScheduleRetry] = useState(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [cancelTarget, setCancelTarget] = useState<{ id: number; className: string } | null>(null);
  const cancelFocusRef = useRef<HTMLButtonElement | null>(null);
  const busyRef = useRef<string | null>(null);
  const actionGenRef = useRef(0);

  function clearActionFeedback() {
    setVisibleCount(SESSION_BATCH_SIZE);
    actionGenRef.current += 1;
    setActionError('');
    
  }

  function handleSelectTab(nextTab: 'schedule' | 'coach_booking' | 'my') {
    clearActionFeedback();
    setTab(nextTab);
    const params = new URLSearchParams(searchParams);
    if (nextTab === 'coach_booking') {
      params.set('tab', 'pt');
    } else if (nextTab === 'my') {
      params.set('tab', 'my');
    } else {
      params.delete('tab');
    }
    setSearchParams(params, { replace: true });
  }

  useEffect(() => {
    let active = true;
    void getFavoriteDisciplines()
      .then((ids) => {
        if (active) setFavoriteDisciplineIds(ids);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void getMySubscription()
      .then((subscription) => {
        if (active) setHasActivePackage(!!subscription && ['active', 'warning'].includes(cardStatus(subscription.status, subscription.endDate)));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function handleToggleFavorite(disciplineId: number) {
    try {
      const updated = await toggleFavoriteDiscipline(disciplineId);
      setFavoriteDisciplineIds(updated);
    } catch {
      // Handled gracefully in favoriteDisciplinesApi
    }
  }

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
        const [nextWaitlists, nextEnrollments] = await Promise.all([
          getMyWaitlists(),
          getMyEnrollments(),
        ]);
        if (active) {
          setWaitlists(nextWaitlists ?? []);
          setEnrollments(nextEnrollments ?? []);
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

  async function handleEnroll(session: ClassSessionDto, waitlistId?: number) {
    const key = `session-${session.id}`;
    if (busyRef.current || !myScheduleReady) return;
    const overlap = findOverlappingEnrollment(
      session,
      enrollments.filter((item) => item.status === 'booked' || item.status === 'enrolled'),
      sessions,
    );
    if (overlap) {
      
      setActionError(
        `Trùng giờ học: Bạn đã đặt chỗ lớp "${overlap.className}" (${overlap.startTime}–${overlap.endTime}) ngày ${formatShortDate(session.sessionDate)}. Không thể đặt hai lớp học chồng chéo thời gian.`,
      );
      return;
    }
    busyRef.current = key;
    setBusyKey(key);
    const gen = ++actionGenRef.current;
    
    setActionError('');
    try {
      if (waitlistId === undefined) await enroll(session.id);
      else await enroll(session.id, waitlistId);
      if (actionGenRef.current === gen) {
        notify(`Đã đặt chỗ lớp "${session.className}" (${formatShortDate(session.sessionDate)} • ${session.startTime.slice(0, 5)}) thành công!`, 'success');
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

  async function handleJoinWaitlist(session: ClassSessionDto) {
    const key = `session-${session.id}`;
    if (busyRef.current || !myScheduleReady) return;
    const overlap = findOverlappingEnrollment(
      session,
      enrollments.filter((item) => item.status === 'booked' || item.status === 'enrolled'),
      sessions,
    );
    if (overlap) {
      
      setActionError(
        `Trùng giờ học: Bạn đã đặt chỗ lớp "${overlap.className}" (${overlap.startTime}–${overlap.endTime}) ngày ${formatShortDate(session.sessionDate)}. Không thể tham gia hàng chờ lớp trùng giờ.`,
      );
      return;
    }
    busyRef.current = key;
    setBusyKey(key);
    const gen = ++actionGenRef.current;
    
    setActionError('');
    try {
      await joinWaitlist(session.id);
      if (actionGenRef.current === gen) {
        notify(`Đã tham gia hàng chờ lớp "${session.className}". Hệ thống sẽ tự động đôn chỗ khi có học viên hủy lịch.`, 'success');
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
        notify(`Đã hủy đặt chỗ lớp "${className}".`, 'success');
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

  async function handleLeaveWaitlist(waitlistId: number, className: string) {
    const key = `waitlist-${waitlistId}`;
    if (busyRef.current || !myScheduleReady) return;
    busyRef.current = key;
    setBusyKey(key);
    const gen = ++actionGenRef.current;
    
    setActionError('');
    try {
      await leaveWaitlist(waitlistId);
      if (actionGenRef.current === gen) {
        notify(`Đã rút khỏi hàng chờ lớp "${className}".`, 'success');
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

  const weekRange = currentWeek(weekOffset);
  const disciplines = [...new Set([...DISCIPLINES.map(item => item.name), ...sessions.map((item) => item.disciplineName).filter(Boolean)])];
  const disciplineNameToId: Record<string, number> = {};
  for (const item of sessions) {
    if (item.disciplineName && item.disciplineId) disciplineNameToId[item.disciplineName] = item.disciplineId;
  }
  const visible = filterSessions(sessions, discipline, day)
    .filter((item) => !showOnlyFavorites || favoriteDisciplineIds.includes(item.disciplineId))
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate) || a.startTime.localeCompare(b.startTime));
  const myScheduleReady = !myScheduleLoading && !myScheduleError;
  const activeEnrollments = myScheduleReady ? enrollments.filter((item) => item.status === 'booked' || item.status === 'enrolled') : [];
  const activeWaitlists = myScheduleReady ? waitlists.filter((item) => item.status === 'waiting' || item.status === 'notified') : [];

  return (
    <div className="portal-container member-classes">
      <PageHeader
        eyebrow="Hội viên"
        title="Lịch học & đặt chỗ"
        subtitle="Đặt lịch tập cùng Huấn luyện viên, quản lý chỗ ngồi và danh sách chờ tự động theo thời gian thực."
      />

      <div className="portal-tabs" role="tablist" aria-label="Lịch học" style={{ marginBottom: 18 }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'schedule'}
          className={`portal-tab ${tab === 'schedule' ? 'active' : ''}`}
          onClick={() => {
            handleSelectTab('schedule');
          }}
        >
          Lịch lớp học
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'my'}
          className={`portal-tab ${tab === 'my' ? 'active' : ''}`}
          onClick={() => {
            handleSelectTab('my');
          }}
        >
          Lịch học của tôi {(activeEnrollments.length + activeWaitlists.length) > 0 ? `(${activeEnrollments.length + activeWaitlists.length})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'coach_booking'}
          className={`portal-tab ${tab === 'coach_booking' ? 'active' : ''}`}
          onClick={() => handleSelectTab('coach_booking')}
        >
          Đặt lịch HLV 1:1 (PT)
        </button>
      </div>

      {actionError && (
        <div className="portal-card" role="alert" style={{ marginBottom: 16, borderColor: 'rgba(180, 60, 60, 0.35)' }}>
          <strong style={{ color: 'var(--portal-danger, #fca5a5)' }}>{actionError}</strong>
          <div style={{ marginTop: 8 }}>
            <Link to="/member/packages" className="btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
              Kiểm tra gói tập của tôi
            </Link>
          </div>
        </div>
      )}

      {tab === 'coach_booking' ? (
        <MemberCoachBookingView onBookingSuccess={() => { setRetry(v => v + 1); setMyScheduleRetry(v => v + 1); }} />
      ) : tab === 'schedule' ? (
        <div>
          {myScheduleError && (
            <div className="portal-card portal-empty" role="alert" style={{ marginBottom: 16 }}>
              <h3>Không tải được lịch học của tôi</h3>
              <p>{myScheduleError} Chưa thể xác nhận trạng thái đặt chỗ của bạn.</p>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setMyScheduleRetry(value => value + 1)}>
                Thử lại lịch học của tôi
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
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <p className="row-card__meta" style={{ margin: 0 }}>
                📅 Lịch học từ <strong>{formatShortDate(weekRange.fromDate)}</strong> đến <strong>{formatShortDate(weekRange.toDate)}</strong> (Thứ 2–Chủ nhật)
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={`filter-chip ${weekOffset === 0 ? 'is-active' : ''}`}
                  onClick={() => {
                    clearActionFeedback();
                    setWeekOffset(0);
                  }}
                >
                  Tuần này
                </button>
                <button
                  type="button"
                  className={`filter-chip ${weekOffset === 1 ? 'is-active' : ''}`}
                  onClick={() => {
                    clearActionFeedback();
                    setWeekOffset(1);
                  }}
                >
                  Tuần kế tiếp
                </button>
              </div>
            </div>

            <div className="filter-chips" role="group" aria-label="Lọc theo bộ môn">
              <button
                type="button"
                className={`filter-chip ${showOnlyFavorites ? 'is-active' : ''}`}
                aria-pressed={showOnlyFavorites}
                onClick={() => {
                  clearActionFeedback();
                  setShowOnlyFavorites((prev) => !prev);
                  setDiscipline('ALL');
                }}
              >
                ⭐ Bộ môn yêu thích {favoriteDisciplineIds.length > 0 ? `(${favoriteDisciplineIds.length})` : ''}
              </button>
              {['ALL', ...disciplines].map((value) => {
                const discId = disciplineNameToId[value];
                const isFav = discId ? favoriteDisciplineIds.includes(discId) : false;
                return (
                  <div key={value} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                    <button
                      type="button"
                      className={`filter-chip ${discipline === value && !showOnlyFavorites ? 'is-active' : ''}`}
                      aria-pressed={discipline === value && !showOnlyFavorites}
                      onClick={() => {
                        clearActionFeedback();
                        setShowOnlyFavorites(false);
                        setDiscipline(value);
                      }}
                    >
                      {value === 'ALL' ? 'Tất cả bộ môn' : value}
                    </button>
                    {value !== 'ALL' && discId && (
                      <button
                        type="button"
                        className="btn-favorite-star"
                        title={isFav ? `Bỏ yêu thích ${value}` : `Yêu thích ${value}`}
                        aria-label={`Yêu thích ${value}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleToggleFavorite(discId);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 15,
                          minWidth: 32,
                          minHeight: 32,
                          padding: '2px 4px',
                          marginLeft: -4,
                          color: isFav ? '#f59e0b' : 'var(--portal-muted, #9ca3af)',
                        }}
                      >
                        {isFav ? '★' : '☆'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingTop: 10, borderTop: '1px solid var(--portal-border, #e4e2de)' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <label htmlFor="member-classes-day" className="meta-label">Thứ trong tuần</label>
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
                  {days.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </div>
              {hasActivePackage === false && (
                <p className="row-card__meta" style={{ margin: 0 }}>
                  Cần gói tập đang hoạt động để đặt chỗ. <Link className="member-classes-package-link" to="/member/packages">Xem gói tập</Link>
                </p>
              )}
            </div>
          </div>

          {loading ? (
          <div className="stack" role="status" aria-busy="true">
            <span className="sr-only">Đang tải lịch học...</span>
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
          <div className="portal-card portal-empty" role="alert">
            <h3>Không tải được lịch học</h3>
            <p>{error}</p>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setRetry((value) => value + 1)}>
              Thử lại
            </button>
          </div>
        ) : (
          <div className="stack" id="member-class-results">
            {sessions.length === 0 ? (
              <div className="portal-card portal-empty">
                <h3>Chưa có lịch học</h3>
                <p>Chưa có buổi học nào trong tuần này. Bạn có thể chuyển sang xem lịch tuần kế tiếp.</p>
                {weekOffset === 0 && (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      clearActionFeedback();
                      setWeekOffset(1);
                    }}
                  >
                    Xem lịch tuần kế tiếp
                  </button>
                )}
              </div>
            ) : visible.length === 0 ? (
              <div className="portal-card portal-empty">
                <h3>Không có buổi học phù hợp</h3>
                <p>Hãy thử bộ lọc khác.</p>
              </div>
            ) : (
              <>{visible.slice(0, visibleCount).map((item, index) => {
                const [year, month, date] = item.sessionDate.split('-');
                const now = new Date();
                const past =
                  item.sessionDate < localToday() ||
                  (item.sessionDate === localToday() && item.startTime.slice(0, 5) <= now.toTimeString().slice(0, 5));
                const unavailable = past || item.status !== 'scheduled';
                const overlap = findOverlappingEnrollment(item, activeEnrollments, sessions);
                const myEnrollment = activeEnrollments.find(
                  (e) => e.sessionId === item.id || (e.sessionId === null && e.classId === item.classId),
                );
                const myWaitlist = activeWaitlists.find((w) => w.classId === item.classId);
                const isBusy = busyKey === `session-${item.id}` ||
                  (myEnrollment ? busyKey === `enroll-${myEnrollment.id}` : false) ||
                  (myWaitlist ? busyKey === `waitlist-${myWaitlist.id}` : false);

                return (
                  <div key={item.id} className="portal-card portal-card--list member-class-session">
                    <div>
                      {(index === 0 || visible[index - 1].sessionDate !== item.sessionDate) && <h4 data-testid={`day-group-${item.sessionDate}`}>{formatDayGroupLabel(item.sessionDate)}</h4>}
                      <div className="row-card__meta row-card__meta--inline">
                        <span className="badge badge-info">{item.disciplineName}</span>
                        {overlap && <span className="badge badge-warning" data-testid={`overlap-badge-${item.id}`}>Trùng giờ đã đặt</span>}
                        <span><PortalIcon name="calendar" size={14} />{date}/{month}/{year}</span>
                        {myEnrollment && (
                          <span className="badge badge-success">Đã đặt chỗ</span>
                        )}
                        {!myEnrollment && myWaitlist && (
                          <span className="badge badge-warning">{myWaitlist.status === 'notified' ? 'Đang giữ chỗ' : 'Đang chờ chỗ'}</span>
                        )}
                      </div>
                      <h3 className="row-card__title">{item.className}</h3>
                      <div className="row-card__meta row-card__meta--inline">
                        <span><strong>{item.startTime.slice(0, 5)}–{item.endTime.slice(0, 5)}</strong></span>
                        <span><PortalIcon name="building" size={14} />{item.roomName}</span>
                        <span><PortalIcon name="profile" size={14} />{item.coachName.trim().toLowerCase().startsWith('hlv') ? item.coachName : `HLV ${item.coachName}`}</span>
                      </div>
                      <div className="row-card__meta">
                        Trạng thái: {past ? 'Đã qua giờ mở lớp' : item.status === 'scheduled' ? 'Đã lên lịch' : item.status === 'cancelled' ? 'Đã hủy' : item.status}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="meta-label">SĨ SỐ HIỆN TẠI</div>
                      <strong>{item.bookedCount} / {item.capacity} học viên</strong>
                      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {!myScheduleReady ? <button type="button" className="btn-secondary btn-sm" disabled>
                          {myScheduleLoading ? 'Đang kiểm tra đặt chỗ...' : 'Chưa thể kiểm tra đặt chỗ'}
                        </button> : myEnrollment ? (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            disabled={isBusy || past}
                            onClick={(event) => { cancelFocusRef.current = event.currentTarget; setCancelTarget({ id: myEnrollment.id, className: item.className }); }}
                          >
                            {isBusy ? 'Đang xử lý...' : 'Hủy đặt chỗ'}
                          </button>
                        ) : myWaitlist ? (
                          <>
                            {myWaitlist.status === 'notified' && (
                              <button
                                type="button"
                                className="btn-primary btn-sm"
                                disabled={isBusy || unavailable}
                                onClick={() => void handleEnroll(item, myWaitlist.id)}
                              >
                                {isBusy ? 'Đang xác nhận...' : 'Xác nhận chỗ'}
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              disabled={isBusy}
                              onClick={() => void handleLeaveWaitlist(myWaitlist.id, item.className)}
                            >
                              {isBusy ? 'Đang xử lý...' : 'Rút khỏi hàng chờ'}
                            </button>
                          </>
                        ) : overlap ? <button type="button" className="btn-secondary btn-sm" data-testid={`overlap-btn-${item.id}`} disabled>Trùng giờ đã đặt</button> : unavailable ? (
                          <button type="button" className="btn-secondary btn-sm" disabled>
                            Không thể đặt
                          </button>
                        ) : item.bookedCount < item.capacity ? (
                          <button
                            type="button"
                            className="btn-primary member-class-enroll"
                            aria-label={`${isBusy ? 'Đang đặt chỗ' : 'Đặt chỗ ngay'}: ${item.className}`}
                            title={`Đặt chỗ ngay: ${item.className}`}
                            disabled={isBusy}
                            onClick={() => void handleEnroll(item)}
                          >
                            <span aria-hidden="true">+</span><span className="sr-only">{isBusy ? 'Đang đặt chỗ...' : 'Đặt chỗ ngay'}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            disabled={isBusy}
                            onClick={() => void handleJoinWaitlist(item)}
                          >
                            {isBusy ? 'Đang đăng ký...' : 'Tham gia hàng chờ'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="member-classes-more">
                <p role="status">Hiển thị {Math.min(visibleCount, visible.length)} / {visible.length} buổi học</p>
                {visibleCount < visible.length && <button type="button" className="btn-secondary" aria-controls="member-class-results" onClick={() => setVisibleCount(count => count + SESSION_BATCH_SIZE)}>Xem thêm ({visible.length - visibleCount})</button>}
              </div></>
            )}
          </div>)}
        </div>
      ) : (
        <div className="stack">
          {myScheduleLoading ? (
            <div className="stack" role="status" aria-busy="true">
              <span className="sr-only">Đang tải lịch học của tôi...</span>
              {[1, 2].map((idx) => (
                <div key={idx} className="portal-card portal-card--list" aria-hidden="true">
                  <div style={{ flex: 1 }}>
                    <div className="portal-skeleton-line" style={{ width: '48%', height: 20, marginBottom: 10 }} />
                    <div className="portal-skeleton-line" style={{ width: '65%', height: 14 }} />
                  </div>
                  <div className="portal-skeleton-line" style={{ width: 120, height: 34 }} />
                </div>
              ))}
            </div>
          ) : myScheduleError ? (
            <div className="portal-card portal-empty" role="alert">
              <h3>Không tải được lịch học của tôi</h3>
              <p>{myScheduleError}</p>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setMyScheduleRetry((value) => value + 1)}
              >
                Thử lại lịch học của tôi
              </button>
            </div>
          ) : activeEnrollments.length === 0 && activeWaitlists.length === 0 ? (
            <div className="portal-card portal-empty">
              <h3>Chưa có lịch học đã đặt</h3>
              <p>Bạn chưa đặt chỗ buổi học nào hoặc chưa tham gia hàng chờ. Hãy chọn buổi học phù hợp tại tab Lịch lớp học.</p>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  clearActionFeedback();
                  setTab('schedule');
                }}
              >
                Xem lịch lớp học
              </button>
            </div>
          ) : (
            <>
              {activeEnrollments.length > 0 && (
                <>
                  <h3 className="row-card__title">Buổi học đã đặt chỗ ({activeEnrollments.length})</h3>
                  {activeEnrollments.map((item) => (
                    <div key={item.id} className="portal-card portal-card--list">
                      <div>
                        <div className="row-card__meta row-card__meta--inline">
                          <span className="badge badge-success">Đã xác nhận chỗ</span>
                          {item.sessionDate && <span><PortalIcon name="calendar" size={14} />Ngày học: {formatShortDate(item.sessionDate)}</span>}
                        </div>
                        <h3 className="row-card__title">{item.className}</h3>
                        <div className="row-card__meta row-card__meta--inline">
                          {item.startTime && item.endTime && <span>Khung giờ: <strong>{item.startTime.slice(0, 5)}–{item.endTime.slice(0, 5)}</strong></span>}
                          <span>Đăng ký lúc: {item.enrolledAt.replace('T', ' ').slice(0, 16)}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={busyKey === `enroll-${item.id}`}
                          onClick={(event) => { cancelFocusRef.current = event.currentTarget; setCancelTarget({ id: item.id, className: item.className }); }}
                        >
                          {busyKey === `enroll-${item.id}` ? 'Đang hủy...' : 'Hủy đặt chỗ'}
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {activeWaitlists.length > 0 && (
                <>
                  <h3 className="row-card__title">Hàng chờ của tôi ({activeWaitlists.length})</h3>
                  {activeWaitlists.map((item) => (
                    <div key={item.id} className="portal-card portal-card--list">
                      <div>
                        <div className="row-card__meta">
                          <span className="badge badge-warning">
                            {item.status === 'waiting' ? 'Đang chờ trống chỗ' : 'Đã được thông báo'}
                          </span>
                        </div>
                        <h3 className="row-card__title">{item.className}</h3>
                        <div className="row-card__meta row-card__meta--inline">
                          <span>Đăng ký chờ lúc: {item.requestedAt.replace('T', ' ').slice(0, 16)}</span>
                          <span>Tự động đôn lên khi có học viên hủy chỗ</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={busyKey === `waitlist-${item.id}`}
                          onClick={() => void handleLeaveWaitlist(item.id, item.className)}
                        >
                          {busyKey === `waitlist-${item.id}` ? 'Đang xử lý...' : 'Rút khỏi hàng chờ'}
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
      {cancelTarget && (
        <Modal title="Hủy đặt chỗ?" onClose={() => setCancelTarget(null)} returnFocusRef={cancelFocusRef}>
          <p className="row-card__meta">Bạn có chắc muốn hủy đặt chỗ lớp {cancelTarget.className}?</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
            <button type="button" className="btn-secondary" onClick={() => setCancelTarget(null)}>Giữ đặt chỗ</button>
            <button type="button" className="btn-primary" onClick={() => { const target = cancelTarget; setCancelTarget(null); void handleCancelEnrollment(target.id, target.className); }}>Xác nhận hủy</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
