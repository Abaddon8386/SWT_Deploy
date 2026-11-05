import { apiFetch } from '../../shared/api/client';

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

export const walletApi = {
  getMyWallet,
};
