import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../../shared/ui/Modal';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import { formatPrice } from '../../shared/lib/membershipPresentation';
import { formatCenterDateTime } from '../../shared/lib/centerTime';
import { errorMessage } from '../../shared/lib/errorMessage';
import { navigateToVnpay } from '../payments/vnpayApi';
import { getMyWallet, topupWalletVnpay, type WalletDto, type WalletTransactionDto } from './walletApi';

const QUICK_TOPUP_AMOUNTS = [100_000, 200_000, 500_000, 1_000_000];

function txTypeLabel(type: string): string {
  switch (type) {
    case 'TOPUP_VNPAY':
      return 'Nạp từ VNPay';
    case 'PAYMENT_DEBIT':
      return 'Thanh toán dịch vụ';
    case 'REFUND_CREDIT':
      return 'Hoàn tiền hủy gói tập';
    default:
      return type;
  }
}

function isCreditTx(type: string): boolean {
  return type === 'TOPUP_VNPAY' || type === 'REFUND_CREDIT';
}

export function WalletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [wallet, setWallet] = useState<WalletDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState<string>('200000');
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupError, setTopupError] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyWallet();
      setWallet(data);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Không thể tải thông tin Ví hội viên.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadWallet();
    }
  }, [open, loadWallet]);

  async function handleTopup() {
    if (topupBusy) return;
    const numeric = Number(topupAmount);
    if (!Number.isFinite(numeric) || numeric < 10_000 || numeric > 100_000_000) {
      setTopupError('Số tiền nạp vào Ví phải từ 10.000 đ đến 100.000.000 đ.');
      return;
    }
    setTopupBusy(true);
    setTopupError(null);
    try {
      const checkout = await topupWalletVnpay(numeric);
      navigateToVnpay(checkout.paymentUrl);
    } catch (err: unknown) {
      setTopupError(errorMessage(err, 'Không thể tạo giao dịch nạp tiền VNPay. Vui lòng thử lại.'));
      setTopupBusy(false);
    }
  }

  if (!open) return null;

  const transactions: WalletTransactionDto[] = wallet?.transactions ?? [];

  return (
    <Modal title="Ví Hội viên SÖL Fitness" onClose={onClose} busy={loading || topupBusy}>
      <div className="stack" style={{ display: 'grid', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            padding: '16px 18px',
            borderRadius: 12,
            background: 'var(--portal-raised, #303030)',
            border: '1px solid var(--portal-border-strong, #ffffff30)',
          }}
        >
          <div>
            <div className="meta-label">Số dư khả dụng trong Ví</div>
            <div style={{ fontSize: '1.65rem', fontWeight: 700, color: 'var(--portal-salmon, #ce9180)', marginTop: 4 }}>
              {formatPrice(Number(wallet?.balance ?? 0))}
            </div>
            <p className="row-card__meta" style={{ marginTop: 4 }}>
              Dùng để thanh toán gói tập, đặt sân, PT 1:1 và nhận tiền hoàn hủy gói.
            </p>
          </div>
          <RefreshButton label="Làm mới Ví" onClick={() => void loadWallet()} disabled={loading} />
        </div>

        <div
          style={{
            padding: '14px 16px',
            borderRadius: 12,
            border: '1px solid var(--portal-border, #ffffff1a)',
            background: 'var(--portal-surface, #292929)',
            display: 'grid',
            gap: 10,
          }}
        >
          <div className="portal-label" style={{ marginBottom: 0 }}>Nạp tiền vào Ví qua VNPay Sandbox</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {QUICK_TOPUP_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                className={Number(topupAmount) === amt ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                onClick={() => {
                  setTopupError(null);
                  setTopupAmount(String(amt));
                }}
              >
                +{formatPrice(amt)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="number"
              className="portal-input"
              aria-label="Số tiền nạp vào Ví (VNĐ)"
              min={10000}
              max={100000000}
              step={10000}
              value={topupAmount}
              onChange={(e) => {
                setTopupError(null);
                setTopupAmount(e.target.value);
              }}
              style={{ flex: '1 1 160px' }}
            />
            <button
              type="button"
              className="btn-primary"
              data-testid="wallet-topup-btn"
              disabled={topupBusy}
              onClick={() => void handleTopup()}
            >
              {topupBusy ? 'Đang chuyển tới VNPay…' : 'Nạp vào Ví qua VNPay'}
            </button>
          </div>
          {topupError && (
            <p className="form-error" role="alert" style={{ margin: 0 }}>
              {topupError}
            </p>
          )}
        </div>

        {error && (
          <div className="portal-alert" role="alert">
            <span>{error}</span>
            <button type="button" className="btn-secondary btn-sm" onClick={() => void loadWallet()}>
              Thử lại
            </button>
          </div>
        )}

        <div>
          <h3 className="portal-card-title" style={{ fontSize: '1rem', marginBottom: 10 }}>
            Lịch sử biến động số dư ({transactions.length})
          </h3>
          {loading && !wallet ? (
            <p className="row-card__meta" role="status">Đang tải lịch sử giao dịch Ví…</p>
          ) : transactions.length === 0 ? (
            <p className="row-card__meta" style={{ padding: '16px 0', textAlign: 'center' }}>
              Chưa có giao dịch nào trong Ví của bạn.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 10, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
              {transactions.map((tx) => {
                const credit = isCreditTx(tx.type);
                return (
                  <div
                    key={tx.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--color-border-subtle)',
                      backgroundColor: 'var(--color-bg-warm)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className={`badge ${credit ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: '0.72rem' }}>
                          {txTypeLabel(tx.type)}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                          {formatCenterDateTime(tx.createdAt)}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.88rem', marginTop: 4, color: 'var(--color-text-main)' }}>
                        {tx.description || txTypeLabel(tx.type)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div
                        style={{
                          fontWeight: 700,
                          color: credit ? 'var(--portal-success, #86efac)' : 'var(--color-text-main)',
                        }}
                      >
                        {credit ? '+' : '-'}
                        {formatPrice(Number(tx.amount))}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        Số dư: {formatPrice(Number(tx.balanceAfter))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-primary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </Modal>
  );
}
