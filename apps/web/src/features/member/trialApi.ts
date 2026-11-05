import { apiFetch } from '../../shared/api/client';
import type { MemberSubscription } from './membershipApi';

export interface TrialStatus {
  eligible: boolean;
  alreadyClaimed: boolean;
  documentNumberMasked?: string | null;
  cccd?: string | null;
  fullName?: string | null;
  documentType?: 'CCCD' | 'PASSPORT' | null;
  nationality?: string | null;
  status?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | null;
  requestedAt?: string | null;
  redeemedAt?: string | null;
  subscriptionId?: number | null;
  rejectionReason?: string | null;
}

export interface TrialClaimInput {
  documentNumber: string;
  fullName: string;
  documentType?: 'CCCD' | 'PASSPORT';
  nationality?: string;
  frontImageUrl?: string;
  backImageUrl?: string;
  cccd?: string;
}

export const trialApi = {
  getStatus: () => apiFetch<TrialStatus>('/memberships/trial/status'),
  claim: (data: TrialClaimInput) =>
    apiFetch<TrialStatus | MemberSubscription>('/memberships/trial/claim', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        documentNumber: data.documentNumber || data.cccd,
      }),
    }),
};

