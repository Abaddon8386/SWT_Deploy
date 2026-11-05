import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../../shared/ui/Modal';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import { formatPrice } from '../../shared/lib/membershipPresentation';
import { errorMessage } from '../../shared/lib/errorMessage';
import { getMyWallet, type WalletDto, type WalletTransactionDto } from './walletApi';

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

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('vi-VN');
  } catch {
    return iso;
  }
}

export function WalletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [wallet, setWallet] = useState<WalletDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (!open) return null;

  const transactions: WalletTransactionDto[] = wallet?.transactions ?? [];

  return (
    <Modal title="Ví Hội viên SÖL Fitness" onClose={onClose} busy={loading}>
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
            background: 'linear-gradient(135deg, rgba(226, 91, 69, 0.14) 0%, rgba(217, 119, 6, 0.12) 100%)',
            border: '1px solid rgba(226, 91, 69, 0.35)',
          }}
        >
          <div>
            <div className="meta-label">Số dư khả dụng trong Ví</div>
            <div style={{ fontSize: '1.65rem', fontWeight: 700, color: 'var(--color-accent-gold, #fbbf24)', marginTop: 4 }}>
              {formatPrice(Number(wallet?.balance ?? 0))}
            </div>
            <p className="row-card__meta" style={{ marginTop: 4 }}>
              Tự động ghi nhận nạp/trừ từ VNPay và nhận tiền hoàn khi Quản lý duyệt hủy gói tập.
            </p>
          </div>
          <RefreshButton label="Làm mới Ví" onClick={() => void loadWallet()} disabled={loading} />
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
            <div style={{ display: 'grid', gap: 10, maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
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
                          {formatDateTime(tx.createdAt)}
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
