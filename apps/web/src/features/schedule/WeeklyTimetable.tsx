import { memberText } from '../member/memberI18n';
import { useLanguage } from '../../shared/i18n/language';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import {
  TIMETABLE_HOURS,
  addDays,
  blockClass,
  fitHourRange,
  hhmm,
  hourLabel,
  isWithinRange,
  layoutDayEvents,
  mondayOf,
  overlapsHour,
  shortDate,
  toMinutes,
  todayISO,
  weekRangeLabel,
  weekdayLabel,
  weekDays,
  type TimetableEvent,
  type TimetableTone,
} from './timetable';
import './calendar.css';

export interface TimetableSlot {
  date: string;
  startTime: string;
  endTime: string;
}

export interface TimetableLegendItem {
  tone: TimetableTone | 'free';
  label: string;
}

interface WeeklyTimetableProps {
  /** Thứ Hai (YYYY-MM-DD) của tuần đang xem. */
  weekStart: string;
  events: TimetableEvent[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onWeekChange: (weekStart: string) => void;
  onEventClick: (eventId: string) => void;
  /** Khối đang được chọn (ví dụ buổi đang điểm danh). */
  selectedId?: string;
  /** Khóa việc chọn khối khi đang có thao tác ghi dở. */
  disabled?: boolean;
  /** Câu hiển thị khi tuần không có buổi nào. */
  emptyLabel?: string;
  /** Có hàm này thì ô giờ trống bấm được (Manager tạo lịch); không có thì ô chỉ để xem. */
  onSlotClick?: (slot: TimetableSlot) => void;
  slotActionLabel?: string;
  legend: TimetableLegendItem[];
  /** Dòng giải thích nằm cuối chú thích, ví dụ cách đọc số chỗ. */
  legendNote?: string;
  /** Vùng bộ lọc thêm, đặt cạnh điều hướng tuần. */
  toolbar?: ReactNode;
  label: string;
}

const MINUTE_MS = 60_000;
/** Dưới mốc này bảng chuyển sang xem từng ngày thay vì 7 cột hẹp cuộn ngang. */
const NARROW_QUERY = '(max-width: 767px)';
const HOUR_PX = 72;
const WEEKDAY_HEAD = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function useMediaQuery(query: string): boolean {
  const read = () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}

function slotKey(date: string, hour: number) {
  return `${date}|${hour}`;
}

export function WeeklyTimetable({
  weekStart, events, loading = false, error = null, onRetry, onWeekChange, onEventClick, selectedId, disabled = false,
  emptyLabel = 'Tuần này chưa có buổi học nào', onSlotClick, slotActionLabel = 'tạo lịch', legend, legendNote, toolbar, label,
}: WeeklyTimetableProps) {
  useLanguage();
  const now = useNow();
  const today = todayISO(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const narrow = useMediaQuery(NARROW_QUERY);
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const selectedDate = events.find((event) => event.id === selectedId)?.date;
  const activeDay = focusDay && days.includes(focusDay) ? focusDay
    : selectedDate && days.includes(selectedDate) ? selectedDate
    : days.includes(today) ? today : days[0];
  const visibleDays = narrow ? [activeDay] : days;
  const gridRef = useRef<HTMLDivElement>(null);
  const [rovingKey, setRovingKey] = useState<string | null>(null);
  // Bảng chỉ xem mặc định thu gọn theo lịch của tuần; Quản lý cần bấm mọi ô giờ nên mặc định hiện đủ.
  const [fullDay, setFullDay] = useState(Boolean(onSlotClick));
  const weekEvents = useMemo(() => events.filter((event) => days.includes(event.date)), [events, days]);
  const fittedHours = useMemo(() => fitHourRange(weekEvents), [weekEvents]);
  const canCompact = fittedHours.length < TIMETABLE_HOURS.length;
  const hours = fullDay || !canCompact ? TIMETABLE_HOURS : fittedHours;
  const firstHour = hours[0];
  const endHour = hours[hours.length - 1] + 1;

  const eventsByDay = useMemo(() => {
    const map = new Map<string, TimetableEvent[]>();
    for (const day of days) map.set(day, []);
    for (const event of events) map.get(event.date)?.push(event);
    return map;
  }, [days, events]);

  const outsideRange = events.filter((event) => days.includes(event.date) && !isWithinRange(event)).length;
  const visibleCount = events.filter((event) => days.includes(event.date) && isWithinRange(event)).length;
  const thisWeek = mondayOf(today);
  const emptyText = emptyLabel.replace(/\.$/, '');

  const isPastSlot = (date: string, hour: number) =>
    date < today || (date === today && (hour + 1) * 60 <= nowMinutes);

  // Mở tuần: cuộn khung tới 1 giờ trước khối đang chọn, nếu không có thì trước buổi học đầu tiên của tuần.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || loading || box.scrollHeight <= box.clientHeight) return;
    const inWeek = events.filter((event) => days.includes(event.date) && isWithinRange(event));
    const selected = inWeek.find((event) => event.id === selectedId);
    const starts = (selected ? [selected] : inWeek).map((event) => toMinutes(event.startTime));
    const target = starts.length > 0 ? Math.min(...starts) : firstHour * 60;
    box.scrollTop = Math.max(0, ((target - 60 - firstHour * 60) / 60) * HOUR_PX);
    // Chỉ cuộn khi đổi tuần, vừa tải xong hoặc đổi khung giờ; không cuộn lại khi dữ liệu đặt chỗ làm mới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, loading, fullDay]);

  const firstKey = slotKey(visibleDays[0], firstHour);
  const activeKey = rovingKey && visibleDays.some((day) => rovingKey.startsWith(`${day}|`)) ? rovingKey : firstKey;

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, dayIndex: number, hour: number) {
    const hourIndex = hours.indexOf(hour);
    let nextDay = dayIndex;
    let nextHour = hourIndex;
    switch (event.key) {
      case 'ArrowLeft': nextDay = Math.max(0, dayIndex - 1); break;
      case 'ArrowRight': nextDay = Math.min(visibleDays.length - 1, dayIndex + 1); break;
      case 'ArrowUp': nextHour = Math.max(0, hourIndex - 1); break;
      case 'ArrowDown': nextHour = Math.min(hours.length - 1, hourIndex + 1); break;
      case 'Home': nextHour = 0; break;
      case 'End': nextHour = hours.length - 1; break;
      default: return;
    }
    event.preventDefault();
    const key = slotKey(visibleDays[nextDay], hours[nextHour]);
    setRovingKey(key);
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-slot="${key}"]`)?.focus();
  }

  const rowsPx = hours.length * HOUR_PX;

  return (
    <section data-i18n-managed className="mcal" aria-label={label}>
      <header className="mcal__toolbar">
        <div className="mcal__nav" role="group" aria-label={memberText("Điều hướng tuần")}>
          <button type="button" className="mcal__icon-btn" aria-label={memberText("Tuần trước")} onClick={() => onWeekChange(addDays(weekStart, -7))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button type="button" className="mcal__icon-btn" aria-label={memberText("Tuần sau")} onClick={() => onWeekChange(addDays(weekStart, 7))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
          </button>
          <button
            type="button"
            className="mcal__today-btn"
            disabled={weekStart === thisWeek}
            onClick={() => { setFocusDay(null); onWeekChange(thisWeek); }}
          >
            {memberText("Hôm nay")}</button>
          <h2 className="mcal__range" aria-live="polite">{weekRangeLabel(weekStart)}</h2>
        </div>
        <div className="mcal__side">
          <ul className="mcal__legend" aria-label={memberText("Chú thích")}>
            {legend.map((item) => (
              <li key={item.tone}>
                <i className={`mcal__dot mcal__dot--${item.tone}`} aria-hidden="true" />
                {item.label}
              </li>
            ))}
            {legendNote && <li className="mcal__legend-note">{legendNote}</li>}
          </ul>
          {(canCompact || toolbar) && (
            <div className="mcal__extra">
              {canCompact && (
                <div className="mcal__switch" role="group" aria-label={memberText("Khung giờ")}>
                  <button type="button" aria-pressed={!fullDay} onClick={() => setFullDay(false)}>
                    {`${hourLabel(fittedHours[0])}–${hourLabel(fittedHours[fittedHours.length - 1] + 1)}`}
                  </button>
                  <button type="button" aria-pressed={fullDay} onClick={() => setFullDay(true)}>{memberText("Cả ngày")}</button>
                </div>
              )}
              {toolbar}
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className="mcal__state" role="alert">
          <strong>{memberText("Không tải được thời khóa biểu")}</strong>
          <p>{error}</p>
          {onRetry && <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>{memberText("Thử lại")}</button>}
        </div>
      )}

      {narrow && (
        <div className="mcal__daystrip" role="group" aria-label={memberText("Chọn ngày")}>
          {days.map((day) => {
            const count = (eventsByDay.get(day) ?? []).filter((event) => event.tone !== 'cancelled' && isWithinRange(event)).length;
            return (
              <button
                key={day}
                type="button"
                className={`mcal__daychip${day === activeDay ? ' is-active' : ''}${day === today ? ' is-today' : ''}`}
                aria-pressed={day === activeDay}
                aria-label={`${memberText(weekdayLabel(day))} ${shortDate(day)}, ${count} ${memberText('buổi học')}`}
                onClick={() => setFocusDay(day)}
              >
                <span>{weekdayLabel(day).replace(memberText("Thứ "), 'T').replace(memberText("Chủ nhật"), 'CN')}</span>
                <strong>{shortDate(day).slice(0, 2)}</strong>
                <small>{count > 0 ? `${count} ${memberText('buổi học')}` : memberText("Trống")}</small>
              </button>
            );
          })}
        </div>
      )}

      {loading && <span className="sr-only" role="status">{memberText("Đang tải thời khóa biểu...")}</span>}

      <div className={`mcal__scroll${loading ? ' is-loading' : ''}`} aria-busy={loading} ref={scrollRef}>
        <div
          className={`mcal__week${narrow ? ' is-single' : ''}`}
          style={{ '--mcal-hour': `${HOUR_PX}px`, '--mcal-rows': hours.length, '--mcal-days': visibleDays.length } as CSSProperties}
          ref={gridRef}
        >
          <div className="mcal__corner" aria-hidden="true" />
          {visibleDays.map((day) => {
            const dayEvents = (eventsByDay.get(day) ?? []).filter((event) => isWithinRange(event));
            return (
              <div key={day} className={`mcal__dayhead${day === today ? ' is-today' : ''}`} aria-current={day === today ? 'date' : undefined}>
                <span className="mcal__dayname">{memberText(WEEKDAY_HEAD[days.indexOf(day)])}</span>
                <strong className="mcal__daynum">{day.slice(8)}</strong>
                <span className="mcal__dots" aria-hidden="true">
                  {dayEvents.slice(0, 3).map((event) => <i key={event.id} className={`mcal__dot mcal__dot--${event.tone}`} />)}
                </span>
              </div>
            );
          })}

          <div className="mcal__gutter" aria-hidden="true">
            {hours.map((hour) => <span key={hour}>{hourLabel(hour)}</span>)}
          </div>

          {visibleDays.map((day, dayIndex) => {
            const dayEvents = eventsByDay.get(day) ?? [];
            const busyEvents = dayEvents.filter((event) => event.tone !== 'cancelled');
            const positioned = layoutDayEvents(dayEvents, firstHour, endHour);
            const showNow = day === today && nowMinutes >= firstHour * 60 && nowMinutes < endHour * 60;
            const weekend = days.indexOf(day) >= 5;
            return (
              <div
                key={day}
                className={`mcal__col${day === today ? ' is-today' : ''}${weekend ? ' is-weekend' : ''}`}
                role="group"
                aria-label={`${weekdayLabel(day)} ${shortDate(day)}`}
              >
                {onSlotClick && hours.map((hour, hourIndex) => {
                  const busy = busyEvents.some((event) => overlapsHour(event, hour));
                  const past = isPastSlot(day, hour);
                  const key = slotKey(day, hour);
                  const range = `${hourLabel(hour)}–${hourLabel(hour + 1)}`;
                  return (
                    <button
                      key={hour}
                      type="button"
                      className={`mcal__slot${busy ? ' is-busy' : ' is-free'}${past ? ' is-past' : ''}`}
                      style={{ top: hourIndex * HOUR_PX }}
                      data-slot={key}
                      tabIndex={key === activeKey ? 0 : -1}
                      aria-disabled={past || undefined}
                      aria-label={
                        past
                          ? `${weekdayLabel(day)} ${shortDate(day)}, ${range}: ${memberText('Đã qua')}`
                          : `${weekdayLabel(day)} ${shortDate(day)}, ${range}: ${busy ? memberText("đã có lịch, ") : memberText("trống, ")}${slotActionLabel === 'tạo lịch' ? memberText(slotActionLabel) : slotActionLabel}`
                      }
                      onFocus={() => setRovingKey(key)}
                      onKeyDown={(event) => moveFocus(event, dayIndex, hour)}
                      onClick={() => {
                        if (past) return;
                        onSlotClick({ date: day, startTime: hourLabel(hour), endTime: hourLabel(hour + 1) });
                      }}
                    >
                      <span className="mcal__slot-plus" aria-hidden="true">+ {hourLabel(hour)}</span>
                    </button>
                  );
                })}

                {showNow && (
                  <span
                    className="mcal__now"
                    aria-hidden="true"
                    style={{ top: `${((nowMinutes - firstHour * 60) / (hours.length * 60)) * 100}%` }}
                  />
                )}

                {positioned.map(({ event, lane, lanes, topPct, heightPct }) => {
                  const range = `${hhmm(event.startTime)} - ${hhmm(event.endTime)}`;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      className={`mcal__event mcal__event--${event.tone}${event.id === selectedId ? ' is-selected' : ''}${blockClass((heightPct / 100) * rowsPx)}`}
                      style={{
                        top: `calc(${topPct}% + 3px)`,
                        height: `calc(${heightPct}% - 6px)`,
                        left: `calc(${(lane / lanes) * 100}% + 5px)`,
                        width: `calc(${100 / lanes}% - 10px)`,
                      }}
                      aria-label={event.ariaLabel}
                      disabled={disabled}
                      aria-pressed={selectedId === undefined ? undefined : event.id === selectedId}
                      title={[event.title, range, event.meta, event.badge].filter(Boolean).join(' · ')}
                      onClick={() => onEventClick(event.id)}
                    >
                      <span className="mcal__event-top">
                        <span className="mcal__event-time">{range}</span>
                        {event.badge && <span className="mcal__event-badge">{event.badge}</span>}
                      </span>
                      <strong className="mcal__event-title">{event.title}</strong>
                      {event.meta && <span className="mcal__event-place">{event.meta}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        {!loading && !error && visibleCount === 0 && (
          <p className="mcal__empty" role="status">
            {emptyText}.{onSlotClick ? memberText(" Bấm vào một ô giờ để tạo lịch.") : ''}
          </p>
        )}
      </div>

      {outsideRange > 0 && (
        <p className="mcal__note" role="status">
          {outsideRange} {memberText(" buổi học nằm ngoài khung 06:00–22:00 nên không hiện trên bảng.")}</p>
      )}
    </section>
  );
}
