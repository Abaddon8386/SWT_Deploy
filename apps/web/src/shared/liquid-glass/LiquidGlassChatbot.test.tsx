import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { LiquidGlassChatbot } from './LiquidGlassChatbot';
import * as api from './aiChatApi';

vi.mock('./LiquidGlassContainer', () => ({ LiquidGlassContainer: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('./LiquidGlassButton', () => ({ LiquidGlassButton: ({ children, onClick, title }: { children: ReactNode; onClick: () => void; title: string }) => <button title={title} onClick={onClick}>{children}</button> }));
vi.mock('./aiChatApi', () => ({ listAiChatSessions: vi.fn(), createAiChatSession: vi.fn(), getAiChatHistory: vi.fn(), sendAiChatMessage: vi.fn() }));
const session = { id: 7, memberId: 10, topic: 'Tập luyện', startedAt: '2026-10-25T08:00:00', endedAt: null };
const reply: api.AiChatReply = { sessionId: 7, reply: 'Phản hồi thật từ API', memberMessage: { id: 1, sessionId: 7, sender: 'member', message: 'Câu hỏi', createdAt: session.startedAt }, aiMessage: { id: 2, sessionId: 7, sender: 'ai', message: 'Phản hồi thật từ API', createdAt: session.startedAt } };
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.mocked(api.listAiChatSessions).mockResolvedValue([session]);
  vi.mocked(api.getAiChatHistory).mockResolvedValue([]);
  vi.mocked(api.createAiChatSession).mockResolvedValue({ ...session, id: 8 });
  vi.mocked(api.sendAiChatMessage).mockResolvedValue(reply);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.resetAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function open() {
  await act(async () => root.render(<LiquidGlassChatbot />));
  await act(async () => (host.querySelector('button[title="Mở trợ lý AI"]') as HTMLButtonElement).click());
}
async function type(value: string) {
  const input = host.querySelector('textarea') as HTMLTextAreaElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function send() { await act(async () => host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); }

it('shows a skeleton until the session list and history arrive and reveals history immediately', async () => {
  let finishSessions!: (value: api.AiChatSession[]) => void;
  let finishHistory!: (value: api.AiChatMessage[]) => void;
  vi.mocked(api.listAiChatSessions).mockReturnValueOnce(new Promise(resolve => { finishSessions = resolve; }));
  vi.mocked(api.getAiChatHistory).mockReturnValueOnce(new Promise(resolve => { finishHistory = resolve; }));
  await open();
  expect(host.querySelector('.liquid-glass-chat-body [role="status"][aria-busy="true"]')).not.toBeNull();
  expect(host.querySelectorAll('.typing-dot')).toHaveLength(0);
  expect(host.querySelector('textarea')?.disabled).toBe(true);
  expect(host.querySelector('.ai-chat-empty')).toBeNull();

  await act(async () => finishSessions([session]));
  expect(host.querySelector('.liquid-glass-chat-body .loading-skeleton')).not.toBeNull();
  expect(host.querySelector('textarea')?.disabled).toBe(true);
  await act(async () => finishHistory([reply.memberMessage, reply.aiMessage]));
  expect(host.querySelector('.liquid-glass-chat-body .loading-skeleton')).toBeNull();
  expect(host.textContent).toContain('Phản hồi thật từ API');
  expect(host.querySelector('textarea')?.disabled).toBe(false);
});

it('opens the latest persisted session and history', async () => {
  vi.mocked(api.getAiChatHistory).mockResolvedValue([reply.memberMessage, reply.aiMessage]);
  await open();
  expect(api.getAiChatHistory).toHaveBeenCalledWith(7);
  expect(host.textContent).toContain('Phản hồi thật từ API');
});

it('allows the first question without creating an empty session on open, then reuses the created session', async () => {
  vi.mocked(api.listAiChatSessions).mockResolvedValue([]);
  await open();
  expect((host.querySelector('textarea') as HTMLTextAreaElement).disabled).toBe(false);
  expect(api.createAiChatSession).not.toHaveBeenCalled();
  await type('Câu hỏi'); await send();
  expect(api.createAiChatSession).toHaveBeenCalledTimes(1);
  expect(api.sendAiChatMessage).toHaveBeenCalledWith(8, 'Câu hỏi');
  await act(async () => vi.advanceTimersByTime(2000));
  await type('Câu tiếp theo'); await send();
  expect(api.createAiChatSession).toHaveBeenCalledTimes(1);
  expect(api.sendAiChatMessage).toHaveBeenLastCalledWith(8, 'Câu tiếp theo');
});

it('keeps the draft and allows retry when first-session creation fails', async () => {
  vi.mocked(api.listAiChatSessions).mockResolvedValue([]);
  vi.mocked(api.createAiChatSession).mockRejectedValueOnce(new ApiError('Không thể tạo phiên', 503));
  await open(); await type('Câu hỏi'); await send();
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Câu hỏi');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Không thể tạo phiên');
  expect(api.sendAiChatMessage).not.toHaveBeenCalled();
  await send();
  expect(api.createAiChatSession).toHaveBeenCalledTimes(2);
  expect(api.sendAiChatMessage).toHaveBeenCalledTimes(1);
});

it('locks repeated submissions while the first session is being created', async () => {
  vi.mocked(api.listAiChatSessions).mockResolvedValue([]);
  let finish!: (value: api.AiChatSession) => void;
  vi.mocked(api.createAiChatSession).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await open(); await type('Câu hỏi'); await send(); await send();
  expect(api.createAiChatSession).toHaveBeenCalledTimes(1);
  expect(api.sendAiChatMessage).not.toHaveBeenCalled();
  await act(async () => finish({ ...session, id: 8 }));
  expect(api.sendAiChatMessage).toHaveBeenCalledTimes(1);
});

it('does not send after unmount while auto-creating a session', async () => {
  vi.mocked(api.listAiChatSessions).mockResolvedValue([]);
  let finish!: (value: api.AiChatSession) => void;
  vi.mocked(api.createAiChatSession).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await open(); await type('Câu hỏi'); await send();
  await act(async () => root.render(null));
  await act(async () => finish({ ...session, id: 8 }));
  expect(api.sendAiChatMessage).not.toHaveBeenCalled();
});

it('blocks resubmission after an uncertain first message until history sync', async () => {
  vi.mocked(api.listAiChatSessions).mockResolvedValue([]);
  vi.mocked(api.sendAiChatMessage).mockRejectedValue(new ApiError('network', 0));
  await open(); await type('Câu hỏi'); await send(); await send();
  expect(api.createAiChatSession).toHaveBeenCalledTimes(1);
  expect(api.sendAiChatMessage).toHaveBeenCalledTimes(1);
  expect((host.querySelector('textarea') as HTMLTextAreaElement).disabled).toBe(true);
});

it('shows loading dots, prevents duplicate sends and types the API response', async () => {
  let resolve!: (value: api.AiChatReply) => void;
  vi.mocked(api.sendAiChatMessage).mockImplementation(() => new Promise((done) => { resolve = done; }));
  await open(); await type('Câu hỏi'); await send(); await send();
  expect(host.querySelectorAll('.typing-dot')).toHaveLength(3);
  expect(api.sendAiChatMessage).toHaveBeenCalledTimes(1);
  await act(async () => resolve(reply));
  expect(host.querySelectorAll('.typing-dot')).toHaveLength(0);
  expect(host.textContent).not.toContain('Phản hồi thật từ API');
  await act(async () => vi.advanceTimersByTime(2000));
  expect(host.textContent).toContain('Phản hồi thật từ API');
  expect((host.querySelector('textarea') as HTMLTextAreaElement).disabled).toBe(false);
});

it('creates a blank session and can reopen the previous history', async () => {
  vi.mocked(api.getAiChatHistory).mockResolvedValue([reply.aiMessage]);
  await open();
  await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent === 'New Chat')?.click());
  expect(api.createAiChatSession).toHaveBeenCalledTimes(1);
  expect(host.textContent).not.toContain('Phản hồi thật từ API');
  const select = host.querySelector('select') as HTMLSelectElement;
  await act(async () => { select.value = '7'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(host.textContent).toContain('Phản hồi thật từ API');
});

it('retains the failed question and reconciles uncertain requests without resending', async () => {
  vi.mocked(api.sendAiChatMessage).mockRejectedValue(new ApiError('network', 0));
  await open(); await type('Câu hỏi'); await send();
  expect(host.textContent).toContain('Câu hỏi');
  expect(host.querySelectorAll('.typing-dot')).toHaveLength(0);
  vi.mocked(api.getAiChatHistory).mockResolvedValue([reply.memberMessage, reply.aiMessage]);
  await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent === 'Tải lại hội thoại')?.click());
  expect(api.sendAiChatMessage).toHaveBeenCalledTimes(1);
  expect(host.querySelectorAll('.user-row')).toHaveLength(1);
});

it('allows safe retry after a confirmed provider rollback', async () => {
  vi.mocked(api.sendAiChatMessage).mockRejectedValue(new ApiError('Chưa cấu hình AI', 503, 'AI_CHAT_NOT_CONFIGURED'));
  await open(); await type('Câu hỏi'); await send();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Chưa cấu hình AI');
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Câu hỏi');
});

it('respects reduced motion when revealing the returned answer', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  await open(); await type('Câu hỏi'); await send();
  await act(async () => vi.advanceTimersByTime(0));
  expect(host.textContent).toContain('Phản hồi thật từ API');
  expect((host.querySelector('textarea') as HTMLTextAreaElement).disabled).toBe(false);
});

it('strips raw markdown symbols from AI messages for clean plain-text readability', async () => {
  vi.mocked(api.getAiChatHistory).mockResolvedValue([
    { id: 10, sessionId: 7, sender: 'ai', message: '### Lịch tập hôm nay\n* **HIIT Burn**: 18:00 tại `Studio A`', createdAt: session.startedAt },
  ]);
  await open();
  const bubbleText = host.querySelector('.bot-bubble .chat-bubble-text')?.textContent ?? '';
  expect(bubbleText).toContain('Lịch tập hôm nay');
  expect(bubbleText).toContain('• HIIT Burn: 18:00 tại Studio A');
  expect(bubbleText).not.toContain('**');
  expect(bubbleText).not.toContain('###');
});

it('shows history errors and recovers by reloading without creating a session', async () => {
  vi.mocked(api.getAiChatHistory).mockRejectedValueOnce(new ApiError('Không thể tải lịch sử', 503));
  await open();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Không thể tải lịch sử');
  await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent === 'Tải lại hội thoại')?.click());
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(api.createAiChatSession).not.toHaveBeenCalled();
});
