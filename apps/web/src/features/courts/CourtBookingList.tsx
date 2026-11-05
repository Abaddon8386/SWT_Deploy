import { VnpayPayButton } from '../payments/VnpayPayButton';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import { Modal } from '../../shared/ui/Modal';
import { Select } from '../../shared/ui/Select';
import { notify } from '../../shared/lib/portalNotices';
import { catalogApi, type Room } from '../manager/catalogApi';
import { courtsApi, bookingEnded, centerDate, courtError, displayDate, shortTime, formatVnd, type BookingPage, type CourtBooking } from './courtsApi';
import './courts.css';

export function CourtLoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="portal-alert" role="alert"><span>{message}</span><button type="button" className="btn-secondary btn-sm" onClick={retry}>Thử lại</button></div>;
}
export function StaffCourtBookings() {
  const [date, setDate] = useState(centerDate);
  const [roomId, setRoomId] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomError, setRoomError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const reload = () => setRefresh(value => value + 1);
  useEffect(() => {
    let current = true;
    setRoomError('');
    void catalogApi.rooms().then(result => { if (current) setRooms(result.filter(room => room.disciplineId != null)); })
      .catch(reason => { if (current) setRoomError(courtError(reason)); });
    return () => { current = false; };
  }, [refresh]);
  return <div className="portal-container court-page">
    <PageHeader eyebrow="Vận hành" title="Lượt đặt sân" actions={<RefreshButton label="Làm mới lượt đặt sân" onClick={reload} />} />
    <div className="court-filters">
      <label className="portal-form-group" htmlFor="staff-court-date"><span className="portal-label">Ngày đặt</span><input id="staff-court-date" className="portal-input" type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
      <div className="portal-form-group"><label className="portal-label" htmlFor="staff-court-room">Sân / làn</label><Select id="staff-court-room" className="portal-select" value={roomId} onChange={event => setRoomId(event.target.value)}><option value="">Tất cả sân / làn</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</Select></div>
    </div>
    {roomError && <CourtLoadError message={roomError} retry={reload} />}
    {date ? <CourtBookingList key={`${date}:${roomId}`} staff date={date} roomId={roomId} refresh={refresh} onChanged={reload} /> : <p role="alert">Vui lòng chọn ngày đặt.</p>}
  </div>;
}

