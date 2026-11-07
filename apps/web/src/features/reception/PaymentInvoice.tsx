import { staffLocale, useStaffI18n } from '../operations/staffI18n';
import { createPortal } from 'react-dom';
import { Modal } from '../../shared/ui/Modal';
import type { PaymentResponseDto } from './receptionApi';
import { formatCenterDateTime } from '../../shared/lib/centerTime';
import './payment-invoice.css';

interface InvoiceProps {
  payment: PaymentResponseDto;
  memberName: string;
  membershipCode?: string | null;
  packageName: string;
  cashierName?: string;
}

const methods: Record<string, string> = {
  cash: 'Tiền mặt', pos: 'Thẻ / POS', bank_transfer: 'Chuyển khoản', online_wallet: 'Ví điện tử',
};

function InvoiceDocument({ payment, memberName, membershipCode, packageName, cashierName }: InvoiceProps) {
  const { t } = useStaffI18n();
  const money = new Intl.NumberFormat(staffLocale(), { style: 'currency', currency: 'VND' });
  return <article data-i18n-managed className="invoice-document" aria-label={t("Hóa đơn thanh toán")}>
    <header className="invoice-document__header">
      <strong className="invoice-document__brand">{t("SÖL")}</strong>
      <span>Fitness</span>
      <h3>{t("HÓA ĐƠN THANH TOÁN")}</h3>
      <strong className="invoice-document__number">{payment.invoiceNumber || t('Chưa cấp số hóa đơn')}</strong>
      <span>{formatCenterDateTime(payment.paidAt, t('Chưa có thời gian thanh toán'))}</span>
    </header>

    <dl className="invoice-document__details">
      <div><dt>{t("Hội viên")}</dt><dd>{memberName || payment.memberName || t('Chưa có tên hội viên')}</dd></div>
      {membershipCode && <div><dt>{t("Mã hội viên")}</dt><dd>{membershipCode}</dd></div>}
      <div><dt>{t("Giao dịch")}</dt><dd>#{payment.id}</dd></div>
      {cashierName && <div><dt>{t("Thu ngân")}</dt><dd>{cashierName}</dd></div>}
      <div><dt>{t("Thanh toán")}</dt><dd>{t(methods[(payment.method || '').toLowerCase()]) || (payment.method || '—')}</dd></div>
    </dl>

    <table className="invoice-document__items">
      <caption className="sr-only">{t("Chi tiết dịch vụ đã thanh toán")}</caption>
      <colgroup><col /><col className="invoice-document__amount-column" /></colgroup>
      <thead><tr><th scope="col">{t("Nội dung")}</th><th scope="col">{t("Thành tiền")}</th></tr></thead>
      <tbody><tr>
        <td><strong>{packageName}</strong><small>{t("1 × ")}{money.format(payment.amount)}</small></td>
        <td>{money.format(payment.amount)}</td>
      </tr></tbody>
      <tfoot><tr><th scope="row">{t("Tổng tiền đã thu")}</th><td>{money.format(payment.amount)}</td></tr></tfoot>
    </table>

    <footer className="invoice-document__footer">
      <strong>{t("ĐÃ THANH TOÁN")}</strong>
      <p>{t("Cảm ơn quý khách đã lựa chọn SÖL.")}</p>
      <p>{t("Vui lòng giữ hóa đơn để đối chiếu khi cần.")}</p>
    </footer>
  </article>;
}

export function PaymentInvoice({ onClose, ...invoice }: InvoiceProps & { onClose: () => void }) {
  const { t } = useStaffI18n();
  return <>
    <Modal title={t("Hóa đơn thanh toán")} onClose={onClose}>
      <p data-i18n-managed className="payment-invoice__success" role="status">{t("Đã ghi nhận thanh toán thành công.")}</p>
      <div className="payment-invoice__preview"><InvoiceDocument {...invoice} /></div>
      <div className="payment-invoice__actions">
        <button type="button" className="btn-secondary" onClick={onClose}>{t("Đóng")}</button>
        <button type="button" className="btn-primary" onClick={() => window.print()}>{t("In hóa đơn (80 mm)")}</button>
      </div>
    </Modal>
    {createPortal(<div className="invoice-print-root" aria-hidden="true"><InvoiceDocument {...invoice} /></div>, document.body)}
  </>;
}
