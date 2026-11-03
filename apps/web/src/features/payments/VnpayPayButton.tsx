import { useRef, useState } from 'react';
import { errorMessage } from '../../shared/lib/errorMessage';
import { createVnpayCheckout, navigateToVnpay, type VnpayTarget } from './vnpayApi';

export function VnpayPayButton({ target, prepare, disabled = false }: { target?: VnpayTarget; prepare?: () => Promise<VnpayTarget>; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);
  async function pay() {
    if (sending.current || disabled) return;
    sending.current = true; setBusy(true); setError('');
    try {
      const order = prepare ? await prepare() : target;
      if (!order) throw new Error('Không tìm thấy khoản cần thanh toán.');
      const checkout = await createVnpayCheckout(order);
      navigateToVnpay(checkout.paymentUrl);
    } catch (reason) {
      setError(errorMessage(reason, 'Không thể mở thanh toán VNPay Sandbox. Vui lòng thử lại.'));
      setBusy(false); sending.current = false;
    }
  }
  return <div className="stack">
    <button type="button" className="btn-primary" disabled={busy || disabled} onClick={() => void pay()}>{busy ? 'Đang chuyển tới VNPay…' : 'Thanh toán VNPay Sandbox'}</button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
