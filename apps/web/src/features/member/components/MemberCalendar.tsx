import { memberError, memberRenderMessage, memberNotify, memberMessage } from '../memberI18n';
import type { SourceMessage } from '../../../shared/i18n/language';
import { useLanguage } from '../../../shared/i18n/language';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../../../shared/ui/Modal';
import { centerNowParts } from '../../../shared/lib/centerTime';
import { courtsApi, type CourtBooking } from '../../courts/courtsApi';
import {
  addDays, blockClass, fitHourRange, hhmm, hourLabel, layoutDayEvents, mondayOf, parseISODate, shortDate, toMinutes,
  weekDays, weekdayLabel, type TimetableEvent,
} from '../../schedule/timetable';
import {
  cancelBooking, cancelEnrollment, getMyBookingsBetween, getMyEnrollments, getSessionsBetween,
  type ClassSessionDto,
} from '../memberClassesApi';
import '../../schedule/calendar.css';
import './MemberCalendar.css';

type View = 'week' | 'month';
type Kind = 'court' | 'class';

export interface CalendarEvent extends TimetableEvent {
  kind: Kind;
  place: string;
  coach?: string;
  cancelled: boolean;
  /** Chỗ của hội viên để hủy: lượt đặt buổi, ghi danh lớp hoặc lượt đặt sân. */
  seat: { type: 'booking' | 'enrollment' | 'court'; id: number };
}

const HOUR_PX = 76;
const COURT_PAGE_LIMIT = 5;
const MINUTE_MS = 60_000;
const WEEKDAY_HEAD = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

function centerNow() {
  const { date, time } = centerNowParts();
  return { date, minutes: toMinutes(time) };
}

function useCenterNow() {
  const [now, setNow] = useState(centerNow);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(centerNow()), MINUTE_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function useNarrow(): boolean {
  const query = "(max-width: 767px)";
  const read = () => typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, []);
  return matches;
}

function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

