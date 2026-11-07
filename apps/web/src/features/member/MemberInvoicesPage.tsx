import { memberMessage, memberText, memberRenderMessage } from './memberI18n';
import type { SourceMessage } from '../../shared/i18n/language';
import { useLanguage } from '../../shared/i18n/language';
import { VnpayPayButton } from '../payments/VnpayPayButton';
import { useEffect, useState } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { Modal } from '../../shared/ui/Modal';
import { ApiError } from '../../shared/api/client';
import { formatPrice } from '../../shared/lib/membershipPresentation';
import { formatCenterDateTime } from '../../shared/lib/centerTime';
import { getMyPayments, type Payment } from './membershipApi';
import { getMyInvoiceByPayment, getMyInvoicePdf, type MemberInvoice } from './memberInvoicesApi';
import './member-invoices.css';


export function MemberInvoicesPage() {
  useLanguage();
  const [pending, setPending] = useState<Payment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Payment | null>(null);
  const [invoice, setInvoice] = useState<MemberInvoice | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null | SourceMessage>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  useEffect(() => {
    let active = true;
    getMyPayments().then((data) => {
      if (!active) return;
      setPending(data.filter(payment => payment.status === 'pending'));
      setPayments(data.filter((payment) => payment.status.toLowerCase() === 'success')
        .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? '') || b.id - a.id));
      setError(false);
    }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setInvoice(null);
    setInvoiceError(null);
    setInvoiceLoading(true);
    getMyInvoiceByPayment(selected.id).then((data) => {
      if (active) setInvoice(data);
    }).catch((reason: unknown) => {
      if (active) setInvoiceError(reason instanceof ApiError && reason.status === 404
        ? memberMessage('Giao dịch này chưa có hóa đơn điện tử.') : memberMessage('Không tải được hóa đơn. Vui lòng thử lại.'));
    }).finally(() => { if (active) setInvoiceLoading(false); });
    return () => { active = false; };
  }, [selected]);

  async function downloadInvoice(paymentId: number) {
    setDownloading(true);
    setDownloadError(false);
    try {
      const pdf = await getMyInvoicePdf(paymentId);
      const url = URL.createObjectURL(pdf);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `invoice-${paymentId}.pdf`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div data-i18n-managed className="portal-container member-invoices">
      <PageHeader eyebrow={memberText("Hội viên")} title={memberText("Giao dịch & hóa đơn")} />
      {!loading && !error && pending.length > 0 && <section data-i18n-managed className="portal-card stack" aria-label={memberText("Khoản chờ thanh toán")}>
        <h2 className="portal-card-title">{memberText("Khoản chờ thanh toán")}</h2>
        {pending.map(payment => <div className="row-card" key={payment.id}><span>{memberText("Giao dịch #")}{payment.id} · {formatPrice(payment.amount)}</span><VnpayPayButton target={{ paymentId: payment.id }} onPaid={() => setReload((n) => n + 1)} /></div>)}
        <p className="row-card__meta" style={{ margin: 0 }}>{memberText("Lưu ý: Nếu thanh toán bằng tiền mặt, vui lòng gặp trực tiếp Lễ tân tại quầy.")}</p>
      </section>}
      <section data-i18n-managed className="portal-card member-invoices__card" aria-label={memberText("Lịch sử giao dịch")}>
        {loading ? <LoadingSkeleton label={memberText("Đang tải giao dịch…")} variant="table" count={4} /> : error ? (
          <div role="alert"><p>{memberText("Không tải được giao dịch. Vui lòng thử lại.")}</p><button type="button" className="btn-secondary btn-sm" onClick={() => { setLoading(true); setReload((n) => n + 1); }}>{memberText("Thử lại")}</button></div>
        ) : payments.length === 0 ? <p>{memberText("Chưa có giao dịch thanh toán thành công.")}</p> : (
          <div className="member-invoices__scroll">
            <table className="member-invoices__table">
              <thead><tr><th scope="col">{memberText("Mã giao dịch")}</th><th scope="col">{memberText("Ngày giờ thanh toán")}</th><th scope="col">{memberText("Số tiền")}</th><th scope="col"><span className="sr-only">{memberText("Chi tiết")}</span></th></tr></thead>
              <tbody>{payments.map((payment) => <tr key={payment.id}>
                <td>#{payment.id}</td><td>{formatCenterDateTime(payment.paidAt)}</td><td>{formatPrice(payment.amount)}</td>
                <td><button type="button" className="member-invoices__detail" onClick={() => setSelected(payment)} aria-label={memberText(`Xem hóa đơn giao dịch #${payment.id}`, `View invoice for transaction #${payment.id}`)}>{memberText("Xem hóa đơn ")}<span aria-hidden="true">↗</span></button></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
      {selected && <Modal title={memberText("Hóa đơn điện tử")} onClose={() => setSelected(null)}>
        <div className="member-invoices__invoice">
          {invoiceLoading ? <LoadingSkeleton label={memberText("Đang tải hóa đơn…")} variant="profile" /> : invoiceError ? <p role="alert">{memberRenderMessage(invoiceError)}</p> : invoice && <>
            <p className="member-invoices__number">{invoice.invoiceNumber}</p>
            <p className="member-invoices__issued">{memberText("Phát hành lúc ")}{formatCenterDateTime(invoice.issuedAt)}</p>
            <dl>
              <div><dt>{memberText("Giao dịch")}</dt><dd>#{invoice.paymentId}</dd></div>
              <div><dt>{memberText("Thanh toán lúc")}</dt><dd>{formatCenterDateTime(selected.paidAt)}</dd></div>
              <div><dt>{memberText("Trước thuế")}</dt><dd>{formatPrice(invoice.subtotalAmount)}</dd></div>
              <div><dt>VAT</dt><dd>{formatPrice(invoice.taxAmount)}</dd></div>
              <div className="member-invoices__total"><dt>{memberText("Tổng tiền")}</dt><dd>{invoice.totalAmount == null ? memberText("Chưa có dữ liệu") : formatPrice(invoice.totalAmount)}</dd></div>
            </dl>
            <button type="button" className="btn-primary member-invoices__download" disabled={downloading || invoice.totalAmount == null}
              onClick={() => void downloadInvoice(invoice.paymentId)}>
              {downloading ? memberText("Đang tải file…") : memberText("Tải hóa đơn PDF")}
            </button>
            <p className="member-invoices__note">{memberText("Bản PDF thông tin từ hệ thống, không thay thế hóa đơn thuế ký số.")}</p>
            {downloadError && <p role="alert">{memberText("Không tải được file hóa đơn. Vui lòng thử lại.")}</p>}
          </>}
        </div>
      </Modal>}
    </div>
  );
}
