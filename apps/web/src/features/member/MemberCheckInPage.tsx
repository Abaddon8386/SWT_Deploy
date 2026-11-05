import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { QrCameraScanner } from '../checkin/QrCameraScanner';
import { memberCheckinApi } from './memberCheckinApi';
import type { CheckinDto } from '../reception/checkinApi';
import { formatCenterDateTime, formatCenterTime } from '../../shared/lib/centerTime';
import { errorMessage } from '../../shared/lib/errorMessage';

type Mode = 'in' | 'out';
const RANGES = [{ days: 1, label: 'Hôm nay' }, { days: 7, label: '7 ngày' }, { days: 30, label: '30 ngày' }];
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function MemberCheckInPage() {
  const [mode, setMode] = useState<Mode>('in');
  const [days, setDays] = useState(1);
  const [result, setResult] = useState<CheckinDto | null>(null);
  const [history, setHistory] = useState<CheckinDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const busy = useRef(false);
  const mounted = useRef(true);
  const loadHistory = useCallback(async () => {
    setLoading(true); setHistoryError('');
    try { const today = new Date(); const from = new Date(today); from.setDate(today.getDate() - days + 1);
      const visits = await memberCheckinApi.history(days === 1 ? undefined : { fromDate: isoDay(from), toDate: isoDay(today) }); if (mounted.current) setHistory(Array.isArray(visits) ? visits : []); }
    catch { if (mounted.current) setHistoryError('Không thể tải lịch sử ra vào.'); }
    finally { if (mounted.current) setLoading(false); }
  }, [days]);
  useEffect(() => {
    mounted.current = true;
    void loadHistory();
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { mounted.current = false; window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, [loadHistory]);

  async function scan(code: string) {
    if (busy.current) return;
    setResult(null); setError('');
    if (!navigator.onLine) { setError('Bạn đang mất mạng. Kết nối lại rồi quét QR cổng để check-in.'); return; }
    if (!code.startsWith('SOL:GATE:')) {
      setError('Đây không phải mã QR cổng SÖL. Hãy quét mã đang hiển thị tại lễ tân.'); return;
    }
    busy.current = true; setPending(true);
    try {
      const response = mode === 'out' ? await memberCheckinApi.checkout(code) : await memberCheckinApi.scan(code);
      if (!mounted.current) return;
      setResult(response); void loadHistory();
    } catch (reason) { if (mounted.current) setError(errorMessage(reason, 'Check-in chưa được xác nhận. Vui lòng thử lại.')); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  const granted = result?.status.toUpperCase() === 'GRANTED';
  const checkedOut = mode === 'out' && granted && !!result?.checkOutTime;

  return <div className="portal-container">
    <PageHeader eyebrow="Hội viên" title={mode === 'out' ? 'Quét QR check-out' : 'Quét QR check-in'} />
    <div className="qr-checkin-layout">
      <div className="portal-card">
        {!online && <p className="qr-checkin-error" role="alert">Bạn đang mất mạng. Check-in cần kết nối với trung tâm.</p>}
        {pending && <p role="status" aria-live="polite">Đang xác nhận check-in…</p>}
        {error && <p className="qr-checkin-error" role="alert">{error}</p>}
        {result && <div role="status" aria-live="polite" className="qr-checkin-result" data-granted={granted}>
          <h2>{checkedOut ? 'Check-out thành công' : granted ? 'Check-in thành công' : 'Chưa thể check-in'}</h2>
          <p>{granted ? `${result.memberName || 'Hội viên'} · ${result.gate || 'Cổng trung tâm'}` : result.denialReason || 'Vui lòng kiểm tra gói tập hoặc liên hệ lễ tân.'}</p>
          {granted ? <p>{checkedOut && result?.checkOutTime ? `Giờ ra: ${formatCenterDateTime(result.checkOutTime)}` : `Giờ vào: ${formatCenterDateTime(result.checkInTime)}`}</p> : <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}><Link className="btn-primary btn-sm" to="/member/packages">Xem gói tập</Link><Link className="btn-secondary btn-sm" to="/member/card">Kiểm tra thẻ hội viên</Link></div>}
        </div>}
        <div role="group" aria-label="Chế độ quét" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" className={mode === 'in' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} aria-pressed={mode === 'in'} onClick={() => { setMode('in'); setResult(null); setError(''); }}>Check-in</button>
          <button type="button" className={mode === 'out' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} aria-pressed={mode === 'out'} onClick={() => { setMode('out'); setResult(null); setError(''); }}>Check-out</button>
        </div>
        <QrCameraScanner onScan={(code) => void scan(code)} disabled={pending || !online} />
      </div>
      <div className="stack">
        <section className="portal-card">
          <h2 className="portal-card-title">Trước khi vào tập</h2>
          <ol className="qr-checkin-steps"><li>Mở camera và cho phép quyền truy cập.</li><li>Quét mã QR cổng trên màn hình lễ tân.</li><li>Chờ xác nhận check-in thành công.</li></ol>
          <Link className="btn-secondary" to="/member/card">Mở thẻ hội viên</Link>
        </section>
        <section className="portal-card" aria-label="Lịch sử ra vào">
          <h2 className="portal-card-title">Lịch sử ra vào</h2>
          <div role="group" aria-label="Khoảng thời gian" style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {RANGES.map((range) => <button key={range.days} type="button" className={days === range.days ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} aria-pressed={days === range.days} onClick={() => setDays(range.days)}>{range.label}</button>)}
          </div>
          {loading ? <LoadingSkeleton label="Đang tải lịch sử…" count={3} /> : historyError ? <><p role="alert">{historyError}</p><button className="btn-secondary" onClick={() => void loadHistory()}>Thử lại</button></> : history.length === 0 ? <p className="qr-checkin-hint">Chưa có lượt ra vào trong khoảng này.</p> : <div className="stack">{history.slice(0, days === 1 ? 5 : 20).map((visit) => <div key={visit.id} className="qr-checkin-result">
            <strong>{visit.status.toUpperCase() === 'GRANTED' ? visit.checkOutTime ? 'Đã ra về' : 'Đã vào trung tâm' : 'Check-in bị từ chối'}</strong>
            <p>{visit.gate || 'Cổng không xác định'} · {days > 1 ? formatCenterDateTime(visit.checkInTime) : `Vào ${formatCenterTime(visit.checkInTime)}`}{visit.checkOutTime ? ` · Ra ${formatCenterTime(visit.checkOutTime)}` : ''}</p>
            {visit.denialReason && <p>{visit.denialReason}</p>}
          </div>)}</div>}
        </section>
      </div>
    </div>
  </div>;
}