export function CourtBookingList({ staff = false, date = '', roomId = '', refresh, onChanged }: { staff?: boolean; date?: string; roomId?: string; refresh: number; onChanged: () => void }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<BookingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [cancel, setCancel] = useState<CourtBooking | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    void (staff ? courtsApi.list(date, roomId, page) : courtsApi.my(page)).then(result => {
      if (!current) return;
      if (page > 0 && page >= result.totalPages) { setPage(Math.max(0, result.totalPages - 1)); return; }
      setData(result);
    }).catch(failure => { if (current) setError(courtError(failure)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [staff, date, roomId, page, refresh, retry]);
  const confirmPayment = async (id: number) => {
    if (busy) return;
    setBusy(true); setActionError('');
    try {
      await courtsApi.confirmPayment(id); onChanged(); notify('Đã xác nhận thu tiền đặt sân.', 'success');
    } catch (failure) { const msg = courtError(failure); setActionError(msg); notify(msg, 'error'); onChanged(); }
    finally { setBusy(false); }
  };
  const cancelBooking = async () => {
    if (!cancel || busy) return;
    setBusy(true); setActionError('');
    try {
      await courtsApi.cancel(cancel.id, reason); setCancel(null); onChanged(); notify('Đã hủy lượt đặt sân.', 'success');
    } catch (failure) { const msg = courtError(failure); setActionError(msg); notify(msg, 'error'); onChanged(); }
    finally { setBusy(false); }
  };
  return <section className="court-booking-list" aria-labelledby="court-booking-list-title">
    <h2 id="court-booking-list-title" className="portal-card-title" tabIndex={-1} ref={headingRef}>{staff ? 'Danh sách theo ngày' : 'Lượt đặt của tôi'}</h2>
    {loading ? <LoadingSkeleton label="Đang tải lượt đặt sân" variant="rows" count={3} /> : error ? <CourtLoadError message={error} retry={() => setRetry(value => value + 1)} /> : !data?.content.length ? <div className="portal-card portal-state">{staff ? 'Chưa có lượt đặt trong ngày này' : 'Bạn chưa có lượt đặt sân nào'}</div> : <>
      <div className="stack">{data.content.map(booking => <article className="portal-card court-booking-row" key={booking.id}>
        <div><h3 className="portal-card-title">{booking.roomName}</h3><p>{booking.disciplineName} · {displayDate(booking.date)} · <strong>{shortTime(booking.startTime)}–{shortTime(booking.endTime)}</strong></p>{staff && <p className="muted">Hội viên: {booking.memberName}</p>}<span className={`badge ${booking.status === 'cancelled' || bookingEnded(booking) ? '' : 'badge-success'}`}>{booking.status === 'cancelled' ? 'Đã hủy' : bookingEnded(booking) ? 'Đã diễn ra' : 'Đã đặt'}</span><p className="muted">{booking.paymentMethod === 'package_quota' ? 'Miễn phí (theo gói)' : booking.price > 0 ? `${booking.paymentStatus === 'pending' ? 'Chờ thanh toán' : 'Đã thanh toán'} ${formatVnd(booking.price)}` : 'Không phí'}</p>{booking.cancelReason && <p className="muted">Lý do hủy: {booking.cancelReason}</p>}</div>
        {!staff && booking.status === 'booked' && booking.paymentStatus === 'pending' && booking.paymentMethod === 'vnpay' && <VnpayPayButton target={{ courtBookingId: booking.id }} />}
        {staff && booking.status === 'booked' && booking.paymentStatus === 'pending' && booking.paymentMethod === 'cash' && <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void confirmPayment(booking.id)}>Xác nhận đã thu tiền</button>}
        {booking.canCancel && booking.status === 'booked' && <button type="button" className="btn-secondary btn-sm" disabled={busy} aria-label={`Hủy lượt đặt ${booking.roomName} ${displayDate(booking.date)} ${shortTime(booking.startTime)}`} onClick={() => { setCancel(booking); setReason(''); setActionError(''); }}>Hủy lượt đặt</button>}
      </article>)}</div>
      {data.totalPages > 1 && <nav className="court-pagination" aria-label="Phân trang lượt đặt"><button type="button" className="btn-secondary" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Trang trước</button><span>Trang {page + 1} / {data.totalPages}</span><button type="button" className="btn-secondary" disabled={page + 1 >= data.totalPages} onClick={() => setPage(value => value + 1)}>Trang sau</button></nav>}
    </>}
    {cancel && <Modal title="Hủy lượt đặt sân" onClose={() => setCancel(null)} busy={busy} returnFocusRef={headingRef}>
      <p><strong>{cancel.roomName}</strong> · {displayDate(cancel.date)} · {shortTime(cancel.startTime)}–{shortTime(cancel.endTime)}</p>
      {!staff && <p className="muted">Bạn chỉ có thể hủy trước giờ bắt đầu ít nhất 2 giờ.</p>}
      <label className="portal-form-group" htmlFor="court-cancel-reason"><span className="portal-label">Lý do hủy (không bắt buộc)</span><textarea id="court-cancel-reason" className="portal-textarea" rows={2} maxLength={255} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} /></label>
      {actionError && <p className="portal-alert" role="alert">{actionError}</p>}
      <div className="court-modal-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={() => setCancel(null)}>Giữ lượt đặt</button><button type="button" className="btn-danger" disabled={busy} onClick={() => void cancelBooking()}>{busy ? 'Đang hủy…' : 'Xác nhận hủy'}</button></div>
    </Modal>}
  </section>;
}
