import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { StaffSupportPage } from './StaffSupportPage';
import * as api from '../member/memberSupportApi';
import { subscribeSupport } from '../member/supportRealtime';

vi.mock('../member/memberSupportApi', () => ({ getSupportInbox: vi.fn(), getSupportTicket: vi.fn(), getSupportMessages: vi.fn(), sendSupportMessage: vi.fn(), updateSupportStatus: vi.fn() }));
vi.mock('../member/supportRealtime', () => ({ subscribeSupport: vi.fn() }));
const ticket: api.SupportTicket = { id: 7, memberId: 10, subject: 'Máy chạy', description: 'Cần hỗ trợ', status: 'open', createdAt: '2026-10-31T09:00:00', assignedToName: null };
let host: HTMLDivElement, root: Root;
const stop = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.mocked(api.getSupportInbox).mockResolvedValue({ content: [ticket], totalPages: 1 });
  vi.mocked(api.getSupportTicket).mockResolvedValue(ticket);
  vi.mocked(api.getSupportMessages).mockResolvedValue([]);
  vi.mocked(subscribeSupport).mockReturnValue(stop);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(<StaffSupportPage />)); }
async function open() { await act(async () => host.querySelector<HTMLButtonElement>('.member-support-ticket')!.click()); }
async function type(value: string) {
  const field = host.querySelector('textarea')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const reply: api.SupportMessage = { id: 31, senderId: 20, senderName: 'Lễ tân', senderRole: 'RECEPTIONIST', message: 'Phản hồi đã lưu', createdAt: ticket.createdAt };
async function close() { await act(async () => host.querySelector<HTMLButtonElement>('dialog .portal-dialog__close')!.click()); }
async function change(selector: string, value: string) {
  await act(async () => { const field = host.querySelector<HTMLSelectElement>(selector)!; field.value = value; field.dispatchEvent(new Event('change', { bubbles: true })); });
}
async function submit() {
  await act(async () => host.querySelector('.member-support-compose')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}

it('returns to a valid filtered page when replying removes the last ticket on the final page', async () => {
  let replied = false;
  const remaining = { ...ticket, id: 8, subject: 'Remaining open ticket' };
  vi.mocked(api.getSupportInbox).mockImplementation(async (page, filter) => {
    if (filter === 'open' && replied) return { content: page === 0 ? [remaining] : [], totalPages: 1 };
    return { content: [ticket], totalPages: 2 };
  });
  vi.mocked(api.sendSupportMessage).mockImplementation(async () => { replied = true; return reply; });
  await render(); await change('#staff-support-filter', 'open');
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Sau')!.click());
  await open(); await type('Reply'); await submit(); await close();
  expect(host.textContent).toContain('Remaining open ticket');
  expect(api.getSupportInbox).toHaveBeenLastCalledWith(0, 'open');
});

it.each([false, true])('restores focus after a reply refresh replaces the opener (ticket removed: %s)', async removed => {
  vi.mocked(api.sendSupportMessage).mockResolvedValue(reply);
  await render();
  const opener = host.querySelector<HTMLButtonElement>('.member-support-ticket')!;
  opener.focus();
  await open(); await type('Reply');
  const refreshed = deferred<{ content: api.SupportTicket[]; totalPages: number }>();
  vi.mocked(api.getSupportInbox).mockReturnValueOnce(refreshed.promise);
  await submit();
  expect(opener.isConnected).toBe(false);
  await act(async () => refreshed.resolve({ content: removed ? [] : [ticket], totalPages: removed ? 0 : 1 }));
  await close();
  expect(document.activeElement).toBe(removed ? host.querySelector('section.portal-card') : host.querySelector('.member-support-ticket'));
});

it.each(['send', 'status'] as const)('refreshes the current filter/page after pending %s and rejects an older query response', async kind => {
  const sending = deferred<api.SupportMessage>(), updating = deferred<api.SupportTicket>();
  vi.mocked(api.sendSupportMessage).mockReturnValue(sending.promise);
  vi.mocked(api.updateSupportStatus).mockReturnValue(updating.promise);
  vi.mocked(api.getSupportInbox).mockImplementation(async (page, filter) => ({
    content: [filter ? { ...ticket, id: 20 + (page ?? 0), subject: `Résolved page ${page}`, status: 'resolved' } : ticket], totalPages: 2,
  }));
  await render(); await open();
  if (kind === 'send') { await type('Phản hồi'); await submit(); }
  else await change('#staff-support-status', 'resolved');
  await close();
  const staleList = deferred<{ content: api.SupportTicket[]; totalPages: number }>();
  vi.mocked(api.getSupportInbox).mockReturnValueOnce(staleList.promise);
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Làm mới')!.click());
  await change('#staff-support-filter', 'resolved');
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Sau')!.click());
  await act(async () => { if (kind === 'send') sending.resolve(reply); else updating.resolve({ ...ticket, status: 'resolved' }); });
  expect(api.getSupportInbox).toHaveBeenLastCalledWith(1, 'resolved');
  await act(async () => staleList.resolve({ content: [{ ...ticket, subject: 'STALE QUERY' }], totalPages: 9 }));
  expect(host.querySelector<HTMLSelectElement>('#staff-support-filter')!.value).toBe('resolved');
  expect(host.textContent).toContain('Résolved page 1');
  expect(host.textContent).toContain('2/2');
  expect(host.textContent).not.toContain('STALE QUERY');
  expect(api.getSupportInbox).toHaveBeenCalledTimes(5);
});

it.each([
  ['send', 'before'], ['send', 'after'], ['status', 'before'], ['status', 'after'],
] as const)('reconciles %s after commit when a precommit GET completes %s the POST without another broadcast', async (kind, timing) => {
  vi.useFakeTimers();
  try {
    const sending = deferred<api.SupportMessage>(), updating = deferred<api.SupportTicket>();
    vi.mocked(api.sendSupportMessage).mockReturnValue(sending.promise);
    vi.mocked(api.updateSupportStatus).mockReturnValue(updating.promise);
    await render(); await open();
    if (kind === 'send') { await type('Phản hồi'); await submit(); }
    else await change('#staff-support-status', 'resolved');
    const oldTicket = deferred<api.SupportTicket>(), oldHistory = deferred<api.SupportMessage[]>();
    vi.mocked(api.getSupportTicket).mockReturnValueOnce(oldTicket.promise);
    vi.mocked(api.getSupportMessages).mockReturnValueOnce(oldHistory.promise);
    const changed = vi.mocked(subscribeSupport).mock.calls.find(call => call[2] === 7)![0];
    await act(async () => { changed(); await vi.advanceTimersByTimeAsync(80); });
    const finishOld = async () => { await act(async () => { oldTicket.resolve(ticket); oldHistory.resolve([]); }); };
    if (timing === 'before') await finishOld();
    const committed = { ...ticket, status: kind === 'send' ? 'in_progress' : 'resolved' } as api.SupportTicket;
    vi.mocked(api.getSupportTicket).mockResolvedValue(committed);
    vi.mocked(api.getSupportMessages).mockResolvedValue([reply, reply]);
    await act(async () => { if (kind === 'send') sending.resolve(reply); else updating.resolve(committed); });
    expect(api.getSupportMessages).toHaveBeenCalledTimes(3);
    if (timing === 'after') await finishOld();
    expect(host.querySelectorAll('.member-support-messages li')).toHaveLength(1);
    expect(host.querySelector('.member-support-messages')!.textContent).toContain(reply.message);
    expect(host.querySelector<HTMLSelectElement>('#staff-support-status')!.value).toBe(committed.status);
    expect(host.querySelector('textarea')!.value).toBe('');
    expect(host.querySelector('dialog')!.textContent).toContain(kind === 'send' ? 'Đã gửi tin nhắn.' : 'Đã cập nhật trạng thái.');
  } finally { vi.useRealTimers(); }
});

it('does not refresh another ticket or lose its draft when an earlier send succeeds', async () => {
  const sending = deferred<api.SupportMessage>();
  vi.mocked(api.sendSupportMessage).mockReturnValue(sending.promise);
  vi.mocked(api.getSupportInbox).mockResolvedValue({ content: [ticket, { ...ticket, id: 8, subject: 'Phiếu B' }], totalPages: 1 });
  vi.mocked(api.getSupportTicket).mockImplementation(async id => ({ ...ticket, id }));
  await render(); await open(); await type('Gửi A'); await submit(); await close();
  await act(async () => host.querySelectorAll<HTMLButtonElement>('.member-support-ticket')[1].click());
  await type('Nháp B');
  await act(async () => sending.resolve(reply));
  expect(api.getSupportMessages).toHaveBeenCalledTimes(2);
  expect(host.querySelector('dialog')!.textContent).toContain('#8');
  expect(host.querySelector('dialog')!.textContent).not.toContain('Đã gửi tin nhắn.');
  expect(host.querySelector('textarea')!.value).toBe('Nháp B');
});

it('refreshes only the list if a send completes after closing the modal', async () => {
  const sending = deferred<api.SupportMessage>();
  vi.mocked(api.sendSupportMessage).mockReturnValue(sending.promise);
  await render(); await open(); await type('Gửi A'); await submit(); await close();
  await act(async () => sending.resolve(reply));
  expect(host.querySelector('dialog')).toBeNull();
  expect(api.getSupportMessages).toHaveBeenCalledTimes(1);
  expect(api.getSupportInbox).toHaveBeenCalledTimes(2);
  vi.mocked(api.getSupportMessages).mockResolvedValue([reply]);
  await open();
  expect(host.querySelector('.member-support-messages')!.textContent).toContain(reply.message);
});
it('loads inbox, API detail and private ticket subscription; cleans up', async () => {
  await render(); await open();
  expect(api.getSupportInbox).toHaveBeenCalledWith(0, '');
  expect(api.getSupportTicket).toHaveBeenCalledWith(7);
  expect(subscribeSupport).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), 7);
  expect(host.textContent).toContain('Chưa có tin nhắn');
});
it('preserves failed send draft and offers retry without optimistic messages', async () => {
  vi.mocked(api.sendSupportMessage).mockRejectedValue(new Error('offline'));
  await render(); await open(); await type('Xin chào');
  await act(async () => host.querySelector('.member-support-compose')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.sendSupportMessage).toHaveBeenCalledWith(7, 'Xin chào', expect.any(String));
  expect(host.querySelector('textarea')!.value).toBe('Xin chào');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.querySelectorAll('.member-support-messages li')).toHaveLength(0);
});
it('blocks closed ticket sends and retries failed detail', async () => {
  vi.mocked(api.getSupportTicket).mockRejectedValueOnce(new Error('offline'));
  await render(); await open();
  expect(host.querySelector('dialog [role="alert"]')).not.toBeNull();
  expect(host.querySelector('.member-support-compose')).toBeNull();
  vi.mocked(api.getSupportTicket).mockResolvedValue({ ...ticket, status: 'closed' });
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>('dialog button')].find(b => b.textContent === 'Thử lại')!.click());
  expect(host.textContent).toContain('Phiếu đã đóng');
  expect(host.querySelector('.member-support-compose')).toBeNull();
});
it('coalesces broadcasts, refreshes on reconnect and disposes the selected channel', async () => {
  vi.useFakeTimers();
  try {
    await render(); await open();
    const [changed, state] = vi.mocked(subscribeSupport).mock.calls.find(call => call[2] === 7)!;
    await act(async () => { changed(); changed(); state('connected'); await vi.advanceTimersByTimeAsync(80); });
    expect(api.getSupportTicket).toHaveBeenCalledTimes(2);
    await act(async () => host.querySelector<HTMLButtonElement>('dialog .portal-dialog__close')!.click());
    expect(stop).toHaveBeenCalledTimes(1);
    await act(async () => { changed(); await vi.advanceTimersByTimeAsync(80); });
    expect(api.getSupportTicket).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});
it('rejects stale history after closing and opening a different ticket', async () => {
  let resolve!: (value: api.SupportMessage[]) => void;
  vi.mocked(api.getSupportInbox).mockResolvedValue({ content: [ticket, { ...ticket, id: 8, subject: 'Phiếu thứ hai' }], totalPages: 1 });
  vi.mocked(api.getSupportMessages).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  await render(); await open();
  await act(async () => host.querySelector<HTMLButtonElement>('dialog .portal-dialog__close')!.click());
  vi.mocked(api.getSupportTicket).mockResolvedValue({ ...ticket, id: 8 });
  await act(async () => host.querySelectorAll<HTMLButtonElement>('.member-support-ticket')[1].click());
  await act(async () => resolve([{ id: 4, senderId: 10, senderName: null, senderRole: 'MEMBER', message: 'STALE HISTORY', createdAt: ticket.createdAt }]));
  expect(host.textContent).not.toContain('STALE HISTORY');
  expect(host.querySelector('dialog')!.textContent).toContain('#8');
});
it('keeps authoritative status when status update fails', async () => {
  vi.mocked(api.updateSupportStatus).mockRejectedValue(new Error('offline'));
  await render(); await open();
  const select = host.querySelector<HTMLSelectElement>('#staff-support-status')!;
  await act(async () => { select.value = 'resolved'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(api.updateSupportStatus).toHaveBeenCalledWith(7, 'resolved');
  expect(select.value).toBe('open');
  expect(host.querySelector('dialog [role="alert"]')).not.toBeNull();
});
it('ignores callbacks from a closed channel after reopening the same ticket', async () => {
  vi.useFakeTimers();
  try {
    await render(); await open();
    const oldChanged = vi.mocked(subscribeSupport).mock.calls.find(call => call[2] === 7)![0];
    await act(async () => host.querySelector<HTMLButtonElement>('dialog .portal-dialog__close')!.click());
    await open();
    await act(async () => { oldChanged(); await vi.advanceTimersByTimeAsync(80); });
    expect(api.getSupportTicket).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});
it('retains send failure after a realtime refresh and guards duplicate submit', async () => {
  vi.useFakeTimers();
  try {
    let reject!: (reason: Error) => void;
    vi.mocked(api.sendSupportMessage).mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    await render(); await open(); await type('Giữ bản nháp');
    await act(async () => {
      const form = host.querySelector('.member-support-compose')!;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(api.sendSupportMessage).toHaveBeenCalledTimes(1);
    const changed = vi.mocked(subscribeSupport).mock.calls.find(call => call[2] === 7)![0];
    await act(async () => { changed(); await vi.advanceTimersByTimeAsync(80); });
    await act(async () => reject(new Error('offline')));
    expect(host.querySelector('textarea')!.value).toBe('Giữ bản nháp');
    expect(host.querySelector('dialog [role="alert"]')).not.toBeNull();
  } finally { vi.useRealTimers(); }
});
