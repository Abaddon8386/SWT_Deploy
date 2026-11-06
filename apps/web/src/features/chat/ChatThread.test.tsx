import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setLanguage } from '../../shared/i18n';
import { ChatThread } from './ChatThread';
import type { ChatConversation } from './chatApi';
import type { useChatConversation } from './useChatConversation';

let host: HTMLDivElement, root: Root;
const conversation: ChatConversation = { id: 7, peer: { id: 20, name: 'Tin nhắn', role: 'COACH', available: true }, createdAt: '', lastActivityAt: '' };
const chat = (extra: Partial<ReturnType<typeof useChatConversation>> = {}): ReturnType<typeof useChatConversation> => ({
  selectedId: 7, messages: [], draft: 'Gửi', setDraft: vi.fn(), select: vi.fn(), refresh: vi.fn(), loadOlder: vi.fn(), send: vi.fn(),
  loading: false, error: null, hasOlder: false, olderLoading: false, sending: false, sendError: null, ...extra,
});
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); setLanguage('vi'); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); setLanguage('vi'); vi.unstubAllGlobals(); });
const render = (state: ReturnType<typeof useChatConversation>) => act(async () => root.render(<ChatThread conversation={conversation} chat={state} canMarkRead={false} onBack={() => {}} />));

it('toggles retry, older-history, transcript and loading labels without translating names, errors or drafts', async () => {
  const state = chat({ hasOlder: true, error: 'Lỗi từ máy chủ: Gửi' });
  await render(state);
  expect(host.querySelector('.direct-chat__older')!.textContent).toBe('Tải tin nhắn cũ hơn');
  expect(host.textContent).toContain('Thử lại tải tin nhắn');
  await act(async () => setLanguage('en'));
  expect(host.querySelector('.direct-chat__older')!.textContent).toBe('Load older messages');
  expect(host.textContent).toContain('Retry loading messages');
  expect(host.querySelector('[aria-label="Message history"]')).not.toBeNull();
  expect(host.textContent).toContain('Coach');
  expect(host.querySelector('h2')!.textContent).toBe('Tin nhắn');
  expect(host.querySelector('textarea')!.value).toBe('Gửi');
  expect(host.textContent).toContain('Lỗi từ máy chủ: Gửi');
  await render(chat({ hasOlder: true, olderLoading: true }));
  expect(host.querySelector('.direct-chat__older')!.textContent).toBe('Loading…');
  expect(host.querySelector('.direct-chat__older')!.getAttribute('disabled')).not.toBeNull();
  expect(host.querySelector('.loading-skeleton .sr-only')!.textContent).toBe('Loading older messages…');
  await act(async () => setLanguage('vi'));
  expect(host.querySelector('.direct-chat__older')!.textContent).toBe('Đang tải…');
  expect(host.querySelector('.loading-skeleton .sr-only')!.textContent).toBe('Đang tải tin nhắn cũ hơn…');
});

it('localizes empty and message reaction states while keeping the message body unchanged', async () => {
  await render(chat());
  await act(async () => setLanguage('en'));
  expect(host.textContent).toContain('No messages yet. Start the conversation.');
  await render(chat({ messages: [{ id: 1, conversationId: 7, clientMessageId: 'one', senderId: 20, mine: false, message: 'Tìm Tin nhắn', createdAt: '2026-11-05T01:00:00Z' }] }));
  expect(host.querySelector('.direct-chat__bubble p')!.textContent).toBe('Tìm Tin nhắn');
  expect(host.querySelector('[aria-label="Like message"]')).not.toBeNull();
  expect(host.querySelector('[role="status"]')!.textContent).toBe('Showing 1 messages.');
  await act(async () => setLanguage('vi'));
  expect(host.querySelector('[aria-label="Thả tim tin nhắn"]')).not.toBeNull();
  expect(host.querySelector('.direct-chat__bubble p')!.textContent).toBe('Tìm Tin nhắn');
});
