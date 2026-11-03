import { apiFetch } from '../../shared/api/client';
import { catalogApi, type MembershipPackage } from '../manager/catalogApi';
import type { CoachBookingDto } from '../member/coachBookingApi';
export type { MembershipPackage };
export type UnpaidCoachBooking = CoachBookingDto;

export interface MemberLookupResult {
  userId: number;
  membershipCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  citizenId?: string | null;
  status: string;
  currentPackage?: string;
  endDate?: string;
}

export interface PendingSubscriptionItem {
  id: number;
  memberId: number;
  membershipCode: string | null;
  memberName: string;
  memberEmail: string;
  memberPhone: string | null;
  packageId: number;
  packageName: string;
  durationDays: number;
  packagePrice: number;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
}

export interface RenewalCandidate {
  id: number;
  memberId: number;
  packageId: number;
  packageName: string;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
}

export interface HoldRequestItem {
  id: number;
  memberId: number;
  membershipCode: string | null;
  memberName: string;
  memberEmail: string;
  memberPhone: string | null;
  packageId: number;
  packageName: string;
  startDate: string;
  endDate: string;
  status: string;
  holdStatus: string;
  holdReason: string;
  holdRequestedAt: string;
  holdResolvedAt?: string | null;
  cancelledEnrollmentsCount: number;
}

export type PaymentMethod = 'cash' | 'pos' | 'bank_transfer' | 'online_wallet';

export interface ProcessPaymentPayload {
  memberId: number;
  packageId: number;
  subscriptionId?: number;
  amount: number;
  method: PaymentMethod;
  notes?: string;
}

export interface PaymentResponseDto {
  id: number;
  memberId: number;
  memberName?: string;
  amount: number;
  method: string;
  status: string;
  paidAt: string;
  invoiceNumber?: string;
}

export interface PaymentReceiptSummary {
  id: number;
  subscriptionId: number | null;
  status: string;
  hasReceipt?: boolean;
  receiptImage?: string | null;
}

export interface InvoiceDto {
  id: number;
  invoiceNumber: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  issuedAt: string;
  pdfUrl?: string | null;
}

/**
 * BR-05: Che một phần (masked) dữ liệu nhạy cảm CCCD (ví dụ: 079******123)
 */
export function maskCitizenId(id?: string | null): string {
  if (!id) return 'Chưa cập nhật';
  const clean = id.trim();
  if (clean.length < 6) return '******';
  const start = clean.slice(0, 3);
  const end = clean.slice(-3);
  return `${start}******${end}`;
}

