import { apiFetch } from '../../shared/api/client';

export type VnpayTarget = { subscriptionId: number } | { coachBookingId: number } | { courtBookingId: number } | { paymentId: number } | { productOrderId: number };
export interface VnpayCheckout { reference: string; paymentUrl: string; amount: number; expiresAt: string }
export interface VnpayStatus { reference: string; paymentId: number; subscriptionId: number | null; amount: number; status: 'pending' | 'success' | 'failed' | 'refunded'; expiresAt: string; destination: string }
export const createVnpayCheckout = (target: VnpayTarget) => apiFetch<VnpayCheckout>('/payments/vnpay/checkout', { method: 'POST', body: JSON.stringify(target) });
export const getVnpayStatus = (reference: string) => apiFetch<VnpayStatus>(`/payments/vnpay/transactions/${encodeURIComponent(reference)}`);
export const verifyVnpayReturn = (params: Record<string, string>) =>
  apiFetch<VnpayStatus>('/payments/vnpay/verify-return', { method: 'POST', body: JSON.stringify(params) });
export function navigateToVnpay(paymentUrl: string) {
  const url = new URL(paymentUrl);
  if (url.origin !== 'https://sandbox.vnpayment.vn' || url.pathname !== '/paymentv2/vpcpay.html') throw new Error('Địa chỉ VNPay Sandbox không hợp lệ.');
  window.location.assign(url.href);
}
