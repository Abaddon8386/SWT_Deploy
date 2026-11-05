import { apiFetch } from '../../shared/api/client';

export interface Discipline {
  id: number;
  name: string;
  description: string | null;
}

export interface Room {
  id: number;
  name: string;
  location: string | null;
  capacity: number;
  status: 'available' | 'maintenance' | 'closed';
  disciplineId?: number | null;
  disciplineName?: string | null;
  openTime?: string | null;
  closeTime?: string | null;
  tier?: 'STANDARD' | 'PLATINUM' | string | null;
}

export interface MembershipPackage {
  id: number;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  classCreditLimit: number | null;
  status: 'active' | 'inactive';
  tier?: 'SILVER' | 'GOLD' | 'PLATINUM' | string | null;
}

type Body<T> = Omit<T, 'id'>;

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const catalogApi = {
  disciplines: () => apiFetch<Discipline[]>('/disciplines'),
  saveDiscipline: (id: number | null, b: Body<Discipline>) =>
    apiFetch<Discipline>(id ? `/disciplines/${id}` : '/disciplines', json(id ? 'PUT' : 'POST', b)),
  deleteDiscipline: (id: number) => apiFetch<void>(`/disciplines/${id}`, { method: 'DELETE' }),

  rooms: () => apiFetch<Room[]>('/rooms'),
  saveRoom: (id: number | null, b: Omit<Body<Room>, 'disciplineName'>) =>
    apiFetch<Room>(id ? `/rooms/${id}` : '/rooms', json(id ? 'PUT' : 'POST', b)),
  deleteRoom: (id: number) => apiFetch<void>(`/rooms/${id}`, { method: 'DELETE' }),

  packages: () => apiFetch<MembershipPackage[]>('/packages'),
  savePackage: (id: number | null, b: Body<MembershipPackage>) =>
    apiFetch<MembershipPackage>(id ? `/packages/${id}` : '/packages', json(id ? 'PUT' : 'POST', b)),
  deletePackage: (id: number) => apiFetch<void>(`/packages/${id}`, { method: 'DELETE' }),
  setPackageStatus: (id: number, status: MembershipPackage['status']) =>
    apiFetch<MembershipPackage>(`/packages/${id}/status`, json('PATCH', { status })),
};
