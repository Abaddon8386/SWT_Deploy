import { apiFetch } from '../../shared/api/client';
import type { MemberSubscription } from './membershipApi';

export interface TrialStatus {
  eligible: boolean;
  alreadyClaimed: boolean;
  cccd: string | null;
  fullName: string | null;
  redeemedAt: string | null;
  subscriptionId: number | null;
}

export interface TrialClaimInput {
  cccd: string;
  fullName: string;
}

export const trialApi = {
  getStatus: () => apiFetch<TrialStatus>('/memberships/trial/status'),
  claim: (data: TrialClaimInput) =>
    apiFetch<MemberSubscription>('/memberships/trial/claim', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

