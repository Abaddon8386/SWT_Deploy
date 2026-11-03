import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { formatPrice } from '../../shared/lib/membershipPresentation';
import { errorMessage } from '../../shared/lib/errorMessage';
import { getVnpayStatus, type VnpayStatus } from './vnpayApi';

const destinations = new Set(['/member/packages', '/member/courts', '/member/classes?tab=pt', '/member/invoices']);
export function VnpayReturnPage() {
  const [params] = useSearchParams();
  const reference = params.get('vnp_TxnRef') ?? '';
  const valid = /^[A-Za-z0-9]{1,32}$/.test(reference);
  const [data, setData] = useState<VnpayStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined; let attempts = 0;
    setData(null); setError(''); setLoading(true);
    if (!valid) { setLoading(false); return; }
    async function load() {
      try {
        const status = await getVnpayStatus(reference);
        if (!active) return;
        setData(status); setError('');
        if (status.status === 'pending' && ++attempts < 12) timer = setTimeout(() => void load(), 2500);
      } catch (reason) { if (active) setError(errorMessage(reason, 'Không thể kiểm tra giao dịch. Vui lòng thử lại.')); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [reference, valid, retry]);
  const title = data?.status === 'success' ? 'Thanh toán thành công' : data?.status === 'failed' ? 'Thanh toán chưa thành công' : data?.status === 'refunded' ? 'Giao dịch đã hoàn tiền' : 'Đang xác nhận thanh toán';
  return <div className="portal-container">
    <PageHeader eyebrow="VNPay Sandbox" title="Kết quả thanh toán" />
    <section className="portal-card stack">
      {!valid ? <p className="form-error" role="alert">Không tìm thấy mã giao dịch. Vui lòng mở từ giao dịch của bạn.</p> : loading ? <LoadingSkeleton label="Đang kiểm tra với hệ thống…" count={2} /> : error ? <p className="form-error" role="alert">{error}</p> : data && <>
        <h2 className="portal-card-title" aria-live="polite">{title}</h2>
        <p>Mã giao dịch: {data.reference}</p><p>Số tiền: <strong>{formatPrice(data.amount)}</strong></p>
        {data.status === 'pending' && <p>Hệ thống chưa nhận xác nhận từ VNPay. Vui lòng chờ; không thanh toán thêm cho khoản này. Nếu quá thời gian chờ, liên hệ lễ tân để đối soát.</p>}
        {data.status === 'failed' && <p>VNPay xác nhận giao dịch không thành công. Bạn có thể trở về khoản cần thanh toán và thử lại.</p>}
        <Link className="btn-primary" to={destinations.has(data.destination) ? data.destination : '/member/invoices'}>Về khoản thanh toán</Link>
      </>}
      {valid && (error || data?.status === 'pending') && <button type="button" className="btn-secondary" onClick={() => setRetry(value => value + 1)}>Kiểm tra lại</button>}
      <Link className="btn-secondary" to="/member/invoices">Giao dịch & hóa đơn</Link>
    </section>
  </div>;
}
