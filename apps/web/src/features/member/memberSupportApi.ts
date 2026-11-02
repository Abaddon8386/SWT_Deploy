import { apiFetch } from '../../shared/api/client';

export interface SupportTicket {
  id: number;
  memberId: number;
  memberName?: string | null;
  assignedTo?: number | null;
  resolvedAt?: string | null;
  subject: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  createdAt: string;
  assignedToName: string | null;
}

export interface SupportMessage {
  id: number;
  senderId: number;
  senderName: string | null;
  senderRole: string | null;
  message: string;
  createdAt: string;
}

interface TicketPage { content: SupportTicket[]; totalPages: number }

export const getMySupportTickets = (page = 0) =>
  apiFetch<TicketPage>(`/support/requests/my?page=${page}&size=20`);

export const createSupportTicket = (subject: string, description: string) =>
  apiFetch<SupportTicket>('/support/requests', {
    method: 'POST', body: JSON.stringify({ subject, description }),
  });

export const getSupportMessages = (id: number) =>
  apiFetch<SupportMessage[]>(`/support/requests/${id}/messages`);

export const sendSupportMessage = (id: number, message: string, clientMessageId?: string) =>
  apiFetch<SupportMessage>(`/support/requests/${id}/messages`, {
    method: 'POST', body: JSON.stringify({ message, clientMessageId }),
  });

export const getSupportTicket = (id: number) => apiFetch<SupportTicket>(`/support/requests/${id}`);

export const getSupportInbox = (page = 0, status = '') =>
  apiFetch<TicketPage>(`/support/requests?page=${page}&size=20${status ? `&status=${encodeURIComponent(status)}` : ''}`);

export const updateSupportStatus = (id: number, status: SupportTicket['status'], assignedTo?: number) =>
  apiFetch<SupportTicket>(`/support/requests/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, assignedTo }) });
