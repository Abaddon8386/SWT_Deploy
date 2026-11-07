import { memberText } from './memberI18n';
import { useLanguage } from '../../shared/i18n/language';
import { useEffect, useId, useState } from 'react';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { centerNowParts, formatCenterDate, formatCenterTime } from '../../shared/lib/centerTime';
import type { CheckinDto } from '../reception/checkinApi';
import { memberCheckinApi } from './memberCheckinApi';
import { monthRange, workoutVisits } from './workoutHistoryPresentation';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; rows: CheckinDto[] };

function WorkoutDay({ day, visits }: { day: string; visits: CheckinDto[] }) {
  useLanguage();
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <li className="workout-day-group">
    <h4><button type="button" className="workout-day-toggle" id={`${id}-trigger`} aria-expanded={expanded} aria-controls={`${id}-details`} onClick={() => setExpanded(value => !value)}>
      <span className="workout-date-badge" aria-hidden="true"><strong>{day.slice(8)}</strong><small>{memberText("TH", "M")}{day.slice(5, 7)}</small></span>
      <span className="workout-day-summary"><time dateTime={day}>{formatCenterDate(day)}</time><span>{visits.length}{memberText(" lượt check-in thành công")}</span></span>
      <svg className="workout-day-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={expanded ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></svg>
    </button></h4>
    <div id={`${id}-details`} role="region" aria-labelledby={`${id}-trigger`} hidden={!expanded}>
      {expanded && <ol className="workout-visits">{visits.map(row => <li key={row.id}>
        <time dateTime={row.checkInTime}>{formatCenterTime(row.checkInTime)}</time>
        <span className="workout-visit-gate">{row.gate || memberText("Chưa có thông tin vị trí")}</span>
        <span className="workout-visit-status"><span aria-hidden="true">✓ </span>{memberText("Check-in thành công")}</span>
      </li>)}</ol>}
    </div>
  </li>;
}

