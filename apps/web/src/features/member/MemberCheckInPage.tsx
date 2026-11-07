import { memberMessage, memberError, memberText, memberRenderMessage } from './memberI18n';
import type { SourceMessage } from '../../shared/i18n/language';
import { useLanguage } from '../../shared/i18n/language';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { QrCameraScanner } from '../checkin/QrCameraScanner';
import { memberCheckinApi } from './memberCheckinApi';
import type { CheckinDto } from '../reception/checkinApi';
import { formatCenterDateTime, formatCenterTime } from '../../shared/lib/centerTime';

type Mode = 'in' | 'out';
const RANGES = [{ days: 1, label: 'Hôm nay' }, { days: 7, label: '7 ngày' }, { days: 30, label: '30 ngày' }];
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function MemberCheckInPage() {
  useLanguage();
  const [mode, setMode] = useState<Mode>('in');
  const [days, setDays] = useState(1);
  const [result, setResult] = useState<CheckinDto | null>(null);
  const [history, setHistory] = useState<CheckinDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | SourceMessage>('');
  const [historyError, setHistoryError] = useState<string | SourceMessage>('');
  const [online, setOnline] = useState(navigator.onLine);
  const busy = useRef(false);
  const mounted = useRef(true);
  const loadHistory = useCallback(async () => {
    setLoading(true); setHistoryError('');
    try { const today = new Date(); const from = new Date(today); from.setDate(today.getDate() - days + 1);
      const visits = await memberCheckinApi.history(days === 1 ? undefined : { fromDate: isoDay(from), toDate: isoDay(today) }); if (mounted.current) setHistory(Array.isArray(visits) ? visits : []); }
    catch { if (mounted.current) setHistoryError(memberMessage("Không thể tải lịch sử ra vào.")); }
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
    if (!navigator.onLine) { setError(memberMessage("Bạn đang mất mạng. Kết nối lại rồi quét QR cổng để check-in.")); return; }
    if (!code.startsWith('SOL:GATE:')) {
      setError(memberMessage("Đây không phải mã QR cổng SÖL. Hãy quét mã đang hiển thị tại lễ tân.")); return;
    }
    busy.current = true; setPending(true);
    try {
      const response = mode === 'out' ? await memberCheckinApi.checkout(code) : await memberCheckinApi.scan(code);
      if (!mounted.current) return;
      setResult(response); void loadHistory();
    } catch (reason) { if (mounted.current) setError(memberError(reason, 'Check-in chưa được xác nhận. Vui lòng thử lại.')); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  const granted = result?.status.toUpperCase() === 'GRANTED';
  const checkedOut = mode === 'out' && granted && !!result?.checkOutTime;

  return <div data-i18n-managed className="portal-container">
    <PageHeader eyebrow={memberText("Hội viên")} title={mode === 'out' ? memberText("Quét QR check-out") : memberText("Quét QR check-in")} />
    <div className="qr-checkin-layout">
      <div className="portal-card">
        {!online && <p className="qr-checkin-error" role="alert">{memberText("Bạn đang mất mạng. Check-in cần kết nối với trung tâm.")}</p>}
        {pending && <p role="status" aria-live="polite">{memberText("Đang xác nhận check-in…")}</p>}
        {error && <p className="qr-checkin-error" role="alert">{memberRenderMessage(error)}</p>}
        {result && <div role="status" aria-live="polite" className="qr-checkin-result" data-granted={granted}>
          <h2>{checkedOut ? memberText("Check-out thành công") : granted ? memberText("Check-in thành công") : memberText("Chưa thể check-in")}</h2>
          <p>{granted ? `${result.memberName || memberText("Hội viên")} · ${result.gate || memberText("Cổng trung tâm")}` : result.denialReason || memberText("Vui lòng kiểm tra gói tập hoặc liên hệ lễ tân.")}</p>
          {granted ? <p>{checkedOut && result?.checkOutTime ? memberText(`Giờ ra: ${formatCenterDateTime(result.checkOutTime)}`, `Check-out time: ${formatCenterDateTime(result.checkOutTime)}`) : memberText(`Giờ vào: ${formatCenterDateTime(result.checkInTime)}`, `Check-in time: ${formatCenterDateTime(result.checkInTime)}`)}</p> : <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}><Link className="btn-primary btn-sm" to="/member/packages">{memberText("Xem gói tập")}</Link><Link className="btn-secondary btn-sm" to="/member/card">{memberText("Kiểm tra thẻ hội viên")}</Link></div>}
        </div>}
        <div role="group" aria-label={memberText("Chế độ quét")} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" className={mode === 'in' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} aria-pressed={mode === 'in'} onClick={() => { setMode('in'); setResult(null); setError(''); }}>Check-in</button>
          <button type="button" className={mode === 'out' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} aria-pressed={mode === 'out'} onClick={() => { setMode('out'); setResult(null); setError(''); }}>Check-out</button>
        </div>
        <QrCameraScanner onScan={(code) => void scan(code)} disabled={pending || !online} />
      </div>
      <div className="stack">
        <section data-i18n-managed className="portal-card">
          <h2 className="portal-card-title">{memberText("Trước khi vào tập")}</h2>
          <ol className="qr-checkin-steps"><li>{memberText("Mở camera và cho phép quyền truy cập.")}</li><li>{memberText("Quét mã QR cổng trên màn hình lễ tân.")}</li><li>{memberText("Chờ xác nhận check-in thành công.")}</li></ol>
          <Link className="btn-secondary" to="/member/card">{memberText("Mở thẻ hội viên")}</Link>
        </section>
        <section data-i18n-managed className="portal-card" aria-label={memberText("Lịch sử ra vào")}>
          <h2 className="portal-card-title">{memberText("Lịch sử ra vào")}</h2>
          <div role="group" aria-label={memberText("Khoảng thời gian")} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {RANGES.map((range) => <button key={range.days} type="button" className={days === range.days ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} aria-pressed={days === range.days} onClick={() => setDays(range.days)}>{memberText(range.label)}</button>)}
          </div>
          {loading ? <LoadingSkeleton label={memberText("Đang tải lịch sử…")} count={3} /> : historyError ? <><p role="alert">{memberRenderMessage(historyError)}</p><button className="btn-secondary" onClick={() => void loadHistory()}>{memberText("Thử lại")}</button></> : history.length === 0 ? <p className="qr-checkin-hint">{memberText("Chưa có lượt ra vào trong khoảng này.")}</p> : <div className="stack">{history.slice(0, days === 1 ? 5 : 20).map((visit) => <div key={visit.id} className="qr-checkin-result">
            <strong>{visit.status.toUpperCase() === 'GRANTED' ? visit.checkOutTime ? memberText("Đã ra về") : memberText("Đã vào trung tâm") : memberText("Check-in bị từ chối")}</strong>
            <p>{visit.gate || memberText("Cổng không xác định")} · {days > 1 ? formatCenterDateTime(visit.checkInTime) : memberText(`Vào ${formatCenterTime(visit.checkInTime)}`, `In ${formatCenterTime(visit.checkInTime)}`)}{visit.checkOutTime ? memberText(` · Ra ${formatCenterTime(visit.checkOutTime)}`, ` · Out ${formatCenterTime(visit.checkOutTime)}`) : ''}</p>
            {visit.denialReason && <p>{visit.denialReason}</p>}
          </div>)}</div>}
        </section>
      </div>
    </div>
  </div>;
}
