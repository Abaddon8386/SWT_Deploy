import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import {
  TIMETABLE_HOURS,
  addDays,
  fitHourRange,
  hourLabel,
  isWithinRange,
  layoutDayEvents,
  mondayOf,
  overlapsHour,
  roundedRangeLabel,
  shortDate,
  splitIntoHours,
  toMinutes,
  todayISO,
  weekRangeLabel,
  weekdayLabel,
  weekDays,
  type TimetableEvent,
  type TimetableTone,
} from './timetable';
import './timetable.css';

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
/** Chiều cao một giờ khi khớp màn hình: thấp hơn mốc dưới thì khối 1 giờ không còn đọc được, nên để khung cuộn. */
const HOUR_MIN_PX = 36;
const HOUR_MAX_PX = 64;
const VIEWPORT_GAP_PX = 18;

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

  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
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

  // Màn rộng: chia chiều cao còn lại của màn hình cho số giờ đang hiện để cả tuần nằm gọn một màn hình.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hourPx, setHourPx] = useState<number | null>(null);
  const rowCount = hours.length;
  const hasError = Boolean(error);
  const isEmpty = visibleCount === 0;
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (narrow || !box) { setHourPx(null); return; }
    const measure = () => {
      const top = box.getBoundingClientRect().top + window.scrollY;
      // Bảng nằm sâu dưới trang thì khớp theo cả màn hình (cuộn trang một lần là thấy đủ).
      const reserve = top < window.innerHeight * 0.55 ? top : VIEWPORT_GAP_PX;
      const head = box.querySelector<HTMLElement>('.tt__dayhead')?.offsetHeight ?? 48;
      const available = window.innerHeight - reserve - VIEWPORT_GAP_PX - head - 2;
      setHourPx(Math.min(HOUR_MAX_PX, Math.max(HOUR_MIN_PX, Math.floor(available / rowCount))));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // Đo lại khi số giờ hoặc phần tử phía trên bảng (thông báo lỗi/tuần trống) thay đổi.
  }, [narrow, rowCount, loading, hasError, isEmpty]);

  // Mở tuần: cuộn khung tới 1 giờ trước khối đang chọn, nếu không có thì trước buổi học đầu tiên của tuần.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || loading || box.scrollHeight <= box.clientHeight) return;
    const inWeek = events.filter((event) => days.includes(event.date) && isWithinRange(event));
    const selected = inWeek.find((event) => event.id === selectedId);
    const starts = (selected ? [selected] : inWeek).map((event) => toMinutes(event.startTime));
    const target = starts.length > 0 ? Math.min(...starts) : firstHour * 60;
    const rowPx = box.querySelector<HTMLElement>('.tt__slot')?.offsetHeight ?? HOUR_MAX_PX;
    box.scrollTop = Math.max(0, ((target - 60 - firstHour * 60) / 60) * rowPx);
    // Chỉ cuộn khi đổi tuần, vừa tải xong hoặc đổi khung giờ/chiều cao giờ; không cuộn lại khi dữ liệu đặt chỗ làm mới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, loading, fullDay, hourPx]);

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

  return (
    <section className="tt" aria-label={label}>
      <div className="tt__toolbar">
        <div className="tt__nav" role="group" aria-label="Điều hướng tuần">
          <button type="button" className="btn-secondary btn-sm" onClick={() => onWeekChange(addDays(weekStart, -7))}>
            Tuần trước
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={weekStart === thisWeek}
            onClick={() => { setFocusDay(null); onWeekChange(thisWeek); }}
          >
            Tuần này
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => onWeekChange(addDays(weekStart, 7))}>
            Tuần sau
          </button>
        </div>
        <strong className="tt__range" aria-live="polite">{weekRangeLabel(weekStart)}</strong>
        {canCompact && (
          <button
            type="button"
            className="btn-secondary btn-sm tt__span"
            aria-pressed={fullDay}
            onClick={() => setFullDay((value) => !value)}
          >
            {fullDay
              ? `Thu gọn ${hourLabel(fittedHours[0])}–${hourLabel(fittedHours[fittedHours.length - 1] + 1)}`
              : 'Hiện đủ 06:00–22:00'}
          </button>
        )}
        {toolbar}
      </div>

      <ul className="tt__legend" aria-label="Chú thích">
        {legend.map((item) => (
          <li key={item.tone}>
            <span className={`tt__swatch tt__swatch--${item.tone}`} aria-hidden="true" />
            {item.label}
          </li>
        ))}
        {legendNote && <li className="tt__legend-note">{legendNote}</li>}
      </ul>

      {error && (
        <div className="portal-card portal-empty" role="alert">
          <h3>Không tải được thời khóa biểu</h3>
          <p>{error}</p>
          {onRetry && <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>Thử lại</button>}
        </div>
      )}

      {!loading && !error && visibleCount === 0 && (
        <p className="tt__note tt__note--empty" role="status">
          {emptyText}.{onSlotClick ? ' Bấm vào một ô giờ trống để tạo lịch.' : ''}
        </p>
      )}

      {narrow && (
        <div className="tt__daystrip" role="group" aria-label="Chọn ngày">
          {days.map((day) => {
            const count = (eventsByDay.get(day) ?? []).filter((event) => event.tone !== 'cancelled' && isWithinRange(event)).length;
            return (
              <button
                key={day}
                type="button"
                className={`tt__daychip${day === activeDay ? ' is-active' : ''}${day === today ? ' is-today' : ''}`}
                aria-pressed={day === activeDay}
                aria-label={`${weekdayLabel(day)} ${shortDate(day)}, ${count} buổi`}
                onClick={() => setFocusDay(day)}
              >
                <span>{weekdayLabel(day).replace('Thứ ', 'T').replace('Chủ nhật', 'CN')}</span>
                <strong>{shortDate(day).slice(0, 2)}</strong>
                <small>{count > 0 ? `${count} buổi` : 'Trống'}</small>
              </button>
            );
          })}
        </div>
      )}

      <div
        className="tt__scroll"
        aria-busy={loading}
        ref={scrollRef}
        style={hourPx ? ({ '--tt-hour': `${hourPx}px` } as CSSProperties) : undefined}
      >
        {loading && <span className="sr-only" role="status">Đang tải thời khóa biểu...</span>}
        <div
          className={`tt__grid${loading ? ' is-loading' : ''}${narrow ? ' is-single' : ''}`}
          style={{ '--tt-days': visibleDays.length } as CSSProperties}
          ref={gridRef}
        >
          {visibleDays.map((day, dayIndex) => (
            <div
              key={day}
              className={`tt__dayhead${day === today ? ' is-today' : ''}${dayIndex === 0 ? ' is-first' : ''}`}
              aria-current={day === today ? 'date' : undefined}
            >
              <span>{weekdayLabel(day)}{day === today ? ' · Hôm nay' : ''}</span>
              <strong>{shortDate(day)}</strong>
            </div>
          ))}

          {visibleDays.map((day, dayIndex) => {
            const dayEvents = eventsByDay.get(day) ?? [];
            const busyEvents = dayEvents.filter((event) => event.tone !== 'cancelled');
            // Mỗi giờ một ô: buổi 3 giờ hiện thành 3 ô liền nhau, giờ làm tròn về giờ chẵn.
            const positioned = layoutDayEvents(splitIntoHours(dayEvents), firstHour, endHour);
            const showNow = day === today && nowMinutes >= firstHour * 60 && nowMinutes < endHour * 60;
            return (
              <div
                key={day}
                className={`tt__day${day === today ? ' is-today' : ''}${dayIndex === 0 ? ' is-first' : ''}`}
                role="group"
                aria-label={`${weekdayLabel(day)} ${shortDate(day)}`}
              >
                {hours.map((hour) => {
                  const busy = busyEvents.some((event) => overlapsHour(event, hour));
                  const past = isPastSlot(day, hour);
                  // Không ghi giờ ở mép trái: mỗi ô buổi học tự ghi giờ của nó.
                  const className = `tt__slot${busy ? ' is-busy' : ' is-free'}${past ? ' is-past' : ''}`;
                  if (!onSlotClick) {
                    return <div key={hour} className={className} aria-hidden="true" />;
                  }
                  const key = slotKey(day, hour);
                  const range = `${hourLabel(hour)}–${hourLabel(hour + 1)}`;
                  return (
                    <button
                      key={hour}
                      type="button"
                      className={`${className} is-action`}
                      data-slot={key}
                      tabIndex={key === activeKey ? 0 : -1}
                      aria-disabled={past || undefined}
                      aria-label={
                        past
                          ? `${weekdayLabel(day)} ${shortDate(day)}, ${range}: đã qua`
                          : `${weekdayLabel(day)} ${shortDate(day)}, ${range}: ${busy ? 'đã có lịch, ' : 'trống, '}${slotActionLabel}`
                      }
                      onFocus={() => setRovingKey(key)}
                      onKeyDown={(event) => moveFocus(event, dayIndex, hour)}
                      onClick={() => {
                        if (past) return;
                        onSlotClick({ date: day, startTime: hourLabel(hour), endTime: hourLabel(hour + 1) });
                      }}
                    >
                      <span className="tt__plus" aria-hidden="true">+ {hourLabel(hour)}</span>
                    </button>
                  );
                })}

                {showNow && (
                  <span
                    className="tt__now"
                    aria-hidden="true"
                    style={{ top: `${((nowMinutes - firstHour * 60) / (hours.length * 60)) * 100}%` }}
                  />
                )}

                {positioned.map(({ event, lane, lanes, topPct, heightPct }) => {
                  const slotRange = `${hourLabel(event.hour)}–${hourLabel(event.hour + 1)}`;
                  const fullRange = roundedRangeLabel(eventsById.get(event.sourceId) ?? event);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      className={`tt__event tt__event--${event.tone}${event.sourceId === selectedId ? ' is-selected' : ''}`}
                      style={{
                        top: `calc(${topPct}% + 2px)`,
                        height: `calc(${heightPct}% - 4px)`,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                      } as CSSProperties}
                      aria-label={event.parts > 1 ? `${event.ariaLabel} (giờ ${event.part}/${event.parts}: ${slotRange})` : event.ariaLabel}
                      disabled={disabled}
                      aria-pressed={selectedId === undefined ? undefined : event.sourceId === selectedId}
                      title={[event.title, fullRange, event.meta, event.badge].filter(Boolean).join(' · ')}
                      onClick={() => onEventClick(event.sourceId)}
                    >
                      <span className="tt__event-body">
                        <strong className="tt__event-title" data-start={hourLabel(event.hour)}>{event.title}</strong>
                        {event.badge && <span className="tt__event-badge">{event.badge}</span>}
                        <span className="tt__event-meta">{slotRange}{event.meta ? ` · ${event.meta}` : ''}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {outsideRange > 0 && (
        <p className="tt__note" role="status">
          {outsideRange} buổi học nằm ngoài khung 06:00–22:00 nên không hiện trên bảng.
        </p>
      )}
    </section>
  );
}