export const receptionApi = {
  /**
   * Tra cứu hội viên theo SĐT, Mã hội viên hoặc CCCD qua /api/v1/members/lookup
   */
  lookupMembers: async (query: string): Promise<MemberLookupResult[]> => {
    const q = query.trim();
    if (q.length < 2) return [];
    try {
      return await apiFetch<MemberLookupResult[]>(`/members/lookup?q=${encodeURIComponent(q)}`);
    } catch {
      // Fallback tìm kiếm trong /users nếu endpoint lookup chưa khớp schema
      try {
        const users = await apiFetch<Array<{
          id: number;
          roleCode: string;
          fullName: string;
          email: string;
          phone: string | null;
          status: string;
        }>>('/users');
        return users
          .filter(
            (u) =>
              u.roleCode === 'MEMBER' &&
              (u.fullName?.toLowerCase().includes(q.toLowerCase()) ||
                u.phone?.includes(q) ||
                u.email?.toLowerCase().includes(q.toLowerCase()))
          )
          .map((u) => ({
            userId: u.id,
            membershipCode: `MB-2026-${String(u.id).padStart(3, '0')}`,
            fullName: u.fullName,
            email: u.email,
            phone: u.phone,
            citizenId: null,
            status: u.status?.toLowerCase() === 'active' ? 'ACTIVE' : 'INACTIVE',
          }));
      } catch {
        return [];
      }
    }
  },

  /**
   * BR-02: Lấy danh sách gói tập chỉ bao gồm các gói đang 'active'
   */
  getActivePackages: async (): Promise<MembershipPackage[]> => {
    const all = await catalogApi.packages();
    return all.filter((p) => p.status === 'active');
  },

  getRenewalCandidates: (memberId: number): Promise<RenewalCandidate[]> =>
    apiFetch(`/memberships/subscriptions/members/${memberId}/renewal-candidates`),

  createRenewal: (memberId: number, subscriptionId: number): Promise<RenewalCandidate> =>
    apiFetch(`/memberships/subscriptions/members/${memberId}/renew/${subscriptionId}`, { method: 'POST' }),

  /**
   * Lấy danh sách yêu cầu đăng ký/gia hạn/nâng cấp gói tập đang chờ thanh toán (pending_payment)
   */
  getPendingSubscriptions: async (): Promise<PendingSubscriptionItem[]> => {
    return apiFetch<PendingSubscriptionItem[]>('/memberships/subscriptions/pending');
  },

  /**
   * Hủy yêu cầu đăng ký/gia hạn/nâng cấp gói tập đang chờ thanh toán (pending_payment)
   */
  cancelPendingSubscription: async (subscriptionId: number): Promise<void> => {
    await apiFetch(`/memberships/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
    });
  },

  /**
   * Lấy danh sách yêu cầu bảo lưu gói tập đang chờ lễ tân xử lý
   */
  getPendingHoldRequests: async (): Promise<HoldRequestItem[]> => {
    return apiFetch<HoldRequestItem[]>('/memberships/subscriptions/holds/pending');
  },

  /**
   * Lễ tân xác nhận bảo lưu gói tập (tự động hủy các lịch học tương lai của hội viên)
   */
  approveHoldRequest: async (subscriptionId: number): Promise<HoldRequestItem> => {
    return apiFetch<HoldRequestItem>(`/memberships/subscriptions/${subscriptionId}/hold/approve`, {
      method: 'POST',
    });
  },

  /**
   * Lễ tân từ chối yêu cầu bảo lưu gói tập
   */
  rejectHoldRequest: async (subscriptionId: number): Promise<HoldRequestItem> => {
    return apiFetch<HoldRequestItem>(`/memberships/subscriptions/${subscriptionId}/hold/reject`, {
      method: 'POST',
    });
  },

  /** Buổi PT 1:1 trả phí theo giờ chưa thu tiền, cũ nhất trước. */
  getUnpaidCoachBookings: (): Promise<UnpaidCoachBooking[]> => apiFetch('/coach-bookings/unpaid'),

  /** Ghi nhận đã thu tiền buổi PT 1:1; backend tạo payment để tính vào doanh thu. */
  confirmCoachBookingPayment: (bookingId: number, method: string): Promise<UnpaidCoachBooking> =>
    apiFetch(`/coach-bookings/${bookingId}/confirm-payment?method=${encodeURIComponent(method)}`, { method: 'POST' }),

  /** Ảnh hóa đơn tiền mặt hội viên đã gửi cho yêu cầu gói tập đang chờ (null nếu chưa có). */
  getPendingReceipt: async (memberId: number, subscriptionId: number): Promise<string | null> => {
    const payments = await apiFetch<PaymentReceiptSummary[]>(`/payments/member/${memberId}`);
    const match = payments.find((p) => p.subscriptionId === subscriptionId && p.status === 'pending' && p.hasReceipt);
    if (!match) return null;
    const detail = await apiFetch<PaymentReceiptSummary>(`/payments/${match.id}`);
    return detail.receiptImage ?? null;
  },

  /**
   * Xác nhận thu tiền qua Payment API (/payments/process) & tự động phát hành hóa đơn
   */
  processPayment: async (payload: ProcessPaymentPayload): Promise<PaymentResponseDto> => {
    const res = await apiFetch<PaymentResponseDto>('/payments/process', {
      method: 'POST',
      body: JSON.stringify({
        memberId: payload.memberId,
        subscriptionId: payload.subscriptionId,
        packageId: payload.packageId,
        amount: payload.amount,
        method: payload.method,
        note: payload.notes || 'Thu tiền tại quầy Lễ tân POS',
      }),
    });

    return res;
  },
};
