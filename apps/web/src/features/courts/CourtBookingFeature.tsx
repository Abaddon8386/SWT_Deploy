import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { Modal } from '../../shared/ui/Modal';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import { notify } from '../../shared/lib/portalNotices';
import { ApiError } from '../../shared/api/client';
import { RecurrenceFields, RecurrenceSummary } from '../../shared/ui/RecurrenceFields';
import { recurrenceRequest, type RecurrenceChoice } from '../../shared/lib/recurrence';
import { matchesDiscipline } from '../../shared/lib/disciplines';
import { CourtBookingList, CourtLoadError } from './CourtBookingList';
import { courtsApi, type RecurringCourtResult, COURT_DISCIPLINES, centerDate, dateAfter, shortTime, displayDate, courtError, type Court, type CourtSlot } from './courtsApi';
import './courts.css';

const SLOT_LABELS = { free: 'Trống', booked: 'Đã đặt', class: 'Đang có lớp', past: 'Đã qua' };
export function CourtBookingFeature() {
  const [params, setParams] = useSearchParams();
  const discipline = COURT_DISCIPLINES.find(item => matchesDiscipline(params.get('discipline') ?? 'Tennis', item.name))?.name ?? 'Tennis';
  const [date, setDate] = useState(centerDate);
  const [refresh, setRefresh] = useState(0);
  const [rows, setRows] = useState<{ court: Court; slots: CourtSlot[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<{ court: Court; slot: CourtSlot; date: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [needsMembership, setNeedsMembership] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceChoice>({ period: 'once', days: [] });
  const [outcome, setOutcome] = useState<RecurringCourtResult | null>(null);
  const gridHeading = useRef<HTMLHeadingElement>(null);
  const today = centerDate();
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today && date <= dateAfter(today, 7);
  const reload = () => setRefresh(value => value + 1);

  useEffect(() => {
    let current = true;
    setLoading(true); setError(''); setRows([]);
    if (!validDate) { setLoading(false); return; }
    void courtsApi.courts(discipline).then(async courts => Promise.all(courts.map(async court => ({ court, slots: await courtsApi.availability(court.id, date) }))))
      .then(result => { if (current) setRows(result); })
      .catch(reason => { if (current) setError(courtError(reason)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [discipline, date, refresh, validDate]);

  const book = async () => {
    if (!selection || busy) return;
    setBusy(true); setActionError('');
    try {
      const standing = recurrenceRequest(recurrence, selection.date);
      if (standing) {
        const result = await courtsApi.bookRecurring({ roomId: selection.court.id, startDate: selection.date, startTime: selection.slot.startTime, ...standing });
        setOutcome(result); reload();
        notify(result.booked.length ? `Đã đặt ${result.booked.length} buổi sân định kỳ.` : 'Không đặt được buổi nào.', result.booked.length ? 'success' : 'error');
      } else {
        await courtsApi.book({ roomId: selection.court.id, date: selection.date, startTime: selection.slot.startTime });
        setSelection(null); reload(); notify('Đã đặt sân thành công.', 'success');
      }
    } catch (reason) {
      setActionError(courtError(reason));
      setNeedsMembership(reason instanceof ApiError && reason.code === 'COURT_BOOKING_MEMBERSHIP_INVALID');
      if (reason instanceof ApiError && reason.status === 409) { setConflict(true); reload(); }
    } finally { setBusy(false); }
  };

  return <div className="portal-container court-page">
    <PageHeader eyebrow="Hội viên" title="Đặt sân" actions={<RefreshButton label="Làm mới lịch sân" disabled={loading || busy} onClick={reload} />} />
    <div className="portal-tabs" aria-label="Bộ môn có sân">
      {COURT_DISCIPLINES.map(item => <button key={item.id} type="button" className={`portal-tab ${item.name === discipline ? 'active' : ''}`} aria-pressed={item.name === discipline} onClick={() => setParams({ discipline: item.name }, { replace: true })}>{item.name}</button>)}
    </div>
    <div className="court-filters"><label className="portal-form-group" htmlFor="court-date"><span className="portal-label">Ngày đặt</span><input id="court-date" type="date" className="portal-input" min={today} max={dateAfter(today, 7)} value={date} onChange={event => setDate(event.target.value)} /></label></div>
    <section aria-labelledby="court-grid-title">
      <h2 id="court-grid-title" className="portal-card-title" tabIndex={-1} ref={gridHeading}>Khung giờ theo sân</h2>
      {!validDate ? <p role="alert">Chọn ngày từ hôm nay đến {displayDate(dateAfter(today, 7))}.</p> : loading ? <LoadingSkeleton label="Đang tải sân" variant="cards" count={2} /> : error ? <CourtLoadError message={error} retry={reload} /> : !rows.length ? <div className="portal-card portal-state">Chưa có sân cho bộ môn này</div> : <div className="court-grid">
        {rows.map(({ court, slots }) => <article className="portal-card court-card" key={court.id}>
          <h3 className="portal-card-title">{court.name}</h3>
          <p className="muted">{court.location ? `${court.location} · ` : ''}{shortTime(court.openTime)}–{shortTime(court.closeTime)}</p>
          <div className="court-slots">{slots.map(slot => <button type="button" key={slot.startTime} className={`court-slot court-slot--${slot.status}`} disabled={slot.status !== 'free' || busy} onClick={() => { setActionError(''); setNeedsMembership(false); setConflict(false); setOutcome(null); setRecurrence({ period: 'once', days: [] }); setSelection({ court, slot, date }); }} aria-label={`${court.name}, ${shortTime(slot.startTime)}–${shortTime(slot.endTime)}, ${SLOT_LABELS[slot.status]}`}><strong>{shortTime(slot.startTime)}–{shortTime(slot.endTime)}</strong><span>{SLOT_LABELS[slot.status]}</span></button>)}</div>
          {!slots.length && <p className="muted">Chưa có khung giờ cho ngày này.</p>}
        </article>)}
      </div>}
    </section>
    <CourtBookingList refresh={refresh} onChanged={reload} />
    {selection && <Modal title="Xác nhận đặt sân" busy={busy} onClose={() => setSelection(null)} returnFocusRef={gridHeading}>
      <p><strong>{selection.court.name}</strong> · {selection.court.disciplineName}</p>
      <p>{displayDate(selection.date)} · {shortTime(selection.slot.startTime)}–{shortTime(selection.slot.endTime)}</p>
      {outcome ? <RecurrenceSummary booked={outcome.booked} skipped={outcome.skipped} describe={item => `${displayDate(item.date)} · ${shortTime(item.startTime)}–${shortTime(item.endTime)}`} /> : <>
      <RecurrenceFields startDate={selection.date} value={recurrence} onChange={setRecurrence} disabled={busy} hint="Đặt định kỳ được đặt trước tối đa 1 tháng; buổi trùng lịch hoặc ngoài thời hạn gói tập sẽ được bỏ qua và báo lại." />
      <p className="muted">Không phát sinh phí. Tối đa 2 lượt/ngày; hủy trước giờ bắt đầu ít nhất 2 giờ.</p></>}
      {actionError && <div className="portal-alert" role="alert"><p style={{ margin: 0 }}>{actionError}</p>{needsMembership && <div style={{ marginTop: 8 }}><Link to="/member/packages" className="btn-secondary btn-sm">Xem / Đăng ký gói tập</Link></div>}</div>}
      <div className="court-modal-actions">{outcome ? <button type="button" className="btn-primary" onClick={() => setSelection(null)}>Đóng</button> : <><button type="button" className="btn-secondary" disabled={busy} onClick={() => setSelection(null)}>Quay lại</button><button type="button" className="btn-primary" disabled={busy || conflict} onClick={() => void book()}>{busy ? 'Đang đặt…' : recurrence.period === 'once' ? 'Xác nhận đặt' : 'Xác nhận đặt định kỳ'}</button></>}</div>
    </Modal>}
  </div>;
}
