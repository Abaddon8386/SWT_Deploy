import { afterEach, expect, it, vi } from 'vitest';
import { createAiChatSession, getAiChatHistory, listAiChatSessions, sendAiChatMessage } from './aiChatApi';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
it('uses JWT, verified session routes and DTO payloads', async () => {
  localStorage.setItem('fitcenter_token', 'unit-token');
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) });
  vi.stubGlobal('fetch', fetchMock);
  await listAiChatSessions(); await createAiChatSession(); await getAiChatHistory(7); await sendAiChatMessage(7, 'Xin chào');
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/ai/chat/sessions', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer unit-token' }) }));
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/ai/chat/sessions', expect.objectContaining({ method: 'POST', body: '{}' }));
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/ai/chat/sessions/7/history', expect.anything());
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/ai/chat/sessions/7/messages', expect.objectContaining({ method: 'POST', body: '{"message":"Xin chào"}' }));
});
