import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../shared/lib/errorMessage';
import { notify } from '../../shared/lib/portalNotices';
import { payWithWallet } from '../wallet/walletApi';
import { createVnpayCheckout, navigateToVnpay, type VnpayTarget } from './vnpayApi';

export function VnpayPayButton({
  target,
  prepare,
  disabled = false,
  onPaid,
}: {
  target?: VnpayTarget;
  prepare?: () => Promise<VnpayTarget>;
  disabled?: boolean;
  onPaid?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);

  // Leaving VNPay with the browser's Back button restores this page from the back/forward cache exactly as it was,
  // i.e. still "redirecting". Reset only local UI; Back is not proof of payment failure.
  // The parent prepare callback and backend revalidate the order before any retry.
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      sending.current = false;
      setBusy(false);
      setWalletBusy(false);
    };
    window.addEventListener('pageshow', restore);
    return () => window.removeEventListener('pageshow', restore);
  }, []);

  async function pay() {
    if (sending.current || disabled) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const order = prepare ? await prepare() : target;
      if (!order) throw new Error('Không tìm thấy khoản cần thanh toán.');
      const checkout = await createVnpayCheckout(order);
      navigateToVnpay(checkout.paymentUrl);
    } catch (reason) {
      setError(errorMessage(reason, 'Không thể mở thanh toán VNPay Sandbox. Vui lòng thử lại.'));
      setBusy(false);
      sending.current = false;
    }
  }

  async function handlePayWithWallet() {
    if (sending.current || disabled) return;
    sending.current = true;
    setWalletBusy(true);
    setError('');
    try {
      const order = prepare ? await prepare() : target;
      if (!order) throw new Error('Không tìm thấy khoản cần thanh toán.');
      await payWithWallet(order);
      window.dispatchEvent(new CustomEvent('wallet-updated'));
      window.dispatchEvent(new CustomEvent('member-notifications-changed'));
      notify('Thanh toán bằng Ví SÖL thành công.', 'success', { record: true });
      onPaid?.();
    } catch (reason) {
      setError(errorMessage(reason, 'Không thể thanh toán bằng Ví SÖL. Vui lòng kiểm tra số dư hoặc nạp thêm tiền vào Ví.'));
    } finally {
      setWalletBusy(false);
      sending.current = false;
    }
  }

  return (
    <div className="stack">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn-primary" disabled={busy || walletBusy || disabled} onClick={() => void pay()}>
          {busy ? 'Đang chuyển tới VNPay…' : 'Thanh toán VNPay Sandbox'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          data-testid="pay-with-wallet-btn"
          disabled={busy || walletBusy || disabled}
          onClick={() => void handlePayWithWallet()}
        >
          {walletBusy ? 'Đang trừ Ví…' : 'Thanh toán bằng Ví SÖL'}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
