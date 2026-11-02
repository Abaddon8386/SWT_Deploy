import { apiFetch } from '../../shared/api/client';

export interface CoachReviewDto {
  id: number;
  coachId: number;
  coachName: string;
  coachSpecialization: string;
  coachAvatarUrl: string | null;
  memberId: number | null;
  memberName: string;
  bookingId: number | null;
  classSessionId: number | null;
  rating: number;
  comment: string | null;
  isAnonymous: boolean;
  status: string;
  createdAt: string;
}

export interface CoachReviewCreatePayload {
  coachId: number;
  bookingId?: number | null;
  classSessionId?: number | null;
  rating: number;
  comment?: string;
  isAnonymous?: boolean;
}

export interface CoachLeaderboardItemDto {
  rankPosition: number;
  coachId: number;
  coachName: string;
  coachSpecialization: string;
  coachAvatarUrl: string | null;
  averageRating: number;
  totalReviews: number;
  totalSessions: number;
  badge: string | null;
  bonusAmount: number;
  managerFeedback: string | null;
}

export interface CoachMonthlyReviewDto {
  id: number;
  coachId: number;
  coachName: string;
  coachSpecialization: string;
  coachAvatarUrl: string | null;
  year: number;
  month: number;
  averageRating: number;
  totalReviews: number;
  totalSessions: number;
  rankPosition: number;
  badge: string | null;
  bonusAmount: number;
  managerFeedback: string | null;
  status: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface CoachMonthlyReviewUpdatePayload {
  rankPosition?: number;
  badge?: string;
  bonusAmount?: number;
  managerFeedback?: string;
  status?: string;
}

export async function createCoachReview(payload: CoachReviewCreatePayload): Promise<CoachReviewDto> {
  return apiFetch<CoachReviewDto>('/coaching/reviews', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getCoachReviews(coachId: number): Promise<CoachReviewDto[]> {
  const res = await apiFetch<CoachReviewDto[]>(`/coaching/reviews/coach/${coachId}`);
  return res ?? [];
}

export async function getMyCoachReviews(): Promise<CoachReviewDto[]> {
  const res = await apiFetch<CoachReviewDto[]>('/coaching/reviews/my');
  return res ?? [];
}

export async function getCoachLeaderboard(year?: number, month?: number): Promise<CoachLeaderboardItemDto[]> {
  const params = new URLSearchParams();
  if (year) params.append('year', String(year));
  if (month) params.append('month', String(month));
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch<CoachLeaderboardItemDto[]>(`/coaching/leaderboard${query}`);
  return res ?? [];
}

export async function getAllMonthlyReviews(year?: number, month?: number): Promise<CoachMonthlyReviewDto[]> {
  const params = new URLSearchParams();
  if (year) params.append('year', String(year));
  if (month) params.append('month', String(month));
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch<CoachMonthlyReviewDto[]>(`/coaching/monthly-reviews${query}`);
  return res ?? [];
}

export async function generateMonthlyReviews(year: number, month: number): Promise<CoachMonthlyReviewDto[]> {
  const res = await apiFetch<CoachMonthlyReviewDto[]>(`/coaching/monthly-reviews/generate?year=${year}&month=${month}`, {
    method: 'POST',
  });
  return res ?? [];
}

export async function updateMonthlyReview(id: number, payload: CoachMonthlyReviewUpdatePayload): Promise<CoachMonthlyReviewDto> {
  return apiFetch<CoachMonthlyReviewDto>(`/coaching/monthly-reviews/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function getMyMonthlyReviews(): Promise<CoachMonthlyReviewDto[]> {
  const res = await apiFetch<CoachMonthlyReviewDto[]>('/coaching/monthly-reviews/my');
  return res ?? [];
}

