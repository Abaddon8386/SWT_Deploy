import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../../../shared/ui/Modal';
import { notify } from '../../../shared/lib/portalNotices';
import { matchesDiscipline } from '../../../shared/lib/disciplines';
import { errorMessage } from '../../../shared/lib/errorMessage';
import { WeeklyTimetable } from '../../schedule/WeeklyTimetable';
import {
  addDays, hhmm, mondayOf, shortDate, todayISO, toMinutes, weekdayLabel, type TimetableEvent,
} from '../../schedule/timetable';
import {
  bookSession, cancelBooking, cancelEnrollment, getMyEnrollments, getMyBookingsBetween, getSessionsBetween,
  type ClassSessionDto, type EnrollmentDto, type SessionBookingDto,
} from '../memberClassesApi';

interface MemberTimetableProps {
  /** Bộ môn đang lọc ('ALL' = tất cả). */
  discipline: string;
  /** Gọi sau khi đặt/hủy để các tab khác tải lại. */
  onBookingChange: () => void;
}

type Seat = { kind: 'booking' | 'enrollment'; id: number };

function isPast(session: ClassSessionDto, now = new Date()): boolean {
  const today = todayISO(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return session.sessionDate < today || (session.sessionDate === today && toMinutes(session.endTime) <= nowMinutes);
}

export function MemberTimetable({ discipline, onBookingChange }: MemberTimetableProps) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayISO()));
  const [sessions, setSessions] = useState<ClassSessionDto[]>([]);
  const [bookings, setBookings] = useState<SessionBookingDto[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const to = addDays(weekStart, 6);
        const [nextSessions, nextBookings, nextEnrollments] = await Promise.all([
          getSessionsBetween(weekStart, to),
          getMyBookingsBetween(weekStart, to),
          getMyEnrollments(),
        ]);
        if (!active) return;
        setSessions(nextSessions ?? []);
        setBookings((nextBookings ?? []).filter((item) => item.status !== 'cancelled'));
        setEnrollments(nextEnrollments ?? []);
      } catch (cause) {
        if (active) setError(errorMessage(cause, 'Không thể tải thời khóa biểu.'));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [weekStart, retry]);

  const seatOf = useCallback((session: ClassSessionDto): Seat | null => {
    const booking = bookings.find((item) => item.sessionId === session.id && item.status === 'booked');
    if (booking) return { kind: 'booking', id: booking.id };
    const enrollment = enrollments.find((item) =>
      (item.status === 'booked' || item.status === 'enrolled')
      && (item.sessionId === session.id || (item.sessionId === null && item.classId === session.classId)));
    return enrollment ? { kind: 'enrollment', id: enrollment.id } : null;
  }, [bookings, enrollments]);

  const visibleSessions = useMemo(
    () => sessions.filter((item) => discipline === 'ALL' || matchesDiscipline(item.disciplineName, discipline)),
    [sessions, discipline],
  );

  const events: TimetableEvent[] = useMemo(() => visibleSessions.map((session) => {
    const mine = seatOf(session) !== null;
    const past = isPast(session);
    const full = session.bookedCount >= session.capacity;
    const tone: TimetableEvent['tone'] = session.status === 'cancelled' ? 'cancelled'
      : mine ? 'mine'
      : past ? 'past'
      : full ? 'full'
      : 'open';
    const statusText = tone === 'cancelled' ? 'đã hủy' : tone === 'mine' ? 'bạn đã đặt chỗ' : tone === 'past' ? 'đã qua' : tone === 'full' ? 'đã đầy' : 'còn chỗ';
    return {
      id: String(session.id),
      date: session.sessionDate,
      startTime: session.startTime,
      endTime: session.endTime,
      title: session.className,
      meta: [session.roomName, session.coachName].filter(Boolean).join(' · ') || undefined,
      badge: tone === 'mine' ? 'Đã đặt' : tone === 'cancelled' ? 'Đã hủy' : tone === 'full' ? 'Đầy' : `${session.bookedCount}/${session.capacity}`,
      tone,
      ariaLabel: `${session.className}, ${shortDate(session.sessionDate)} ${hhmm(session.startTime)}–${hhmm(session.endTime)}, ${session.roomName}, ${statusText}. Bấm để xem và đặt chỗ`,
    };
  }), [visibleSessions, seatOf]);

  const selected = selectedId === null ? null : sessions.find((item) => item.id === selectedId) ?? null;
  const selectedSeat = selected ? seatOf(selected) : null;
  const overlap = selected && !selectedSeat
    ? sessions.find((other) => other.id !== selected.id && other.sessionDate === selected.sessionDate
      && seatOf(other) !== null && other.status !== 'cancelled'
      && toMinutes(other.startTime) < toMinutes(selected.endTime) && toMinutes(other.endTime) > toMinutes(selected.startTime))
    : undefined;
  const past = selected ? isPast(selected) : false;
  const full = selected ? selected.bookedCount >= selected.capacity : false;

  function closeDialog() {
    if (busy) return;
    setSelectedId(null);
    setConfirmCancel(false);
    setDialogError('');
  }

  async function handleBook() {
    if (!selected || busy) return;
    setBusy(true);
    setDialogError('');
    try {
      await bookSession(selected.id);
      notify(`Đã đặt chỗ lớp "${selected.className}" (${shortDate(selected.sessionDate)} • ${hhmm(selected.startTime)}) thành công.`, 'success');
      setSelectedId(null);
      setRetry((value) => value + 1);
      onBookingChange();
    } catch (cause) {
      setDialogError(errorMessage(cause, 'Không thể đặt chỗ.'));
      setRetry((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!selected || !selectedSeat || busy) return;
    setBusy(true);
    setDialogError('');
    try {
      if (selectedSeat.kind === 'booking') await cancelBooking(selectedSeat.id);
      else await cancelEnrollment(selectedSeat.id);
      notify(`Đã hủy chỗ lớp "${selected.className}".`, 'success');
      setSelectedId(null);
      setConfirmCancel(false);
      setRetry((value) => value + 1);
      onBookingChange();
    } catch (cause) {
      setDialogError(errorMessage(cause, 'Không thể hủy chỗ.'));
      setRetry((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  const blockReason = selectedSeat ? null
    : selected?.status === 'cancelled' ? 'Buổi học này đã bị hủy.'
    : past ? 'Buổi học đã diễn ra hoặc đã bắt đầu nên không thể đặt chỗ.'
    : full ? 'Buổi học đã đầy chỗ.'
    : overlap ? `Trùng giờ với lớp "${overlap.className}" bạn đã đặt (${hhmm(overlap.startTime)}–${hhmm(overlap.endTime)}).`
    : null;

  return (
    <>
      <WeeklyTimetable
        label="Thời khóa biểu tuần"
        weekStart={weekStart}
        events={events}
        loading={loading}
        error={error}
        onRetry={() => setRetry((value) => value + 1)}
        onWeekChange={setWeekStart}
        onEventClick={(id) => { returnFocusRef.current = document.activeElement as HTMLElement | null; setSelectedId(Number(id)); setConfirmCancel(false); setDialogError(''); }}
        legendNote="Số trên khối: đã đặt / sức chứa"
        legend={[
          { tone: 'mine', label: 'Lịch của tôi (đã đặt chỗ)' },
          { tone: 'open', label: 'Còn chỗ, bấm để đặt' },
          { tone: 'full', label: 'Đã đầy' },
          { tone: 'past', label: 'Đã qua' },
          { tone: 'cancelled', label: 'Đã hủy' },
        ]}
      />

      {selected && (
        <Modal title={selected.className} onClose={closeDialog} busy={busy} returnFocusRef={returnFocusRef}>
          <div className="kv-list">
            <div className="kv-row"><span>Bộ môn</span><strong>{selected.disciplineName}</strong></div>
            <div className="kv-row"><span>Thời gian</span><strong>{weekdayLabel(selected.sessionDate)} {shortDate(selected.sessionDate)} · {hhmm(selected.startTime)}–{hhmm(selected.endTime)}</strong></div>
            <div className="kv-row"><span>Phòng tập</span><strong>{selected.roomName}</strong></div>
            <div className="kv-row"><span>Huấn luyện viên</span><strong>{selected.coachName}</strong></div>
            <div className="kv-row"><span>Sĩ số</span><strong>{selected.bookedCount} / {selected.capacity} học viên</strong></div>
            <div className="kv-row"><span>Trạng thái của bạn</span><strong>{selectedSeat ? 'Đã đặt chỗ' : 'Chưa đặt chỗ'}</strong></div>
          </div>
          {blockReason && <p className="row-card__meta" role="status">{blockReason}</p>}
          {dialogError && <div className="form-error" role="alert">{dialogError}</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button type="button" className="btn-secondary" onClick={closeDialog} disabled={busy}>Đóng</button>
            {selectedSeat ? (
              confirmCancel ? (
                <>
                  <button type="button" className="btn-secondary" onClick={() => setConfirmCancel(false)} disabled={busy}>Giữ chỗ</button>
                  <button type="button" className="btn-danger" onClick={() => void handleCancel()} disabled={busy}>
                    {busy ? 'Đang hủy...' : 'Xác nhận hủy'}
                  </button>
                </>
              ) : (
                <button type="button" className="btn-secondary" disabled={busy || past} onClick={() => setConfirmCancel(true)}>
                  {selectedSeat.kind === 'booking' ? 'Hủy buổi này' : 'Hủy đặt chỗ'}
                </button>
              )
            ) : (
              <button type="button" className="btn-primary" disabled={busy || blockReason !== null} onClick={() => void handleBook()}>
                {busy ? 'Đang đặt...' : 'Đặt chỗ'}
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
