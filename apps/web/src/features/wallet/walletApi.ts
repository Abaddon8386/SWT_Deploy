import { apiFetch } from '../../shared/api/client';
import type { VnpayCheckout, VnpayTarget } from '../payments/vnpayApi';

export type WalletTransactionType = 'TOPUP_VNPAY' | 'PAYMENT_DEBIT' | 'REFUND_CREDIT' | string;

export interface WalletTransactionDto {
  id: number;
  type: WalletTransactionType;
  amount: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  createdAt: string;
}

export interface WalletDto {
  balance: number;
  updatedAt: string;
  transactions: WalletTransactionDto[];
}

export function getMyWallet(): Promise<WalletDto> {
  return apiFetch<WalletDto>('/wallet/my');
}

export function topupWalletVnpay(amount: number): Promise<VnpayCheckout> {
  return apiFetch<VnpayCheckout>('/wallet/topup/vnpay', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export function payWithWallet(target: VnpayTarget): Promise<WalletDto> {
  return apiFetch<WalletDto>('/wallet/pay', {
    method: 'POST',
    body: JSON.stringify(target),
  });
}

export const walletApi = {
  getMyWallet,
  topupWalletVnpay,
  payWithWallet,
};
