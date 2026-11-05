import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatWidget } from './ChatWidget';
import * as api from './chatApi';
import { subscribeChat } from './chatRealtime';
import { getCurrentUser } from '../../shared/api/client';

vi.mock('./chatApi', async original => ({ ...await original<typeof api>(), getConversations: vi.fn(), getHistory: vi.fn(), sendMessage: vi.fn(), getChatUnreadCount: vi.fn(), markConversationRead: vi.fn() }));
vi.mock('./chatRealtime', () => ({ subscribeChat: vi.fn(() => vi.fn()) }));
vi.mock('../../shared/api/client', () => ({ getCurrentUser: vi.fn(), apiFetch: vi.fn() }));
let host: HTMLDivElement, root: Root;
const conversation: api.ChatConversation = { id: 7, peer: { id: 20, name: 'Coach Linh', role: 'COACH', available: true, avatarUrl: 'https://example.com/linh.jpg' }, createdAt: '2026-10-29T01:00:00Z', lastActivityAt: '2026-10-29T01:00:00Z' };
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(getCurrentUser).mockReturnValue({ id: 'member', identifier: 'member', name: 'Member', role: 'MEMBER' });
  vi.mocked(api.getConversations).mockResolvedValue({ content: [conversation], totalPages: 1, number: 0 });
  vi.mocked(api.getHistory).mockResolvedValue({ items: [], hasMore: false });
  vi.mocked(api.markConversationRead).mockResolvedValue({ count: 0 });
  vi.mocked(api.getChatUnreadCount).mockResolvedValue({ count: 0 });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const render = () => act(async () => root.render(<MemoryRouter><ChatWidget /></MemoryRouter>));
/** Khung chat tải lazy khi mở widget lần đầu: chờ module xong rồi mới kiểm tra. */
const settle = () => act(async () => { await vi.dynamicImportSettled(); });

it('opens the real inbox in place, preserves drafts and returns focus on Escape', async () => {
  await render();
  expect(api.getConversations).not.toHaveBeenCalled();
  expect(host.querySelectorAll('.chat-widget__mini-avatar')).toHaveLength(3);
  await act(async () => button('Mở tin nhắn').click()); await settle();
  expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Tin nhắn SÖL');
  expect(subscribeChat).toHaveBeenCalled();
  const contact = [...host.querySelectorAll('button')].find(node => node.textContent?.includes('Coach Linh'))!;
  await act(async () => contact.click());
  const input = host.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'Hẹn lịch tập');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(host.querySelector<HTMLElement>('[role="dialog"]')?.hidden).toBe(true);
  expect(document.activeElement).toBe(button('Mở tin nhắn'));
  await act(async () => button('Mở tin nhắn').click()); await settle();
  expect(host.querySelector('textarea')?.value).toBe('Hẹn lịch tập');
  expect(api.getConversations).toHaveBeenCalledTimes(1);
  // SÖL AI là một người trong danh sách tin nhắn, không còn nút riêng.
  expect(host.textContent).toContain('SÖL AI');
});

