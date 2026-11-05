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

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const methods: Record<string, string> = {
  cash: 'Tiền mặt', pos: 'Thẻ / POS', bank_transfer: 'Chuyển khoản', online_wallet: 'Ví điện tử',
};

function InvoiceDocument({ payment, memberName, membershipCode, packageName, cashierName }: InvoiceProps) {
  return <article className="invoice-document" aria-label="Hóa đơn thanh toán">
    <header className="invoice-document__header">
      <strong className="invoice-document__brand">SÖL</strong>
      <span>Fitness</span>
      <h3>HÓA ĐƠN THANH TOÁN</h3>
      <strong className="invoice-document__number">{payment.invoiceNumber || 'Chưa cấp số hóa đơn'}</strong>
      <span>{formatCenterDateTime(payment.paidAt, 'Chưa có thời gian thanh toán')}</span>
    </header>

    <dl className="invoice-document__details">
      <div><dt>Hội viên</dt><dd>{memberName || payment.memberName || 'Chưa có tên hội viên'}</dd></div>
      {membershipCode && <div><dt>Mã hội viên</dt><dd>{membershipCode}</dd></div>}
      <div><dt>Giao dịch</dt><dd>#{payment.id}</dd></div>
      {cashierName && <div><dt>Thu ngân</dt><dd>{cashierName}</dd></div>}
      <div><dt>Thanh toán</dt><dd>{methods[(payment.method || '').toLowerCase()] ?? (payment.method || '—')}</dd></div>
    </dl>

    <table className="invoice-document__items">
      <caption className="sr-only">Chi tiết dịch vụ đã thanh toán</caption>
      <colgroup><col /><col className="invoice-document__amount-column" /></colgroup>
      <thead><tr><th scope="col">Nội dung</th><th scope="col">Thành tiền</th></tr></thead>
      <tbody><tr>
        <td><strong>{packageName}</strong><small>1 × {money.format(payment.amount)}</small></td>
        <td>{money.format(payment.amount)}</td>
      </tr></tbody>
      <tfoot><tr><th scope="row">Tổng tiền đã thu</th><td>{money.format(payment.amount)}</td></tr></tfoot>
    </table>

    <footer className="invoice-document__footer">
      <strong>ĐÃ THANH TOÁN</strong>
      <p>Cảm ơn quý khách đã lựa chọn SÖL.</p>
      <p>Vui lòng giữ hóa đơn để đối chiếu khi cần.</p>
    </footer>
  </article>;
}

export function PaymentInvoice({ onClose, ...invoice }: InvoiceProps & { onClose: () => void }) {
  return <>
    <Modal title="Hóa đơn thanh toán" onClose={onClose}>
      <p className="payment-invoice__success" role="status">Đã ghi nhận thanh toán thành công.</p>
      <div className="payment-invoice__preview"><InvoiceDocument {...invoice} /></div>
      <div className="payment-invoice__actions">
        <button type="button" className="btn-secondary" onClick={onClose}>Đóng</button>
        <button type="button" className="btn-primary" onClick={() => window.print()}>In hóa đơn (80 mm)</button>
      </div>
    </Modal>
    {createPortal(<div className="invoice-print-root" aria-hidden="true"><InvoiceDocument {...invoice} /></div>, document.body)}
  </>;
}
