import { getIntlLocale } from '../../shared/i18n';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../shared/api/client';
import type { MembershipPackage } from '../member/membershipApi';
import type { ClassSessionDto } from '../member/memberClassesApi';

export interface PublicCoach {
  id: number; name: string; specialization: string | null; bio: string | null;
  certification: string | null; avatarUrl: string | null;
}
export interface PublicCatalog {
  packages: MembershipPackage[];
  coaches: PublicCoach[];
  sessions: ClassSessionDto[];
}

export function usePublicCatalog() {
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let sequence = 0;
    const load = async () => {
      const request = ++sequence;
      setError(false);
      try {
        const data = await apiFetch<PublicCatalog>('/public/catalog', {
          cache: 'no-store', signal: controller.signal, headers: { Authorization: '' },
        });
        if (active && request === sequence) { setCatalog(data); setError(false); }
      } catch {
        // Hide stale prices and schedules when refresh fails.
        if (active && request === sequence) { setError(true); setCatalog(null); }
      }
    };
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { active = false; controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [attempt]);
  return { catalog, error, retry };
}

export function sessionDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(getIntlLocale(), { weekday: 'short', day: '2-digit', month: '2-digit' });
}
