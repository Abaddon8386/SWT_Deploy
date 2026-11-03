import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { QrCameraScanner } from '../checkin/QrCameraScanner';
import { memberCheckinApi } from './memberCheckinApi';
import type { CheckinDto } from '../reception/checkinApi';
import { formatCenterDateTime, formatCenterTime } from '../../shared/lib/centerTime';
import { errorMessage } from '../../shared/lib/errorMessage';

export function MemberCheckInPage() {
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
    try { const visits = await memberCheckinApi.history(); if (mounted.current) setHistory(Array.isArray(visits) ? visits : []); }
    catch { if (mounted.current) setHistoryError('Không thể tải lịch sử ra vào.'); }
    finally { if (mounted.current) setLoading(false); }
  }, []);
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
    if (!/^SOL:GATE:1:(A1|A2|B1):\d+:[a-f0-9]{64}$/.test(code)) {
      setError('Đây không phải mã QR cổng SÖL. Hãy quét mã đang hiển thị tại lễ tân.'); return;
    }
    busy.current = true; setPending(true);
    try {
      const response = await memberCheckinApi.scan(code);
      if (!mounted.current) return;
      setResult(response); void loadHistory();
    } catch (reason) { if (mounted.current) setError(errorMessage(reason, 'Check-in chưa được xác nhận. Vui lòng thử lại.')); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  const granted = result?.status.toUpperCase() === 'GRANTED';

  return <div className="portal-container">
    <PageHeader eyebrow="Hội viên" title="Quét QR check-in" subtitle="Quét mã cổng tại lễ tân để ghi nhận lượt vào trung tâm." />
    <div className="qr-checkin-layout">
      <div className="portal-card">
        {!online && <p className="qr-checkin-error" role="alert">Bạn đang mất mạng. Check-in cần kết nối với trung tâm.</p>}
        {pending && <p role="status" aria-live="polite">Đang xác nhận check-in…</p>}
        {error && <p className="qr-checkin-error" role="alert">{error}</p>}
        {result && <div role="status" aria-live="polite" className="qr-checkin-result" data-granted={granted}>
          <h2>{granted ? 'Check-in thành công' : 'Chưa thể check-in'}</h2>
          <p>{granted ? `${result.memberName || 'Hội viên'} · ${result.gate || 'Cổng trung tâm'}` : result.denialReason || 'Vui lòng kiểm tra gói tập hoặc liên hệ lễ tân.'}</p>
          {granted ? <p>Giờ vào: {formatCenterDateTime(result.checkInTime)}</p> : <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}><Link className="btn-primary btn-sm" to="/member/packages">Xem gói tập</Link><Link className="btn-secondary btn-sm" to="/member/card">Kiểm tra thẻ hội viên</Link></div>}
        </div>}
        <QrCameraScanner onScan={(code) => void scan(code)} disabled={pending || !online} />
      </div>
      <div className="stack">
        <section className="portal-card">
          <h2 className="portal-card-title">Trước khi vào tập</h2>
          <ol className="qr-checkin-steps"><li>Mở camera và cho phép quyền truy cập.</li><li>Quét mã QR cổng trên màn hình lễ tân.</li><li>Chờ xác nhận check-in thành công.</li></ol>
          <p className="qr-checkin-hint">Gói tập cần đang có hiệu lực. Nếu gặp khó khăn, xuất trình thẻ hội viên để lễ tân hỗ trợ.</p>
          <Link className="btn-secondary" to="/member/card">Mở thẻ hội viên</Link>
        </section>
        <section className="portal-card" aria-label="Lịch sử ra vào hôm nay">
          <h2 className="portal-card-title">Ra vào hôm nay</h2>
          {loading ? <LoadingSkeleton label="Đang tải lịch sử…" count={3} /> : historyError ? <><p role="alert">{historyError}</p><button className="btn-secondary" onClick={() => void loadHistory()}>Thử lại</button></> : history.length === 0 ? <p className="qr-checkin-hint">Chưa có lượt ra vào hôm nay.</p> : <div className="stack">{history.slice(0, 5).map((visit) => <div key={visit.id} className="qr-checkin-result">
            <strong>{visit.status.toUpperCase() === 'GRANTED' ? visit.checkOutTime ? 'Đã ra về' : 'Đã vào trung tâm' : 'Check-in bị từ chối'}</strong>
            <p>{visit.gate} · Vào {formatCenterTime(visit.checkInTime)}{visit.checkOutTime ? ` · Ra ${formatCenterTime(visit.checkOutTime)}` : ''}</p>
            {visit.denialReason && <p>{visit.denialReason}</p>}
          </div>)}</div>}
        </section>
      </div>
    </div>
  </div>;
}