function addMonths(iso: string, months: number) {
  const date = parseISODate(monthStart(iso));
  date.setMonth(date.getMonth() + months);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Khoảng ngày đang xem: một tuần, hoặc 6 hàng tuần phủ trọn tháng. */
function rangeOf(view: View, anchor: string): { from: string; to: string } {
  if (view === 'week') {
    const from = mondayOf(anchor);
    return { from, to: addDays(from, 6) };
  }
  const from = mondayOf(monthStart(anchor));
  return { from, to: addDays(from, 41) };
}

function rangeLabel(view: View, anchor: string, english = false) {
  if (view === 'month') {
    const [year, month] = anchor.split('-');
    return `${english ? "Month" : "Tháng"} ${Number(month)}/${year}`;
  }
  const from = mondayOf(anchor);
  const to = addDays(from, 6);
  return `${shortDate(from)} - ${shortDate(to)}/${to.slice(0, 4)}`;
}

function isEnded(event: Pick<CalendarEvent, 'date' | 'endTime'>, now: { date: string; minutes: number }) {
  return event.date < now.date || (event.date === now.date && toMinutes(event.endTime) <= now.minutes);
}

function countdown(event: CalendarEvent, now: { date: string; minutes: number }, english = false) {
  const days = Math.round((parseISODate(event.date).getTime() - parseISODate(now.date).getTime()) / 86_400_000);
  const total = days * 1440 + toMinutes(event.startTime) - now.minutes;
  if (total <= 0) return english ? 'in progress' : 'đang diễn ra';
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (english) return d > 0 ? `in ${d}d${h > 0 ? ` ${h}h` : ''}` : h > 0 ? `in ${h}h${m > 0 ? ` ${m}m` : ''}` : `in ${m}m`;
  if (d > 0) return `còn ${d} ngày${h > 0 ? ` ${h} giờ` : ''}`;
  if (h > 0) return `còn ${h} giờ${m > 0 ? ` ${m} phút` : ''}`;
  return `còn ${m} phút`;
}

function weekdayShort(iso: string) {
  return weekdayLabel(iso).replace('Thứ ', 'T').replace('Chủ nhật', 'CN');
}

function sortEvents(events: CalendarEvent[]) {
  return [...events].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
}

function classEvent(
  id: string, date: string, startTime: string, endTime: string, title: string, place: string,
  coach: string | undefined, cancelled: boolean, seat: CalendarEvent['seat'],
): CalendarEvent {
  return {
    id, kind: 'class', date, startTime, endTime, title, place, coach, cancelled, seat, tone: 'neutral',
    ariaLabel: `Buổi học ${title}, ${weekdayLabel(date)} ${shortDate(date)}, ${hhmm(startTime)}–${hhmm(endTime)}${place ? `, ${place}` : ''}${cancelled ? ', đã hủy' : ''}`,
  };
}

function courtEvent(booking: CourtBooking): CalendarEvent {
  const title = `Đặt sân ${booking.disciplineName}`;
  return {
    id: `court-${booking.id}`, kind: 'court', date: booking.date, startTime: booking.startTime, endTime: booking.endTime,
    title, place: booking.roomName, cancelled: false, seat: { type: 'court', id: booking.id }, tone: 'neutral',
    ariaLabel: `${title}, ${weekdayLabel(booking.date)} ${shortDate(booking.date)}, ${hhmm(booking.startTime)}–${hhmm(booking.endTime)}, ${booking.roomName}`,
  };
}

/** Buổi học của hội viên trong khoảng ngày: lượt đặt từng buổi (gồm buổi đã qua) và ghi danh cả lớp. */
async function loadClassEvents(from: string, to: string): Promise<CalendarEvent[]> {
  const [sessions, bookings, enrollments] = await Promise.all([
    getSessionsBetween(from, to), getMyBookingsBetween(from, to), getMyEnrollments(),
  ]);
  const sessionById = new Map<number, ClassSessionDto>((sessions ?? []).map((item) => [item.id, item]));
  const bySession = new Map<number, CalendarEvent>();

  for (const booking of bookings ?? []) {
    if (booking.status === 'cancelled' || booking.sessionDate < from || booking.sessionDate > to) continue;
    const session = sessionById.get(booking.sessionId);
    bySession.set(booking.sessionId, classEvent(
      `class-${booking.sessionId}`, booking.sessionDate, booking.startTime, booking.endTime, booking.className,
      booking.roomName ?? session?.roomName ?? '', booking.coachName ?? session?.coachName,
      session?.status === 'cancelled', { type: 'booking', id: booking.id },
    ));
  }

  for (const enrollment of enrollments ?? []) {
    if (enrollment.status !== 'booked' && enrollment.status !== 'enrolled') continue;
    const matches = enrollment.sessionId !== null
      ? [sessionById.get(enrollment.sessionId)].filter((item): item is ClassSessionDto => Boolean(item))
      : (sessions ?? []).filter((item) => item.classId === enrollment.classId);
    for (const session of matches) {
      if (bySession.has(session.id)) continue;
      bySession.set(session.id, classEvent(
        `class-${session.id}`, session.sessionDate, session.startTime, session.endTime, session.className,
        session.roomName, session.coachName, session.status === 'cancelled', { type: 'enrollment', id: enrollment.id },
      ));
    }
    // Buổi đã qua không còn trong danh sách buổi công khai: dựng lại từ chính lượt ghi danh.
    if (matches.length === 0 && enrollment.sessionId !== null && enrollment.sessionDate && enrollment.startTime && enrollment.endTime
      && enrollment.sessionDate >= from && enrollment.sessionDate <= to && !bySession.has(enrollment.sessionId)) {
      bySession.set(enrollment.sessionId, classEvent(
        `class-${enrollment.sessionId}`, enrollment.sessionDate, enrollment.startTime, enrollment.endTime, enrollment.className,
        '', undefined, false, { type: 'enrollment', id: enrollment.id },
      ));
    }
  }
  return [...bySession.values()];
}

/** Toàn bộ lượt đặt sân còn hiệu lực của hội viên (API phân trang, đọc tối đa vài trang). */
async function loadCourtBookings(): Promise<CourtBooking[]> {
  const first = await courtsApi.my(0);
  const pages = Math.min(first?.totalPages ?? 1, COURT_PAGE_LIMIT);
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, index) => courtsApi.my(index + 1)));
  return [first, ...rest].flatMap((page) => page?.content ?? []).filter((item) => item.status === 'booked');
}

interface MemberCalendarProps {
  /** Gọi sau khi hủy để các tab khác tải lại. */
  onBookingChange?: () => void;
}

