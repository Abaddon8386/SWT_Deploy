import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatWidget } from './ChatWidget';
import * as api from './chatApi';
import { subscribeChat } from './chatRealtime';
import { getCurrentUser } from '../../shared/api/client';

vi.mock('./chatApi', async original => ({ ...await original<typeof api>(), getConversations: vi.fn(), getHistory: vi.fn(), sendMessage: vi.fn() }));
vi.mock('./chatRealtime', () => ({ subscribeChat: vi.fn(() => vi.fn()) }));
vi.mock('../../shared/api/client', () => ({ getCurrentUser: vi.fn(), apiFetch: vi.fn() }));
let host: HTMLDivElement, root: Root;
const conversation: api.ChatConversation = { id: 7, peer: { id: 20, name: 'Coach Linh', role: 'COACH', available: true }, createdAt: '2026-10-29T01:00:00Z', lastActivityAt: '2026-10-29T01:00:00Z' };
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(getCurrentUser).mockReturnValue({ id: 'member', identifier: 'member', name: 'Member', role: 'MEMBER' });
  vi.mocked(api.getConversations).mockResolvedValue({ content: [conversation], totalPages: 1, number: 0 });
  vi.mocked(api.getHistory).mockResolvedValue({ items: [], hasMore: false });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const render = () => act(async () => root.render(<MemoryRouter><ChatWidget /></MemoryRouter>));

it('opens the real inbox in place, preserves drafts and returns focus on Escape', async () => {
  await render();
  expect(api.getConversations).not.toHaveBeenCalled();
  await act(async () => button('Mở tin nhắn').click());
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
  await act(async () => button('Mở tin nhắn').click());
  expect(host.querySelector('textarea')?.value).toBe('Hẹn lịch tập');
  expect(api.getConversations).toHaveBeenCalledTimes(1);
  expect(host.textContent).not.toContain('SÖL AI');
});

it('refreshes the visible conversation when realtime reports a new message', async () => {
  await render();
  await act(async () => button('Mở tin nhắn').click());
  await act(async () => [...host.querySelectorAll('button')].find(node => node.textContent?.includes('Coach Linh'))!.click());
  vi.mocked(api.getHistory).mockResolvedValue({ items: [{ id: 1, conversationId: 7, clientMessageId: 'reply', senderId: 20, mine: false, message: 'Hẹn bạn lúc 18h', createdAt: '2026-11-02T10:00:00Z' }], hasMore: false });
  await act(async () => vi.mocked(subscribeChat).mock.calls[0][0]());
  expect(host.textContent).toContain('Hẹn bạn lúc 18h');
});

it('closes on outside pointer without stealing focus', async () => {
  await render();
  await act(async () => button('Mở tin nhắn').click());
  await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(host.querySelector<HTMLElement>('[role="dialog"]')?.hidden).toBe(true);
});

it('asks guests to log in without fetching private data', async () => {
  vi.mocked(getCurrentUser).mockReturnValue(null);
  await render();
  await act(async () => button('Mở tin nhắn').click());
  expect(host.querySelector('a')?.getAttribute('href')).toBe('/login');
  expect(api.getConversations).not.toHaveBeenCalled();
});

it('does not offer direct chat to managers', async () => {
  vi.mocked(getCurrentUser).mockReturnValue({ id: 'manager', identifier: 'manager', name: 'Manager', role: 'MANAGER' });
  await render();
  expect(host.querySelector('button')).toBeNull();
  expect(api.getConversations).not.toHaveBeenCalled();
});
