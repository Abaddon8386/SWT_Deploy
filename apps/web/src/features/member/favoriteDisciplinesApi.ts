import { apiFetch } from '../../shared/api/client';

export async function getFavoriteDisciplines(): Promise<number[]> {
  try {
    const res = await apiFetch<number[]>('/members/me/favorite-disciplines');
    return res ?? [];
  } catch {
    // Fallback to local storage if API is temporarily unavailable
    const stored = localStorage.getItem('scms_favorite_disciplines');
    return stored ? JSON.parse(stored) : [];
  }
}

export async function toggleFavoriteDiscipline(disciplineId: number): Promise<number[]> {
  try {
    const res = await apiFetch<number[]>(`/members/me/favorite-disciplines/${disciplineId}/toggle`, {
      method: 'POST',
    });
    const updated = res ?? [];
    localStorage.setItem('scms_favorite_disciplines', JSON.stringify(updated));
    return updated;
  } catch {
    const stored = localStorage.getItem('scms_favorite_disciplines');
    const list: number[] = stored ? JSON.parse(stored) : [];
    const idx = list.indexOf(disciplineId);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(disciplineId);
    }
    localStorage.setItem('scms_favorite_disciplines', JSON.stringify(list));
    return list;
  }
}
