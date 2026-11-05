import { apiFetch } from '../../shared/api/client';
import type { CheckinDto } from '../reception/checkinApi';

export interface WorkoutStreak {
  currentStreak: number;
  longestStreak: number;
  workoutDays: number;
  startDate: string;
  endDate: string;
  activeDates: string[];
}

export const memberCheckinApi = {
  scan: (gateQr: string) => apiFetch<CheckinDto>('/check-in/self', {
    method: 'POST', cache: 'no-store', body: JSON.stringify({ gateQr }),
  }),
  checkout: (gateQr: string) => apiFetch<CheckinDto>('/check-in/self/checkout', {
    method: 'POST', cache: 'no-store', body: JSON.stringify({ gateQr }),
  }),
  history: (range?: { fromDate: string; toDate: string }) => apiFetch<CheckinDto[]>(
    range ? `/check-in/history?fromDate=${range.fromDate}&toDate=${range.toDate}` : '/check-in/history', { cache: 'no-store' }),
  streak: () => apiFetch<WorkoutStreak>('/check-in/streak', { cache: 'no-store' }),
};
