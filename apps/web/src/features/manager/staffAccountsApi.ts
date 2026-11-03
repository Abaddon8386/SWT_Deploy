import { apiFetch } from '../../shared/api/client';

export type StaffRole = 'COACH' | 'RECEPTIONIST';
export interface StaffAccount {
  id: number;
  fullName: string;
  email: string;
  roleCode: StaffRole;
  status: string;
}
export interface StaffAccountInput {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  gender: 'male' | 'female' | 'other';
  roleCode: StaffRole;
}

export const listStaffAccounts = () => apiFetch<StaffAccount[]>('/staff-accounts');
export const setStaffAccountLocked = (id: number, locked: boolean) =>
  apiFetch<StaffAccount>(`/staff-accounts/${id}/${locked ? 'lock' : 'unlock'}`, { method: 'PATCH' });
export const createStaffAccount =(input: StaffAccountInput) => apiFetch<StaffAccount>('/staff-accounts', {
  method: 'POST', body: JSON.stringify(input),
});
