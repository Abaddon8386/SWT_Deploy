import { apiFetch } from '../../shared/api/client';

export interface Equipment {
  id: number;
  name: string;
  code: string | null;
  category: string;
  roomId: number | null;
  roomName: string | null;
  quantity: number;
  status: 'active' | 'maintenance' | 'broken' | 'retired';
  purchaseDate: string | null;
  maintenanceDate: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentInput {
  name: string;
  code?: string | null;
  category?: string | null;
  roomId?: number | null;
  quantity: number;
  status?: string;
  purchaseDate?: string | null;
  maintenanceDate?: string | null;
  note?: string | null;
}

export const equipmentApi = {
  list: (roomId?: number) =>
    apiFetch<Equipment[]>(roomId ? `/equipment?roomId=${roomId}` : '/equipment'),

  get: (id: number) =>
    apiFetch<Equipment>(`/equipment/${id}`),

  save: (id: number | null, body: EquipmentInput) =>
    apiFetch<Equipment>(id ? `/equipment/${id}` : '/equipment', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(body),
    }),

  updateStatus: (id: number, status: Equipment['status']) =>
    apiFetch<Equipment>(`/equipment/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  delete: (id: number) =>
    apiFetch<void>(`/equipment/${id}`, { method: 'DELETE' }),
};