export function WorkoutHistory() {
  useLanguage();
  const [month, setMonth] = useState(() => centerNowParts().date.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(1);
  const range = monthRange(month);
  useEffect(() => {
    let active = true;
    let request = 0;
    async function load() {
      const current = ++request;
      setState({ kind: 'loading' });
      try {
        const rows = await memberCheckinApi.history({ fromDate: range.fromDate, toDate: range.toDate });
        if (!Array.isArray(rows)) throw new Error('Invalid history response');
        if (active && current === request) setState({ kind: 'ready', rows });
      } catch { if (active && current === request) setState({ kind: 'error' }); }
    }
    const visible = () => { if (document.visibilityState === 'visible') void load(); };
    void load();
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); };
  }, [range.fromDate, range.toDate, retry]);
  function moveMonth(delta: number) {
    const date = new Date(`${month}-15T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    setMonth(date.toISOString().slice(0, 7)); setSelected(null); setPage(1);
  }
  const today = centerNowParts().date;
  const visits = state.kind === 'ready' ? workoutVisits(state.rows, month) : [];
  const days = new Set(visits.map(row => row.day));
  const filtered = selected ? visits.filter(row => row.day === selected) : visits;
  const grouped = new Map<string, typeof visits>();
  for (const visit of filtered) {
    const group = grouped.get(visit.day);
    if (group) group.push(visit);
    else grouped.set(visit.day, [visit]);
  }
  const dayGroups = [...grouped];
  const elapsedDays = month < today.slice(0, 7) ? range.days : month === today.slice(0, 7) ? Number(today.slice(8)) : 0;
  const missedDays = month > today.slice(0, 7) ? null : Math.max(0, elapsedDays - days.size);
  const pageCount = Math.max(1, Math.ceil(dayGroups.length / 5));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * 5;
  const pageDays = dayGroups.slice(firstIndex, firstIndex + 5);
  function selectDay(day: string | null) { setSelected(day); setPage(1); }
  return <section data-i18n-managed className="portal-card workout-history" aria-label={memberText("Lịch sử tập luyện")}>
    <div className="workout-history-heading">
      <h2 className="portal-card-title">{memberText("Nhịp tập luyện của bạn")}</h2>
      <button type="button" className="btn-secondary btn-sm" onClick={() => setRetry(value => value + 1)}>{memberText("Làm mới")}</button>
    </div>
    <div className="workout-month-nav"><button type="button" className="btn-secondary btn-sm" aria-label={memberText("Tháng trước")} onClick={() => moveMonth(-1)}>‹</button><h3 aria-live="polite">{memberText("Tháng ")}{Number(month.slice(5))} / {month.slice(0, 4)}</h3><button type="button" className="btn-secondary btn-sm" aria-label={memberText("Tháng sau")} onClick={() => moveMonth(1)}>›</button></div>
    {state.kind === 'loading' ? <LoadingSkeleton label={memberText("Đang tải lịch sử tập luyện…")} count={3} /> : state.kind === 'error' ? <div role="alert"><p>{memberText("Không thể tải lịch sử tập luyện. Vui lòng thử lại.")}</p><button type="button" className="btn-secondary" onClick={() => setRetry(value => value + 1)}>{memberText("Thử lại")}</button></div> : <>
      <div className="workout-stats">
        <div data-stat="trained"><strong>{days.size}</strong><span>{memberText("Đã tập luyện")}</span></div>
        <div data-stat="missed"><strong aria-label={missedDays == null ? memberText("Chưa đến tháng này") : undefined}>{missedDays ?? '—'}</strong><span>{memberText("Không tập luyện")}</span></div>
        <div data-stat="visits"><strong>{visits.length}</strong><span>{memberText("Lượt check-in thành công")}</span></div>
      </div>
      <div className="workout-calendar" role="group" aria-label={memberText(`Lịch tháng ${month}`, `Calendar for ${month}`)}>
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day, index) => <span className="workout-weekday" key={day}>{memberText(day, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index])}</span>)}
        {Array.from({ length: range.offset }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
        {Array.from({ length: range.days }, (_, index) => {
          const day = `${month}-${String(index + 1).padStart(2, '0')}`;
          const active = days.has(day);
          const dayState = active ? 'trained' : day > today ? 'future' : day === today ? 'today' : 'missed';
          const description = active ? memberText("có check-in") : day > today ? memberText("ngày tương lai") : memberText("không ghi nhận tập luyện");
          return <button type="button" key={day} className="workout-calendar-day" data-active={active} data-day-state={dayState} aria-current={day === today ? 'date' : undefined} aria-pressed={selected === day} aria-label={`${formatCenterDate(day)}, ${description}`} onClick={() => selectDay(selected === day ? null : day)}>
            <span>{index + 1}</span><span className="workout-day-marker" aria-hidden="true">{active ? '✓' : day === today ? '•' : ''}</span>
          </button>;
        })}
      </div>
      <div className="workout-history-heading workout-list-heading"><div><h3>{memberText("Lịch sử tập luyện")}</h3>{selected && <p>{formatCenterDate(selected)}</p>}</div>{selected && <button type="button" className="member-progress-link" onClick={() => selectDay(null)}>{memberText("Xem cả tháng")}</button>}</div>
      {filtered.length === 0 ? <p className="portal-empty">{selected ? memberText("Chưa có check-in thành công trong ngày này.") : memberText("Chưa có check-in thành công trong tháng này.")}</p> : <>
        <ol className="workout-days" start={firstIndex + 1}>{pageDays.map(([day, rows]) => <WorkoutDay key={`${selected ?? 'month'}-${day}`} day={day} visits={rows} />)}</ol>
        <nav className="workout-pagination" aria-label={memberText("Phân trang lịch sử tập luyện")}>
          <span role="status">{firstIndex + 1}–{Math.min(firstIndex + 5, dayGroups.length)} / {dayGroups.length}{memberText(" ngày")}</span>
          <div><button type="button" className="btn-secondary btn-sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>{memberText("Trang trước")}</button><span>{memberText("Trang ", "Page ")}{currentPage}/{pageCount}</span><button type="button" className="btn-secondary btn-sm" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>{memberText("Trang sau", "Next page")}</button></div>
        </nav>
      </>}
    </>}
  </section>;
}
