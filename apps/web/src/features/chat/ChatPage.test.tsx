import { setLanguage } from '../../shared/i18n';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatPage } from './ChatPage';
import * as api from './chatApi';
import { subscribeChat } from './chatRealtime';
import { getCurrentUser } from '../../shared/api/client';
vi.mock('./chatApi', async importOriginal => ({ ...await importOriginal<typeof api>(), getConversations: vi.fn(), getContacts: vi.fn(), openConversation: vi.fn(), getHistory: vi.fn(), sendMessage: vi.fn(), markConversationRead: vi.fn() }));
vi.mock('./chatRealtime', () => ({ subscribeChat: vi.fn(() => vi.fn()) }));
vi.mock('../../shared/api/client', () => ({ getCurrentUser: vi.fn(), apiFetch: vi.fn() }));
let host: HTMLDivElement, root: Root;
const conversation: api.ChatConversation = { id: 7, peer: { id: 20, name: 'Coach Linh', role: 'COACH', available: true }, createdAt: '2026-10-29T01:00:00Z', lastActivityAt: '2026-10-29T01:00:00Z' };
beforeEach(() => {
  setLanguage('vi');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(getCurrentUser).mockReturnValue({ id: 'member', identifier: 'member', name: 'Member', role: 'MEMBER' });
  vi.mocked(api.getConversations).mockResolvedValue({ content: [conversation], totalPages: 1, number: 0 });
  vi.mocked(api.getHistory).mockResolvedValue({ items: [], hasMore: false });
  vi.mocked(api.markConversationRead).mockResolvedValue({ count: 0 });
  vi.mocked(api.getContacts).mockResolvedValue({ content: [conversation.peer], totalPages: 1, number: 0 });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); setLanguage('vi'); vi.resetAllMocks(); vi.unstubAllGlobals(); });
const button = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;
const render = () => act(async () => root.render(<ChatPage />));

it('keeps a skeleton in each pending chat region and renders responses immediately', async () => {
  let finishInbox!: (value: api.ChatPageData<api.ChatConversation>) => void;
  let finishContacts!: (value: api.ChatPageData<api.ChatContact>) => void;
  let finishHistory!: (value: api.ChatHistory) => void;
  vi.mocked(api.getConversations).mockReturnValueOnce(new Promise(resolve => { finishInbox = resolve; }));
  vi.mocked(api.getContacts).mockReturnValueOnce(new Promise(resolve => { finishContacts = resolve; }));
  vi.mocked(api.getHistory).mockReturnValueOnce(new Promise(resolve => { finishHistory = resolve; }));
  await render();
  expect(host.querySelector('.direct-chat__inbox [role="status"] [aria-hidden="true"]')).not.toBeNull();
  expect(host.textContent).not.toContain('Chưa có hội thoại');
  await act(async () => finishInbox({ content: [conversation], totalPages: 1, number: 0 }));
  expect(host.querySelector('.direct-chat__inbox [aria-busy="true"]')).toBeNull();
  expect(button('Coach Linh')).toBeDefined();

  await act(async () => button('Cuộc trò chuyện mới').click());
  expect(host.querySelector('.direct-chat__contacts [role="status"] [aria-hidden="true"]')).not.toBeNull();
  expect(host.textContent).not.toContain('Không tìm thấy lễ tân');
  await act(async () => finishContacts({ content: [conversation.peer], totalPages: 1, number: 0 }));
  expect(host.querySelector('[data-contact-id="20"]')).not.toBeNull();
  await act(async () => button('Đóng danh bạ').click());

  await act(async () => button('Coach Linh').click());
  expect(host.querySelector('.direct-chat__transcript [role="status"] [aria-hidden="true"]')).not.toBeNull();
  expect(host.textContent).not.toContain('Chưa có tin nhắn');
  expect(host.querySelector('textarea')?.disabled).toBe(true);
  await act(async () => finishHistory({ items: [], hasMore: false }));
  expect(host.querySelector('.direct-chat__transcript [role="status"]')).toBeNull();
  expect(host.textContent).toContain('Chưa có tin nhắn');
  expect(host.querySelector('textarea')?.disabled).toBe(false);
});

it('member starts a conversation from the contact directory', async () => {
  vi.mocked(api.openConversation).mockResolvedValue(conversation);
  await render();
  await act(async () => button('Cuộc trò chuyện mới').click());
  const contact = host.querySelector('[data-contact-id="20"]') as HTMLButtonElement;
  await act(async () => contact.click());
  expect(api.openConversation).toHaveBeenCalledWith(20);
  expect(host.querySelector('textarea')).not.toBeNull();
  expect(host.querySelector('[data-thread-title]')?.textContent).toContain('Coach Linh');
});

it('coach can reply but has no member directory button', async () => {
  vi.mocked(getCurrentUser).mockReturnValue({ id: 'coach', identifier: 'coach', name: 'Coach', role: 'COACH' });
  await render();
  expect(button('Cuộc trò chuyện mới')).toBeUndefined();
  await act(async () => button('Coach Linh').click());
  expect(host.querySelector('textarea')).not.toBeNull();
});

