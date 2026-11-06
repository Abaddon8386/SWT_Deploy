import { apiFetch } from '../../shared/api/client';

export interface ChatContact { id: number; name: string; role: string; available: boolean; avatarUrl?: string | null }
export interface ChatConversation {
  id: number; peer: ChatContact; createdAt: string; lastActivityAt: string;
  /** Chỉ có trong danh sách hội thoại. */
  lastMessage?: string | null; lastMessageMine?: boolean; unreadCount?: number;
}
export interface ChatMessage {
  id: number; conversationId: number; clientMessageId: string; senderId: number;
  mine: boolean; message: string; createdAt: string;
}
export interface ChatHistory { items: ChatMessage[]; hasMore: boolean }
export interface ChatPageData<T> { content: T[]; totalPages: number; number: number }
export interface ChatRealtimeSession {
  enabled: boolean; userId: number; url?: string; publishableKey?: string;
  topic?: string; token?: string; expiresAt?: string;
}
export const getConversations = (page = 0) => apiFetch<ChatPageData<ChatConversation>>(`/chat/conversations?page=${page}`);
export const getContacts = (query: string, page = 0) => apiFetch<ChatPageData<ChatContact>>(`/chat/contacts?query=${encodeURIComponent(query)}&page=${page}`);
export const openConversation = (contactId: number) => apiFetch<ChatConversation>('/chat/conversations', { method: 'POST', body: JSON.stringify({ contactId }) });
export function getHistory(id: number, cursor: { beforeId?: number; afterId?: number } = {}) {
  const params = new URLSearchParams();
  if (cursor.beforeId !== undefined) params.set('beforeId', String(cursor.beforeId));
  if (cursor.afterId !== undefined) params.set('afterId', String(cursor.afterId));
  return apiFetch<ChatHistory>(`/chat/conversations/${id}/messages${params.size ? `?${params}` : ''}`);
}
export const sendMessage = (id: number, message: string, clientMessageId: string) => apiFetch<ChatMessage>(`/chat/conversations/${id}/messages`, {
  method: 'POST', body: JSON.stringify({ message, clientMessageId }),
});

export const getChatUnreadCount = () => apiFetch<{ count: number }>('/chat/unread-count');
export const markConversationRead = (id: number, lastMessageId: number) => apiFetch<{ count: number }>(`/chat/conversations/${id}/read`, {
  method: 'POST', body: JSON.stringify({ lastMessageId }),
});

/** Số tin chưa đọc được phát cho nút “Tin nhắn” mỗi khi thay đổi. */
export const CHAT_UNREAD_EVENT = 'sol-chat-unread';
export const announceChatUnread = (count: number) => window.dispatchEvent(new CustomEvent<number>(CHAT_UNREAD_EVENT, { detail: count }));

export const chatRoleLabel = (role: string, t: (vi: string, en: string) => string = vi => vi) => ({ MEMBER: t('Hội viên', 'Member'), RECEPTIONIST: t('Lễ tân', 'Receptionist'), COACH: t('Huấn luyện viên', 'Coach'), AI: t('Trợ lý AI', 'AI assistant') })[role] ?? t('Tài khoản', 'Account');
