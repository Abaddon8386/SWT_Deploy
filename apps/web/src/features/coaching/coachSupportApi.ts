import { apiFetch } from '../../shared/api/client';
import type { SupportMessage, SupportTicket } from '../member/memberSupportApi';

export type { SupportMessage, SupportTicket };

export interface SupportTicketPage {
  content: SupportTicket[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export const getCoachSupportTickets = (status?: string, page = 0, size = 20) => {
  const query = new URLSearchParams({ page: String(page), size: String(size) });
  if (status && status !== 'ALL') {
    query.set('status', status.toLowerCase());
  }
  return apiFetch<SupportTicketPage>(`/support/requests?${query.toString()}`);
};

export const updateSupportTicketStatus = (id: number, status: SupportTicket['status']) =>
  apiFetch<SupportTicket>(`/support/requests/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

export const getSupportMessages = (id: number) =>
  apiFetch<SupportMessage[]>(`/support/requests/${id}/messages`);

export const sendSupportMessage = (id: number, message: string) =>
  apiFetch<SupportMessage>(`/support/requests/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });

