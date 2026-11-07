import type { SourceMessage } from '../../shared/i18n/language';
import { useLanguage } from '../../shared/i18n/language';
import { sourceMessage, useI18n } from '../../shared/i18n';
import { useEffect, useRef, useState } from 'react';
import { localizableError } from '../../shared/lib/errorMessage';
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
  useLanguage();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [error, setError] = useState<string | Error | SourceMessage>('');
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
      if (!order) throw Object.assign(new Error('Không tìm thấy khoản cần thanh toán.'), { translation: sourceMessage('Không tìm thấy khoản cần thanh toán.', "Payment item not found.") });
      const checkout = await createVnpayCheckout(order);
      navigateToVnpay(checkout.paymentUrl);
    } catch (reason) {
      setError(localizableError(reason, 'Không thể mở thanh toán VNPay Sandbox. Vui lòng thử lại.'));
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
      if (!order) throw Object.assign(new Error('Không tìm thấy khoản cần thanh toán.'), { translation: sourceMessage('Không tìm thấy khoản cần thanh toán.', "Payment item not found.") });
      await payWithWallet(order);
      window.dispatchEvent(new CustomEvent('wallet-updated'));
      window.dispatchEvent(new CustomEvent('member-notifications-changed'));
      notify(t("Thanh toán bằng Ví SÖL thành công.", "SÖL Wallet payment successful."), 'success', { translation: sourceMessage("Thanh toán bằng Ví SÖL thành công.", "SÖL Wallet payment successful."),  record: true });
      onPaid?.();
    } catch (reason) {
      setError(localizableError(reason, 'Không thể thanh toán bằng Ví SÖL. Vui lòng kiểm tra số dư hoặc nạp thêm tiền vào Ví.'));
    } finally {
      setWalletBusy(false);
      sending.current = false;
    }
  }

  return (
    <div className="stack" data-i18n-managed>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn-primary" disabled={busy || walletBusy || disabled} onClick={() => void pay()}>
          {busy ? t("Đang chuyển tới VNPay…", "Redirecting to VNPay…") : t("Thanh toán VNPay Sandbox", "Pay with VNPay Sandbox")}
        </button>
        <button
          type="button"
          className="btn-secondary"
          data-testid="pay-with-wallet-btn"
          disabled={busy || walletBusy || disabled}
          onClick={() => void handlePayWithWallet()}
        >
          {walletBusy ? t("Đang trừ Ví…", "Charging wallet…") : t("Thanh toán bằng Ví SÖL", "Pay with SÖL Wallet")}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
    </div>
  );
}