export function MemberCalendar({ onBookingChange }: MemberCalendarProps) {
  const { lang } = useLanguage();
  const labels = lang === 'en'
    ? { thisWeek: 'This week', court: 'Court / room', class: 'Class session', empty: 'No bookings this week.' }
    : { thisWeek: 'Tuần này', court: 'Đặt sân / phòng', class: 'Buổi học', empty: 'Tuần này bạn chưa có lịch nào.' };
  const english = lang === 'en';
  const text = (vi: string, en: string) => english ? en : vi;
  const dayLabel = (day: string) => english ? new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(parseISODate(day)) : weekdayLabel(day);
  const title = (event: CalendarEvent) => english && event.kind === 'court' ? event.title.replace('Đặt sân ', 'Court booking ') : event.title;
  const eventLabel = (event: CalendarEvent) => [labels[event.kind], title(event), dayLabel(event.date), shortDate(event.date), hhmm(event.startTime) + '–' + hhmm(event.endTime), event.place, event.cancelled ? text('đã hủy', 'cancelled') : ''].filter(Boolean).join(', ');
  const weekdayHead = english ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] : WEEKDAY_HEAD;
  const now = useCenterNow();
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(now.date);
  const [classEvents, setClassEvents] = useState<CalendarEvent[]>([]);
  const [upcomingClasses, setUpcomingClasses] = useState<CalendarEvent[]>([]);
  const [courts, setCourts] = useState<CourtBooking[]>([]);
  const [courtError, setCourtError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | SourceMessage>('');
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | SourceMessage>('');
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { from, to } = rangeOf(view, anchor);
  const today = now.date;

  // Quay lại tab/cửa sổ (ví dụ vừa đặt sân hoặc đặt buổi ở trang khác): tải lại lặng lẽ để lịch mới tự hiện.
  const quietRef = useRef(false);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      quietRef.current = true;
      setRetry((value) => value + 1);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const quiet = quietRef.current;
    quietRef.current = false;
    if (!quiet) setLoading(true);
    setError('');
    loadClassEvents(from, to)
      .then((events) => { if (active) setClassEvents(events); })
      .catch((cause) => { if (active) setError(memberError(cause, 'Không thể tải lịch của bạn.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to, retry]);

  // Lượt đặt sân và buổi học sắp tới (cho thanh "Tiếp theo") không phụ thuộc tuần đang xem.
  useEffect(() => {
    let active = true;
    loadCourtBookings()
      .then((items) => { if (active) { setCourts(items); setCourtError(false); } })
      .catch(() => { if (active) setCourtError(true); });
    loadClassEvents(today, addDays(today, 30))
      .then((events) => { if (active) setUpcomingClasses(events); })
      .catch(() => { if (active) setUpcomingClasses([]); });
    return () => { active = false; };
  }, [retry, today]);

  const courtEvents = useMemo(() => courts.map(courtEvent), [courts]);
  const events = useMemo(
    () => sortEvents([...classEvents, ...courtEvents].filter((item) => item.date >= from && item.date <= to)),
    [classEvents, courtEvents, from, to],
  );
  const nextUp = useMemo(
    () => sortEvents([...upcomingClasses, ...courtEvents]).find((item) => !item.cancelled && !isEnded(item, now)) ?? null,
    [upcomingClasses, courtEvents, now],
  );

  const days = useMemo(() => weekDays(mondayOf(anchor)), [anchor]);
  // Màn hẹp: xem từng ngày, chọn ngày ở dải phía trên.
  const narrow = useNarrow();
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const activeDay = focusDay && days.includes(focusDay) ? focusDay : days.includes(today) ? today : days[0];
  const visibleDays = narrow ? [activeDay] : days;
  const weekEvents = useMemo(() => (view === 'week' ? events : []), [view, events]);
  const hours = useMemo(() => {
    // Ít nhất 14 giờ (ví dụ 07:00–21:00) để thấy vạch "bây giờ"; tuần trống: 07:00–21:00.
    const fitted = fitHourRange(weekEvents, 14);
    return fitted.length >= 16 ? fitted.slice(1, 15) : fitted;
  }, [weekEvents]);
  const firstHour = hours[0];
  const endHour = hours[hours.length - 1] + 1;

  // Đổi tuần: cuộn tới một giờ trước buổi sớm nhất.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || loading || view !== 'week') return;
    const starts = weekEvents.filter((item) => visibleDays.includes(item.date)).map((item) => toMinutes(item.startTime));
    const target = starts.length > 0 ? Math.min(...starts) - 60 : firstHour * 60;
    box.scrollTop = Math.max(0, ((target - firstHour * 60) / 60) * HOUR_PX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, loading, view, activeDay, narrow]);

  function shift(step: number) {
    setFocusDay(null);
    setAnchor((value) => (view === 'week' ? addDays(value, step * 7) : addMonths(value, step)));
  }

  function openEvent(event: CalendarEvent) {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setSelected(event);
    setConfirmCancel(false);
    setDialogError('');
  }

  function closeDialog() {
    if (busy) return;
    setSelected(null);
    setConfirmCancel(false);
    setDialogError('');
  }

  async function handleCancel() {
    if (!selected || busy || selected.seat.type === 'court') return;
    setBusy(true);
    setDialogError('');
    try {
      if (selected.seat.type === 'booking') await cancelBooking(selected.seat.id);
      else await cancelEnrollment(selected.seat.id);
      memberNotify(memberMessage(`Đã hủy chỗ lớp "${selected.title}".`, `Booking for class "${selected.title}" cancelled.`), 'success', { record: true });
      setSelected(null);
      setRetry((value) => value + 1);
      onBookingChange?.();
    } catch (cause) {
      setDialogError(memberError(cause, 'Không thể hủy chỗ.'));
    } finally {
      setBusy(false);
    }
  }

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const item of events) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return map;
  }, [events]);

  const renderDots = (day: string) => {
    const list = eventsByDay.get(day) ?? [];
    const kinds = list.slice(0, 3).map((item) => item.kind);
    return (
      <span className="mcal__dots" aria-hidden="true">
        {kinds.map((kind, index) => <i key={index} className={`mcal__dot mcal__dot--${kind}`} />)}
      </span>
    );
  };

  const selectedEnded = selected ? isEnded(selected, now) : false;
  const isEmpty = !loading && !error && !courtError && events.length === 0;

  return (
    <section data-i18n-managed className="mcal mcal--member"  aria-label={text("Lịch của tôi", "My schedule")}>
      <header className="mcal__toolbar">
        <div className="mcal__nav">
          <button type="button" className="mcal__icon-btn" aria-label={view === 'week' ? text("Tuần trước", 'Previous week') : text("Tháng trước", 'Previous month')} onClick={() => shift(-1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button type="button" className="mcal__icon-btn" aria-label={view === 'week' ? text("Tuần sau", 'Next week') : text("Tháng sau", 'Next month')} onClick={() => shift(1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
          </button>
          <button type="button" className="mcal__today-btn" onClick={() => { setFocusDay(null); setView('week'); setAnchor(today); }}>{labels.thisWeek}</button>
          <h2 className="mcal__range" aria-live="polite">{rangeLabel(view, anchor, english)}</h2>
        </div>
        <div className="mcal__side">
          <ul className="mcal__legend" aria-label={text("Chú thích", "Legend")}>
            <li><i className="mcal__dot mcal__dot--court" aria-hidden="true" />{labels.court}</li>
            <li><i className="mcal__dot mcal__dot--class" aria-hidden="true" />{labels.class}</li>
          </ul>
          <div className="mcal__switch" role="group" aria-label={text("Chế độ xem", "View")}>
            <button type="button" aria-pressed={view === 'week'} onClick={() => setView('week')}>{text("Tuần", "Week")}</button>
            <button type="button" aria-pressed={view === 'month'} onClick={() => setView('month')}>{text("Tháng", "Month")}</button>
          </div>
        </div>
      </header>

      {nextUp && (
        <button type="button" className="mcal__next" onClick={() => openEvent(nextUp)}>
          <span className="mcal__next-tag">{text("Tiếp theo", "Next up")}</span>
          <span className={`mcal__type mcal__type--${nextUp.kind}`}>{labels[nextUp.kind]}</span>
          <strong className="mcal__next-title">{title(nextUp)}</strong>
          <span className="mcal__next-meta">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            {english ? dayLabel(nextUp.date).slice(0, 3) : weekdayShort(nextUp.date)} {shortDate(nextUp.date)} · {hhmm(nextUp.startTime)}–{hhmm(nextUp.endTime)}
          </span>
          {nextUp.place && (
            <span className="mcal__next-meta">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
              {nextUp.place}
            </span>
          )}
          <span className="mcal__next-count">{countdown(nextUp, now, english)}</span>
        </button>
      )}

      {error && (
        <div className="mcal__state" role="alert">
          <strong>{text("Không tải được lịch", "Unable to load schedule")}</strong>
          <p>{memberRenderMessage(error)}</p>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setRetry((value) => value + 1)}>{text("Thử lại", "Retry")}</button>
        </div>
      )}
      {courtError && !error && (
        <p className="mcal__note" role="status">
          {text("Chưa tải được lịch đặt sân.", 'Unable to load court bookings.')} {' '}
          <button type="button" className="mcal__link-btn" onClick={() => setRetry((value) => value + 1)}>{text("Thử lại", "Retry")}</button>
        </p>
      )}
      {loading && <span className="sr-only" role="status">{text("Đang tải lịch...", "Loading schedule...")}</span>}

      {!error && view === 'week' && narrow && (
        <div className="mcal__daystrip" role="group" aria-label={text("Chọn ngày", "Choose day")}>
          {days.map((day) => {
            const count = (eventsByDay.get(day) ?? []).length;
            return (
              <button
                key={day}
                type="button"
                className={`mcal__daychip${day === activeDay ? ' is-active' : ''}${day === today ? ' is-today' : ''}`}
                aria-pressed={day === activeDay}
                aria-label={`${dayLabel(day)} ${shortDate(day)}, ${count} ${text("lịch", 'bookings')}`}
                onClick={() => setFocusDay(day)}
              >
                <span>{english ? dayLabel(day).slice(0, 3) : weekdayShort(day)}</span>
                <strong>{day.slice(8)}</strong>
                {renderDots(day)}
              </button>
            );
          })}
        </div>
      )}

      {!error && view === 'week' && (
        <div className={`mcal__scroll${loading ? ' is-loading' : ''}`} ref={scrollRef} aria-busy={loading}>
          <div className={`mcal__week${narrow ? ' is-single' : ''}`} style={{ '--mcal-hour': `${HOUR_PX}px`, '--mcal-rows': hours.length, '--mcal-days': visibleDays.length } as CSSProperties}>
            <div className="mcal__corner" aria-hidden="true" />
            {visibleDays.map((day) => (
              <div key={day} className={`mcal__dayhead${day === today ? ' is-today' : ''}`} aria-current={day === today ? 'date' : undefined}>
                <span className="mcal__dayname">{weekdayHead[days.indexOf(day)]}</span>
                <strong className="mcal__daynum">{day.slice(8)}</strong>
                {renderDots(day)}
              </div>
            ))}

            <div className="mcal__gutter" aria-hidden="true">
              {hours.map((hour) => <span key={hour}>{hourLabel(hour)}</span>)}
            </div>
            {visibleDays.map((day) => {
              const positioned = layoutDayEvents(eventsByDay.get(day) ?? [], firstHour, endHour);
              const showNow = day === today && now.minutes >= firstHour * 60 && now.minutes < endHour * 60;
              return (
                <div
                  key={day}
                  className={`mcal__col${day === today ? ' is-today' : ''}${days.indexOf(day) >= 5 ? ' is-weekend' : ''}`}
                  role="group"
                  aria-label={`${dayLabel(day)} ${shortDate(day)}`}
                >
                  {showNow && (
                    <span className="mcal__now" aria-hidden="true" style={{ top: `${((now.minutes - firstHour * 60) / ((endHour - firstHour) * 60)) * 100}%` }} />
                  )}
                  {positioned.map(({ event, lane, lanes, topPct, heightPct }) => (
                    <button
                      key={event.id}
                      type="button"
                      className={`mcal__event mcal__event--${event.kind}${isEnded(event, now) ? ' is-past' : ''}${event.cancelled ? ' is-cancelled' : ''}${blockClass((heightPct / 100) * hours.length * HOUR_PX)}`}
                      style={{
                        top: `calc(${topPct}% + 3px)`,
                        height: `calc(${heightPct}% - 6px)`,
                        left: `calc(${(lane / lanes) * 100}% + 6px)`,
                        width: `calc(${100 / lanes}% - 12px)`,
                      }}
                      aria-label={eventLabel(event)}
                      onClick={() => openEvent(event)}
                    >
                      <span className="mcal__event-top">
                        <span className={`mcal__type mcal__type--${event.kind}`}>{labels[event.kind]}</span>
                        <span className="mcal__event-time">{hhmm(event.startTime)} - {hhmm(event.endTime)}</span>
                      </span>
                      <strong className="mcal__event-title">{title(event)}</strong>
                      {event.place && <span className="mcal__event-place">{event.place}</span>}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
          {isEmpty && <p className="mcal__empty" role="status">{labels.empty}</p>}
        </div>
      )}

      {!error && view === 'month' && (
        <div className={`mcal__month${loading ? ' is-loading' : ''}`} aria-busy={loading}>
          {weekdayHead.map((label) => <span key={label} className="mcal__month-head">{label}</span>)}
          {Array.from({ length: 42 }, (_, index) => addDays(from, index)).map((day) => {
            const list = eventsByDay.get(day) ?? [];
            const outside = day.slice(0, 7) !== anchor.slice(0, 7);
            return (
              <div key={day} className={`mcal__cell${outside ? ' is-outside' : ''}${day === today ? ' is-today' : ''}`}>
                <button
                  type="button"
                  className="mcal__cell-day"
                  aria-label={`${text("Xem tuần có", 'View week containing')} ${dayLabel(day)} ${shortDate(day)}, ${list.length} ${text("lịch", 'bookings')}`}
                  onClick={() => { setAnchor(day); setView('week'); }}
                >
                  {Number(day.slice(8))}
                </button>
                <div className="mcal__chips">
                  {list.slice(0, 3).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className={`mcal__chip mcal__chip--${event.kind}${isEnded(event, now) ? ' is-past' : ''}${event.cancelled ? ' is-cancelled' : ''}`}
                      aria-label={eventLabel(event)}
                      onClick={() => openEvent(event)}
                    >
                      <span className={`mcal__type mcal__type--${event.kind}`}>{labels[event.kind]}</span>
                      <span>{hhmm(event.startTime)}</span> {title(event)}
                    </button>
                  ))}
                  {list.length > 3 && (
                    <button type="button" className="mcal__more" onClick={() => { setAnchor(day); setView('week'); }}>
                      +{list.length - 3} {text("lịch khác", 'more bookings')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <Modal title={title(selected)} onClose={closeDialog} busy={busy} returnFocusRef={returnFocusRef}>
          <div className="kv-list">
            <div className="kv-row"><span>{text("Loại", "Type")}</span><strong>{labels[selected.kind]}</strong></div>
            <div className="kv-row"><span>{text("Thời gian", "Time")}</span><strong>{dayLabel(selected.date)} {shortDate(selected.date)} · {hhmm(selected.startTime)}–{hhmm(selected.endTime)}</strong></div>
            {selected.place && <div className="kv-row"><span>{text("Địa điểm", "Location")}</span><strong>{selected.place}</strong></div>}
            {selected.coach && <div className="kv-row"><span>{text("Huấn luyện viên", "Coach")}</span><strong>{selected.coach}</strong></div>}
            {selected.cancelled && <div className="kv-row"><span>{text("Trạng thái", "Status")}</span><strong>{text("Buổi học đã bị hủy", "Class session cancelled")}</strong></div>}
          </div>
          {dialogError && <div className="form-error" role="alert">{memberRenderMessage(dialogError)}</div>}
          <div className="mcal__dialog-actions">
            <button type="button" className="btn-secondary" onClick={closeDialog} disabled={busy}>{text("Đóng", "Close")}</button>
            {selected.kind === 'court' ? (
              <Link to="/member/courts" className="btn-primary">{text("Quản lý đặt sân", "Manage court bookings")}</Link>
            ) : !selectedEnded && !selected.cancelled && (
              confirmCancel ? (
                <>
                  <button type="button" className="btn-secondary" onClick={() => setConfirmCancel(false)} disabled={busy}>{text("Giữ chỗ", "Keep booking")}</button>
                  <button type="button" className="btn-danger" onClick={() => void handleCancel()} disabled={busy}>
                    {busy ? text("Đang hủy...", 'Cancelling...') : text("Xác nhận hủy", 'Confirm cancellation')}
                  </button>
                </>
              ) : (
                <button type="button" className="btn-secondary" onClick={() => setConfirmCancel(true)}>
                  {selected.seat.type === 'booking' ? text("Hủy buổi này", 'Cancel this session') : text("Hủy đặt chỗ", 'Cancel booking')}
                </button>
              )
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