it('supports Instagram-style expand toggle and message heart reaction', async () => {
  vi.mocked(api.getHistory).mockResolvedValue({ items: [{ id: 1, conversationId: 7, clientMessageId: 'reply', senderId: 20, mine: false, message: 'Hẹn bạn lúc 18h', createdAt: '2026-11-02T10:00:00Z' }], hasMore: false });
  await render();
  await act(async () => button('Mở tin nhắn').click()); await settle();
  expect(host.querySelector<HTMLImageElement>('.chat-widget__mini-avatar img')?.getAttribute('src')).toBe('https://example.com/linh.jpg');
  await act(async () => button('Mở rộng cửa sổ tin nhắn').click());
  expect(host.querySelector('.chat-widget__panel')?.classList.contains('is-expanded')).toBe(true);
  await act(async () => [...host.querySelectorAll('button')].find(node => node.textContent?.includes('Coach Linh'))!.click());
  const bubble = host.querySelector<HTMLElement>('.direct-chat__bubble')!;
  await act(async () => { bubble.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
  expect(host.querySelector('.direct-chat__reaction-pill')?.textContent).toBe('❤️');
});

it('refreshes the visible conversation when realtime reports a new message', async () => {
  await render();
  await act(async () => button('Mở tin nhắn').click()); await settle();
  await act(async () => [...host.querySelectorAll('button')].find(node => node.textContent?.includes('Coach Linh'))!.click());
  vi.mocked(api.getHistory).mockResolvedValue({ items: [{ id: 1, conversationId: 7, clientMessageId: 'reply', senderId: 20, mine: false, message: 'Hẹn bạn lúc 18h', createdAt: '2026-11-02T10:00:00Z' }], hasMore: false });
  await act(async () => vi.mocked(subscribeChat).mock.calls[0][0]());
  expect(host.textContent).toContain('Hẹn bạn lúc 18h');
});

it('shows the unread badge and clears it after reading the conversation', async () => {
  vi.mocked(api.getChatUnreadCount).mockResolvedValue({ count: 2 });
  vi.mocked(api.getConversations).mockResolvedValue({ content: [{ ...conversation, unreadCount: 2, lastMessage: 'Hẹn bạn lúc 18h', lastMessageMine: false }], totalPages: 1, number: 0 });
  vi.mocked(api.getHistory).mockResolvedValue({ items: [{ id: 5, conversationId: 7, clientMessageId: 'reply', senderId: 20, mine: false, message: 'Hẹn bạn lúc 18h', createdAt: '2026-11-02T10:00:00Z' }], hasMore: false });
  await render();
  expect(host.querySelector('.chat-widget__badge')?.textContent).toBe('2');
  await act(async () => button('Mở tin nhắn · 2 chưa đọc').click()); await settle();
  expect(host.querySelector('.direct-chat__person:not(.direct-chat__person--ai) .direct-chat__preview')?.textContent).toBe('Hẹn bạn lúc 18h');
  expect(host.querySelector('.direct-chat__unread')?.textContent).toBe('2');
  await act(async () => [...host.querySelectorAll('button')].find(node => node.textContent?.includes('Coach Linh'))!.click());
  expect(api.markConversationRead).toHaveBeenCalledWith(7, 5);
  expect(host.querySelector('.chat-widget__badge')).toBeNull();
});

it('does not mark messages read while the panel is closed', async () => {
  await render();
  await act(async () => button('Mở tin nhắn').click()); await settle();
  await act(async () => [...host.querySelectorAll('button')].find(node => node.textContent?.includes('Coach Linh'))!.click());
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  vi.mocked(api.getHistory).mockResolvedValue({ items: [{ id: 9, conversationId: 7, clientMessageId: 'late', senderId: 20, mine: false, message: 'Tin mới', createdAt: '2026-11-02T10:00:00Z' }], hasMore: false });
  await act(async () => vi.mocked(subscribeChat).mock.calls[0][0]());
  expect(host.textContent).toContain('Tin mới');
  expect(api.markConversationRead).not.toHaveBeenCalled();
});

it('closes on outside pointer without stealing focus', async () => {
  await render();
  await act(async () => button('Mở tin nhắn').click()); await settle();
  await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(host.querySelector<HTMLElement>('[role="dialog"]')?.hidden).toBe(true);
});

it('asks guests to log in without fetching private data', async () => {
  vi.mocked(getCurrentUser).mockReturnValue(null);
  await render();
  await act(async () => button('Mở tin nhắn').click()); await settle();
  expect(host.querySelector('a')?.getAttribute('href')).toBe('/login');
  expect(api.getConversations).not.toHaveBeenCalled();
});

it('does not offer direct chat to managers', async () => {
  vi.mocked(getCurrentUser).mockReturnValue({ id: 'manager', identifier: 'manager', name: 'Manager', role: 'MANAGER' });
  await render();
  expect(host.querySelector('button')).toBeNull();
  expect(api.getConversations).not.toHaveBeenCalled();
});

/** jsdom không có PointerEvent: dựng MouseEvent mang đủ trường pointer mà React đọc. */
const pointer = (target: EventTarget, type: string, x: number, y: number) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
  target.dispatchEvent(event);
};

it('drags the chat pill anywhere, remembers the spot and does not toggle on drop', async () => {
  window.localStorage.removeItem('sol-chat-widget-position');
  await render();
  const pill = button('Mở tin nhắn');
  await act(async () => {
    pointer(pill, 'pointerdown', 10, 10);
    pointer(window, 'pointermove', 110, 60);
    pointer(window, 'pointermove', 210, 110);
    pointer(window, 'pointerup', 210, 110);
    pill.click();
  });
  const widget = host.querySelector<HTMLElement>('.chat-widget')!;
  expect(widget.style.left).toBe('200px');
  expect(widget.style.top).toBe('100px');
  expect(pill.getAttribute('aria-expanded')).toBe('false');
  expect(JSON.parse(window.localStorage.getItem('sol-chat-widget-position')!)).toEqual({ x: 200, y: 100 });
  window.localStorage.removeItem('sol-chat-widget-position');
});

it('still opens on a plain click without movement', async () => {
  window.localStorage.removeItem('sol-chat-widget-position');
  await render();
  const pill = button('Mở tin nhắn');
  await act(async () => {
    pointer(pill, 'pointerdown', 10, 10);
    pointer(window, 'pointerup', 12, 11);
    pill.click();
  });
  await settle();
  expect(host.querySelector<HTMLElement>('[role="dialog"]')?.hidden).toBe(false);
  expect(host.querySelector<HTMLElement>('.chat-widget')!.style.left).toBe('');
});
