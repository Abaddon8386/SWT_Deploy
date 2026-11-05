import { apiFetch } from '../../shared/api/client';

export interface MembershipPackage {
  id: number;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  classCreditLimit: number | null;
  status: 'active' | 'inactive';
}

export interface MemberSubscription {
  id: number;
  memberId: number;
  packageId: number;
  packageName: string;
  previousSubscriptionId: number | null;
  startDate: string;
  endDate: string;
  paidThroughDate?: string | null;
  /** Quoted amount of a pending upgrade: new package price minus `creditApplied`; null for other subscriptions. */
  upgradeCharge?: number | null;
  /** Pending registration or renewal: catalog price fixed when the request was made; null for older requests. */
  quotedPrice?: number | null;
  /** Pending upgrade: unused value of the replaced period already deducted from the price. */
  creditApplied?: number | null;
  /** Period active today: unused share of what was actually paid, deducted by an upgrade. */
  remainingValue?: number | null;
  status: string;
  qrCode: string | null;
  createdAt: string;
  holdStatus?: string | null;
  holdReason?: string | null;
  holdRequestedAt?: string | null;
  holdResolvedAt?: string | null;
}

export interface Payment {
  id: number;
  memberId: number;
  memberName: string | null;
  subscriptionId: number | null;
  classEnrollmentId: number | null;
  amount: number;
  method: string;
  status: string;
  paidAt: string | null;
  receivedById: number | null;
  receivedByName: string | null;
  note: string | null;
  createdAt: string;
  invoiceNumber: string | null;
}

export interface MembershipCancellationRequest {
  id: number;
  memberId: number;
  memberName: string | null;
  subscriptionId: number;
  packageName: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  resolvedById: number | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export const getMyMembershipCancellations = () =>
  apiFetch<MembershipCancellationRequest[]>('/memberships/cancellations/my');

export const getMembershipPackages = () =>
  apiFetch<MembershipPackage[]>('/packages');

export const getCurrentMembership = () =>
  apiFetch<MemberSubscription | null>('/memberships/subscriptions/my');

export const getMembershipHistory = () =>
  apiFetch<MemberSubscription[]>('/memberships/subscriptions/history');

export const getMyPayments = () => apiFetch<Payment[]>('/payments/my');

export const createPaymentRequest = (subscription: MemberSubscription, amount: number) =>
  apiFetch<Payment>('/payments', {
    method: 'POST',
    body: JSON.stringify({
      memberId: subscription.memberId,
      subscriptionId: subscription.id,
      amount,
      method: 'online_wallet',
    }),
  });

/** Thanh toán tiền mặt: gửi ảnh hóa đơn để lễ tân đối chiếu và xác nhận trên web. */
export const createCashReceiptPayment = (subscription: MemberSubscription, amount: number, receiptImage: string) =>
  apiFetch<Payment>('/payments', {
    method: 'POST',
    body: JSON.stringify({
      memberId: subscription.memberId,
      subscriptionId: subscription.id,
      amount,
      method: 'cash',
      receiptImage,
    }),
  });

export const createMembershipSubscription = (packageId: number) =>
  apiFetch<MemberSubscription>('/memberships/subscriptions', {
    method: 'POST',
    body: JSON.stringify({ packageId }),
  });

export const renewMembershipSubscription = (subscriptionId: number) =>
  apiFetch<MemberSubscription>(
    `/memberships/subscriptions/${subscriptionId}/renew`,
    {
      method: 'POST',
    },
  );

export const upgradeMembershipSubscription = (
  subscriptionId: number,
  packageId: number,
) =>
  apiFetch<MemberSubscription>(
    `/memberships/subscriptions/${subscriptionId}/upgrade`,
    {
      method: 'POST',
      body: JSON.stringify({ packageId }),
    },
  );

export const requestMembershipHold = (
  subscriptionId: number,
  reason: string,
) =>
  apiFetch<MemberSubscription>(
    `/memberships/subscriptions/${subscriptionId}/hold`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  );

export const resumeMembershipSubscription = (subscriptionId: number) =>
  apiFetch<MemberSubscription>(`/memberships/subscriptions/${subscriptionId}/resume`, { method: 'POST' });

export const cancelPendingMembershipSubscription = (
  subscriptionId: number,
) =>
  apiFetch<MemberSubscription>(
    `/memberships/subscriptions/${subscriptionId}/cancel`,
    {
      method: 'POST',
    },
  );
