import { getCurrentUser } from '../../shared/api/client';

export function coachHistoryStorageKey(kind: 'attendance' | 'evaluation'): string {
  return `sol_coach_${kind}_history:${encodeURIComponent(getCurrentUser()?.id ?? 'anonymous')}`;
}
