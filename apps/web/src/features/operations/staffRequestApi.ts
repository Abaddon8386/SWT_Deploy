import { apiFetch } from '../../shared/api/client';

export type RequestType = 'LEAVE' | 'SHIFT_EXCHANGE' | 'SCHEDULE_CHANGE' | 'OTHER';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface StaffInternalRequestDto {
  id: number;
  userId: number;
  userFullName: string;
  userEmail: string;
  userRole: string;
  requestType: RequestType;
  title: string;
  reason: string;
  startDate: string | null;
  endDate: string | null;
  targetShift: string | null;
  replacementUserId: number | null;
  replacementUserFullName: string | null;
  status: RequestStatus;
  managerNotes: string | null;
  reviewedByUserId: number | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface StaffInternalRequestCreatePayload {
  requestType: RequestType;
  title: string;
  reason: string;
  startDate?: string | null;
  endDate?: string | null;
  targetShift?: string | null;
  replacementUserId?: number | null;
}

export interface StaffInternalRequestReviewPayload {
  status: 'APPROVED' | 'REJECTED';
  managerNotes?: string;
}

export async function createStaffRequest(payload: StaffInternalRequestCreatePayload): Promise<StaffInternalRequestDto> {
  return apiFetch<StaffInternalRequestDto>('/operations/requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getMyStaffRequests(status?: string): Promise<StaffInternalRequestDto[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await apiFetch<StaffInternalRequestDto[]>(`/operations/requests/my${query}`);
  return res ?? [];
}

export async function cancelStaffRequest(id: number): Promise<StaffInternalRequestDto> {
  return apiFetch<StaffInternalRequestDto>(`/operations/requests/${id}/cancel`, {
    method: 'PUT',
  });
}

export async function getAllStaffRequests(status?: string, type?: string): Promise<StaffInternalRequestDto[]> {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (type) params.append('type', type);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch<StaffInternalRequestDto[]>(`/operations/requests${query}`);
  return res ?? [];
}

export async function reviewStaffRequest(
  id: number,
  payload: StaffInternalRequestReviewPayload
): Promise<StaffInternalRequestDto> {
  return apiFetch<StaffInternalRequestDto>(`/operations/requests/${id}/review`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

