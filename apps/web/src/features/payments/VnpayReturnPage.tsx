import { sourceMessage, useI18n } from '../../shared/i18n';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { formatPrice } from '../../shared/lib/membershipPresentation';
import { localizableError } from '../../shared/lib/errorMessage';
import { toast } from '../../shared/ui/toast';
import { getVnpayStatus, verifyVnpayReturn, type VnpayStatus } from './vnpayApi';

const destinations = new Set(['/member/packages', '/member/courts', '/member/classes?tab=pt', '/member/invoices']);
function isAllowedDestination(destination: string | null | undefined): destination is string {
  return Boolean(destination && (destinations.has(destination) || /^\/member\/orders\/\d+$/.test(destination)));
}
export function VnpayReturnPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const reference = params.get('vnp_TxnRef') ?? '';
  const valid = /^[A-Za-z0-9]{1,32}$/.test(reference);
  const [data, setData] = useState<VnpayStatus | null>(null);
  const [error, setError] = useState<string | Error>('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined; let attempts = 0; let notified = false;
    setData(null); setError(''); setLoading(true);
    if (!valid) { setLoading(false); return; }
    async function load() {
      try {
        const hasSignedCallback = params.has('vnp_SecureHash') && params.has('vnp_ResponseCode');
        const status = (hasSignedCallback && attempts === 0 && typeof verifyVnpayReturn === 'function')
          ? await verifyVnpayReturn(Object.fromEntries(params.entries()))
          : await getVnpayStatus(reference);
        if (!active) return;
        setData(status); setError('');
        if (!notified && status.status !== 'pending') {
          notified = true;
          if (status.status === 'success') { toast.success(t("Thanh toán VNPay thành công"), sourceMessage("Thanh toán VNPay thành công")); window.dispatchEvent(new Event('member-notifications-changed')); }
          else if (status.status === 'failed') toast.error(t("Thanh toán VNPay chưa thành công"), sourceMessage("Thanh toán VNPay chưa thành công"));
        }
        if (status.status === 'pending' && ++attempts < 12) timer = setTimeout(() => void load(), 2500);
      } catch (reason) { if (active) setError(localizableError(reason, 'Không thể kiểm tra giao dịch. Vui lòng thử lại.')); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [params, reference, valid, retry, t]);
  const title = data?.status === 'success' ? t("Thanh toán thành công") : data?.status === 'failed' ? t("Thanh toán chưa thành công") : data?.status === 'refunded' ? t("Giao dịch đã hoàn tiền") : t("Đang xác nhận thanh toán");
  return <div className="portal-container" data-i18n-managed>
    <PageHeader eyebrow="VNPay Sandbox" title={t("Kết quả thanh toán")} />
    <section className="portal-card stack">
      {!valid ? <p className="form-error" role="alert">{t("Không tìm thấy mã giao dịch. Vui lòng mở từ giao dịch của bạn.")}</p> : loading ? <LoadingSkeleton label={t("Đang kiểm tra với hệ thống…")} count={2} /> : error ? <p className="form-error" role="alert">{t(error)}</p> : data && <>
        <h2 className="portal-card-title" aria-live="polite">{title}</h2>
        <p>{t("Mã giao dịch: ")}{data.reference}</p><p>{t("Số tiền: ")}<strong>{formatPrice(data.amount)}</strong></p>
        {data.status === 'pending' && <p>{t("Hệ thống chưa nhận xác nhận từ VNPay. Vui lòng chờ; không thanh toán thêm cho khoản này. Nếu quá thời gian chờ, liên hệ lễ tân để đối soát.")}</p>}
        {data.status === 'failed' && <p>{t("VNPay xác nhận giao dịch không thành công. Bạn có thể trở về khoản cần thanh toán và thử lại.")}</p>}
        <Link className="btn-primary" to={isAllowedDestination(data.destination) ? data.destination : '/member/invoices'}>{t("Về khoản thanh toán")}</Link>
      </>}
      {valid && (error || data?.status === 'pending') && <button type="button" className="btn-secondary" onClick={() => setRetry(value => value + 1)}>{t("Kiểm tra lại")}</button>}
      <Link className="btn-secondary" to="/member/invoices">{t("Giao dịch & hóa đơn")}</Link>
    </section>
  </div>;
}