it('renders chat as plain text and keeps unavailable peers read-only', async () => {
  vi.mocked(api.getConversations).mockResolvedValue({ content: [{ ...conversation, peer: { ...conversation.peer, available: false } }], totalPages: 1, number: 0 });
  vi.mocked(api.getHistory).mockResolvedValue({ items: [{ id: 1, conversationId: 7, clientMessageId: 'id', senderId: 20, mine: false, message: '<img src=x onerror=alert(1)>', createdAt: '2026-10-29T01:00:00Z' }], hasMore: false });
  await render(); await act(async () => button('Coach Linh').click());
  expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
  expect(host.querySelector('.direct-chat__transcript img')).toBeNull();
  expect(host.querySelector('textarea')?.disabled).toBe(true);
});

it('manager is forbidden without fetching private data', async () => {
  vi.mocked(getCurrentUser).mockReturnValue({ id: 'manager', identifier: 'manager', name: 'Manager', role: 'MANAGER' });
  await render(); expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(api.getConversations).not.toHaveBeenCalled(); expect(subscribeChat).not.toHaveBeenCalled();
});

it('shows list error and retry, then opens an empty conversation', async () => {
  vi.mocked(api.getConversations).mockRejectedValueOnce(new Error('Mất kết nối'));
  await render(); expect(host.textContent).toContain('Mất kết nối');
  await act(async () => button('Thử lại').click());
  await act(async () => button('Coach Linh').click());
  expect(host.textContent).toContain('Chưa có tin nhắn');
});

it('toggles mobile thread state and restores focus to inbox heading on back', async () => {
  await render();
  await act(async () => button('Coach Linh').click());
  expect(host.querySelector('.direct-chat')?.classList.contains('direct-chat--thread-open')).toBe(true);
  await act(async () => {
    button('Danh sách').click();
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  expect(host.querySelector('.direct-chat')?.classList.contains('direct-chat--thread-open')).toBe(false);
  expect(document.activeElement?.id).toBe('chat-inbox-title');
  await act(async () => button('Coach Linh').click());
  expect(document.activeElement?.id).toBe('chat-thread-title');
});


it('uses the stable shared composer with keyboard-accessible emoji controls and no inactive tools', async () => {
  await render();
  await act(async () => button('Coach Linh').click());
  const input = host.querySelector('textarea')!;
  const send = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  expect(input.classList.contains('direct-chat__input')).toBe(true);
  expect(input.classList.contains('portal-textarea')).toBe(false);
  expect(send.disabled).toBe(true);
  expect(send.classList.contains('btn-primary')).toBe(false);
  expect(host.querySelector('[title="Ghi âm"]')).toBeNull();
  expect(host.querySelector('[title="Đính kèm hình ảnh"]')).toBeNull();
  const emoji = host.querySelector<HTMLButtonElement>('button[aria-label="Chọn biểu tượng cảm xúc"]')!;
  expect(emoji).not.toBeNull();
  await act(async () => emoji.click());
  expect(emoji.getAttribute('aria-expanded')).toBe('true');
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Chèn 💪"]')!.click());
  expect(input.value).toBe('💪');
  expect(document.activeElement).toBe(input);
  expect(send.disabled).toBe(false);
  expect(host.querySelector('button[type="submit"]')).toBe(send);
});


it('owns inbox, unread, role, contact and empty labels in both languages without changing peer content', async () => {
  vi.mocked(api.getConversations).mockResolvedValue({ content: [{ ...conversation, peer: { ...conversation.peer, name: 'Tin nhắn' }, unreadCount: 2, lastMessage: 'Tìm', lastMessageMine: true }], totalPages: 2, number: 0 });
  await render();
  await act(async () => setLanguage('en'));
  expect(host.querySelector('#chat-inbox-title')!.textContent).toBe('Your conversations');
  expect(host.querySelector('[aria-label="2 unread messages"]')).not.toBeNull();
  expect(host.querySelector('.direct-chat__person:not(.direct-chat__person--ai) strong')!.textContent).toBe('Tin nhắn');
  expect(host.querySelector('.direct-chat__person:not(.direct-chat__person--ai) .direct-chat__preview')!.textContent).toBe('You: Tìm');
  expect(host.querySelector('[aria-label="Conversation pages"]')).not.toBeNull();
  expect(host.querySelector('[title="Refresh messages"]')).not.toBeNull();
  await act(async () => button('New conversation').click());
  expect(host.querySelector('[aria-label="Choose a chat recipient"]')).not.toBeNull();
  expect(host.querySelector('input[type="search"]')!.getAttribute('placeholder')).toBe('Search recipients...');
  expect(host.querySelector('[data-contact-id="20"]')!.textContent).toContain('Coach');
  await act(async () => setLanguage('vi'));
  expect(host.querySelector('#chat-inbox-title')!.textContent).toBe('Hội thoại của bạn');
  expect(host.querySelector('[aria-label="2 tin chưa đọc"]')).not.toBeNull();
  expect(host.querySelector('input[type="search"]')!.getAttribute('placeholder')).toBe('Tìm kiếm người nhận...');
  expect(host.querySelector('.direct-chat__person:not(.direct-chat__person--ai) .direct-chat__preview')!.textContent).toBe('Bạn: Tìm');
});
