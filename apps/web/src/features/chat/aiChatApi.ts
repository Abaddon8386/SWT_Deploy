import { apiFetch } from '../../shared/api/client';

export interface AiChatSession { id: number; memberId: number; topic: string; startedAt: string; endedAt: string | null }
export interface AiChatMessage { id: number; sessionId: number; sender: 'member' | 'ai'; message: string; createdAt: string }
export interface AiChatReply { sessionId: number; memberMessage: AiChatMessage; aiMessage: AiChatMessage; reply: string }
const timeout = (ms = 15_000) => AbortSignal.timeout(ms);

export const listAiChatSessions = () => apiFetch<AiChatSession[]>('/ai/chat/sessions', { signal: timeout() });
export const createAiChatSession = () => apiFetch<AiChatSession>('/ai/chat/sessions', {
  method: 'POST', body: '{}', signal: timeout(),
});
export const getAiChatHistory = (id: number) => apiFetch<AiChatMessage[]>(`/ai/chat/sessions/${id}/history`, { signal: timeout() });
export const sendAiChatMessage = (id: number, message: string) => apiFetch<AiChatReply>(`/ai/chat/sessions/${id}/messages`, {
  method: 'POST', body: JSON.stringify({ message }), signal: timeout(45_000),
});
