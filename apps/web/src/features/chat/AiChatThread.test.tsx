import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/api/client';
import { AiChatThread } from './AiChatThread';
import * as ai from './aiChatApi';

vi.mock('./aiChatApi', () => ({
  listAiChatSessions: vi.fn(), createAiChatSession: vi.fn(), getAiChatHistory: vi.fn(), sendAiChatMessage: vi.fn(),
}));

let host: HTMLDivElement, root: Root;
const session = { id: 4, memberId: 1, topic: 'Tập luyện', startedAt: '2026-11-05T01:00:00Z', endedAt: null };
const msg = (id: number, sender: 'member' | 'ai', message: string) => ({ id, sessionId: 4, sender, message, createdAt: '2026-11-05T01:00:00Z' });

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(ai.listAiChatSessions).mockResolvedValue([session]);
  vi.mocked(ai.getAiChatHistory).mockResolvedValue([msg(1, 'member', 'Gói nào rẻ nhất?'), msg(2, 'ai', '**Gói Basic** giá 300.000đ')]);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const render = () => act(async () => root.render(<AiChatThread onBack={() => {}} />));
const type = (text: string) => act(async () => {
  const input = host.querySelector('textarea')!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const sendButton = () => host.querySelector<HTMLButtonElement>('button[type="submit"]')!;

it('shows SÖL AI like a chat peer and renders the latest session as plain text', async () => {
  await render();
  expect(host.querySelector('h2')?.textContent).toBe('SÖL AI');
  expect(ai.getAiChatHistory).toHaveBeenCalledWith(4);
  const bubbles = [...host.querySelectorAll('.direct-chat__messages li')];
  expect(bubbles[0].classList.contains('is-mine')).toBe(true);
  expect(bubbles[1].textContent).toContain('Gói Basic giá 300.000đ');
  expect(bubbles[1].textContent).not.toContain('**');
});

it('keeps a stable composer: own input class and an always-present send button', async () => {
  await render();
  const input = host.querySelector('textarea')!;
  expect(input.classList.contains('portal-textarea')).toBe(false);
  expect(sendButton().disabled).toBe(true);
  await type('Lịch yoga tuần này?');
  // Nút Gửi không được thêm/bớt khi gõ: chỉ đổi trạng thái.
  expect(host.querySelectorAll('button[type="submit"]')).toHaveLength(1);
  expect(sendButton().disabled).toBe(false);
});

it('creates a session on first message and appends both sides of the reply', async () => {
  vi.mocked(ai.listAiChatSessions).mockResolvedValue([]);
  vi.mocked(ai.createAiChatSession).mockResolvedValue({ ...session, id: 9 });
  vi.mocked(ai.sendAiChatMessage).mockResolvedValue({ sessionId: 9, memberMessage: msg(11, 'member', 'Xin chào'), aiMessage: msg(12, 'ai', 'Chào bạn!'), reply: 'Chào bạn!' });
  await render();
  expect(host.textContent).toContain('trả lời về gói tập');
  await type('Xin chào');
  await act(async () => sendButton().click());
  expect(ai.sendAiChatMessage).toHaveBeenCalledWith(9, 'Xin chào');
  expect(host.textContent).toContain('Chào bạn!');
  expect(host.querySelector('textarea')!.value).toBe('');
});

it('keeps the question when the server rolled the message back', async () => {
  vi.mocked(ai.sendAiChatMessage).mockRejectedValue(new ApiError('AI tạm thời không khả dụng.', 503, 'AI_CHAT_UNAVAILABLE'));
  await render();
  await type('Tôi nên tập gì?');
  await act(async () => sendButton().click());
  expect(host.querySelector('textarea')!.value).toBe('Tôi nên tập gì?');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('AI tạm thời không khả dụng.');
  expect(sendButton().textContent).toBe('Gửi lại');
});
