import { setLanguage } from '../../shared/i18n';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearNotices, getNotices } from '../../shared/lib/portalNotices';
import { MemberSupportPage } from './MemberSupportPage';
import * as supportApi from './memberSupportApi';
import { ApiError } from '../../shared/api/client';
import { subscribeSupport } from './supportRealtime';

vi.mock('./supportRealtime', () => ({ subscribeSupport: vi.fn(() => () => {}) }));
vi.mock('./memberSupportApi', () => ({ getMySupportTickets: vi.fn(), getSupportTicket: vi.fn(), createSupportTicket: vi.fn(), getSupportMessages: vi.fn(), sendSupportMessage: vi.fn() }));
const ticket = { id: 7, memberId: 10, subject: '[Thiết bị] Máy chạy', description: 'Máy không bật', status: 'open', createdAt: '2026-10-25T08:00:00', assignedToName: null } as supportApi.SupportTicket;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  setLanguage('vi');
  clearNotices();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.mocked(supportApi.getMySupportTickets).mockResolvedValue({ content: [ticket], totalPages: 1 });
  vi.mocked(supportApi.getSupportMessages).mockResolvedValue([]);
  vi.mocked(supportApi.getSupportTicket).mockResolvedValue(ticket);
  vi.mocked(subscribeSupport).mockImplementation(() => () => {});
});
afterEach(async () => { await act(async () => root.unmount());
    setLanguage('vi'); host.remove(); vi.resetAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(<MemberSupportPage />)); }
async function click(button: HTMLButtonElement) { await act(async () => button.click()); }
async function type(selector: string, value: string) {
  const field = host.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
  await act(async () => { const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set; setter?.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function submit(selector: string) {
  await act(async () => host.querySelector(selector)?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}
async function closeChat() { await click(host.querySelector('button[aria-label="Đóng hộp thoại"]') as HTMLButtonElement); }
async function chooseTicket(id: number) {
  if (host.querySelector('dialog')) await closeChat();
  await click([...host.querySelectorAll<HTMLButtonElement>('.member-support-ticket')].find(button => button.textContent?.includes(`#${id} ·`))!);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const otherTicket = { ...ticket, id: 8, subject: '[Khác] Phiếu B' };
const message = (id: number, text: string): supportApi.SupportMessage => ({ id, senderId: 10, senderName: 'Bạn', senderRole: 'MEMBER', message: text, createdAt: ticket.createdAt });

it('keeps support ticket and message skeletons until their requests settle', async () => {
  const tickets = deferred<{ content: supportApi.SupportTicket[]; totalPages: number }>();
  const history = deferred<supportApi.SupportMessage[]>();
  vi.mocked(supportApi.getMySupportTickets).mockReturnValueOnce(tickets.promise);
  vi.mocked(supportApi.getSupportMessages).mockReturnValueOnce(history.promise);
  await render();
  expect(host.querySelector('[aria-labelledby="support-list-title"] [role="status"] [aria-hidden="true"]')).not.toBeNull();
  expect(host.textContent).not.toContain('Bạn chưa có phiếu');
  await act(async () => tickets.resolve({ content: [ticket], totalPages: 1 }));
  await chooseTicket(7);
  expect(host.querySelector('.member-support-conversation [role="status"] [aria-hidden="true"]')).not.toBeNull();
  expect(host.textContent).not.toContain('Chưa có tin nhắn');
  await type('#support-message', 'Xin chào');
  expect(host.querySelector<HTMLButtonElement>('.member-support-compose button')?.disabled).toBe(true);
  await act(async () => history.resolve([]));
  expect(host.querySelector('.member-support-conversation [aria-busy="true"]')).toBeNull();
  expect(host.textContent).toContain('Chưa có tin nhắn');
  expect(host.querySelector<HTMLButtonElement>('.member-support-compose button')?.disabled).toBe(false);
});

it('refetches authoritative messages and closed status on realtime invalidation without duplicates', async () => {
  await render(); await chooseTicket(7);
  const changed = vi.mocked(subscribeSupport).mock.calls.at(-1)![0];
  vi.mocked(supportApi.getSupportMessages).mockResolvedValue([message(21, 'Nhân viên phản hồi'), message(21, 'Nhân viên phản hồi')]);
  vi.mocked(supportApi.getSupportTicket).mockResolvedValue({ ...ticket, status: 'closed' });
  await act(async () => { changed(); changed(); await new Promise(resolve => setTimeout(resolve, 120)); });
  expect(host.querySelectorAll('.member-support-messages li')).toHaveLength(1);
  expect(host.textContent).toContain('Nhân viên phản hồi');
  expect(host.querySelector('.member-support-compose')).toBeNull();
  expect(supportApi.sendSupportMessage).not.toHaveBeenCalled();
});

it('cleans up ticket subscription and ignores late invalidation after changing ticket', async () => {
  const cleanup = vi.fn();
  vi.mocked(subscribeSupport).mockReturnValue(cleanup);
  vi.mocked(supportApi.getMySupportTickets).mockResolvedValue({ content: [ticket, otherTicket], totalPages: 1 });
  await render(); await chooseTicket(7);
  const stale = vi.mocked(subscribeSupport).mock.calls.at(-1)![0];
  await chooseTicket(8);
  expect(cleanup).toHaveBeenCalled();
  const calls = vi.mocked(supportApi.getSupportMessages).mock.calls.length;
  await act(async () => { stale(); await new Promise(resolve => setTimeout(resolve, 120)); });
  expect(supportApi.getSupportMessages).toHaveBeenCalledTimes(calls);
  expect(host.querySelector('dialog')?.textContent).toContain('Phiếu #8');
});

it('does not overwrite a newer closed state with delayed realtime ticket metadata', async () => {
  await render(); await chooseTicket(7);
  const detail = deferred<supportApi.SupportTicket>();
  vi.mocked(supportApi.getSupportTicket).mockReturnValueOnce(detail.promise);
  const changed = vi.mocked(subscribeSupport).mock.calls.at(-1)![0];
  await act(async () => { changed(); await new Promise(resolve => setTimeout(resolve, 120)); });
  vi.mocked(supportApi.getMySupportTickets).mockResolvedValueOnce({ content: [{ ...ticket, status: 'closed' }], totalPages: 1 });
  await click([...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Làm mới hội thoại')!);
  expect(host.querySelector('.member-support-compose')).toBeNull();
  await act(async () => detail.resolve(ticket));
  expect(host.querySelector('.member-support-compose')).toBeNull();
});

it('keeps the same idempotency key for a manual retry after an ambiguous POST failure', async () => {
  vi.mocked(supportApi.sendSupportMessage).mockRejectedValueOnce(new Error('network')).mockResolvedValue(message(1, 'Xin chào'));
  await render(); await chooseTicket(7); await type('#support-message', 'Xin chào');
  await submit('.member-support-compose'); await submit('.member-support-compose');
  const calls = vi.mocked(supportApi.sendSupportMessage).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0][2]).toMatch(/^[0-9a-f-]{36}$/);
  expect(calls[1][2]).toBe(calls[0][2]);
});

it('lists member tickets, maps status and opens an empty conversation', async () => {
  await render();
  expect(host.textContent).toContain('Máy chạy');
  expect(host.textContent).toContain('Đang chờ');
  await click(host.querySelector('.member-support-ticket') as HTMLButtonElement);
  expect(supportApi.getSupportMessages).toHaveBeenCalledWith(7);
  expect(host.textContent).toContain('Chưa có tin nhắn');
});

it('creates a categorized ticket and refreshes the list', async () => {
  vi.mocked(supportApi.createSupportTicket).mockResolvedValue(ticket);
  await render();
  await type('#support-subject', 'Gia hạn gói');
  await act(async () => { (host.querySelector('.member-support-form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(supportApi.createSupportTicket).toHaveBeenCalledWith('[Gói tập] Gia hạn gói', '');
  expect(supportApi.getMySupportTickets).toHaveBeenCalledTimes(2);
  expect(getNotices().map((notice) => notice.message).join(' ')).toContain('Đã tạo phiếu #7');
  expect(host.querySelector('dialog')?.textContent).toContain('Phiếu #7');
  expect(supportApi.getSupportMessages).toHaveBeenCalledWith(7);
});

it('sends a message once and reloads the conversation', async () => {
  vi.mocked(supportApi.sendSupportMessage).mockResolvedValue({ id: 2, senderId: 10, senderName: 'Bạn', senderRole: 'MEMBER', message: 'Xin chào', createdAt: '2026-10-25T09:00:00' });
  await render(); await click(host.querySelector('.member-support-ticket') as HTMLButtonElement);
  await type('#support-message', 'Xin chào');
  await act(async () => { (host.querySelector('.member-support-compose') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(supportApi.sendSupportMessage).toHaveBeenCalledWith(7, 'Xin chào', expect.any(String));
  expect(supportApi.getSupportMessages).toHaveBeenCalledTimes(2);
});

it('blocks composing on closed tickets and shows list failure', async () => {
  vi.mocked(supportApi.getMySupportTickets).mockResolvedValue({ content: [{ ...ticket, status: 'closed' }], totalPages: 1 });
  await render(); await click(host.querySelector('.member-support-ticket') as HTMLButtonElement);
  expect(host.textContent).toContain('Phiếu đã đóng');
  expect(host.querySelector('.member-support-compose')).toBeNull();
});

it('shows API errors without adding a fake ticket', async () => {
  vi.mocked(supportApi.getMySupportTickets).mockRejectedValueOnce(new Error('offline'));
  await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Không thể hoàn tất');
  expect(host.querySelector('.member-support-ticket')).toBeNull();
});

it('keeps message draft when the send API fails', async () => {
  vi.mocked(supportApi.sendSupportMessage).mockRejectedValue(new Error('offline'));
  await render(); await click(host.querySelector('.member-support-ticket') as HTMLButtonElement);
  await type('#support-message', 'Thử lại');
  await act(async () => { (host.querySelector('.member-support-compose') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Không thể hoàn tất');
  expect((host.querySelector('#support-message') as HTMLTextAreaElement).value).toBe('Thử lại');
});

it('uses the refreshed ticket status and preserves draft until the ticket is closed', async () => {
  await render(); await click(host.querySelector('.member-support-ticket') as HTMLButtonElement);
  await type('#support-message', 'Nội dung đang soạn');
  vi.mocked(supportApi.getMySupportTickets).mockResolvedValueOnce({ content: [{ ...ticket, status: 'resolved' }], totalPages: 1 });
  const refresh = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Làm mới')!;
  await click(refresh);
  expect(host.querySelector('.member-support-context')?.textContent).toContain('Đã giải quyết');
  expect((host.querySelector('#support-message') as HTMLTextAreaElement).value).toBe('Nội dung đang soạn');
  vi.mocked(supportApi.getMySupportTickets).mockResolvedValueOnce({ content: [{ ...ticket, status: 'closed' }], totalPages: 1 });
  await click(refresh);
  expect(host.querySelector('.member-support-context')?.textContent).toContain('Đã đóng');
  expect(host.querySelector('.member-support-compose')).toBeNull();
  expect(supportApi.sendSupportMessage).not.toHaveBeenCalled();
  expect(host.querySelector('.portal-container.member-support')).not.toBeNull();
});

it('keeps the open chat and draft even when the refreshed list has another page', async () => {
  vi.mocked(supportApi.getMySupportTickets).mockResolvedValue({ content: [ticket], totalPages: 2 });
  await render(); await click(host.querySelector('.member-support-ticket') as HTMLButtonElement);
  await type('#support-message', 'Bản nháp chưa gửi');
  vi.mocked(supportApi.getMySupportTickets).mockResolvedValueOnce({ content: [{ ...ticket, id: 8 }], totalPages: 2 });
  await click([...host.querySelectorAll('button')].find((button) => button.textContent === 'Sau')!);
  expect((host.querySelector('#support-message') as HTMLTextAreaElement).value).toBe('Bản nháp chưa gửi');
  expect(host.querySelector('dialog')?.textContent).toContain('Phiếu #7');
  await click([...host.querySelectorAll('button')].find((button) => button.textContent === 'Trước')!);
  expect((host.querySelector('#support-message') as HTMLTextAreaElement).value).toBe('Bản nháp chưa gửi');
  expect(supportApi.getMySupportTickets).toHaveBeenLastCalledWith(0);
});

it('opens the backend-created ticket immediately even when list refresh fails', async () => {
  vi.mocked(supportApi.createSupportTicket).mockResolvedValue({ ...otherTicket, id: 42 });
  vi.mocked(supportApi.getMySupportTickets).mockResolvedValueOnce({ content: [ticket], totalPages: 1 }).mockRejectedValueOnce(new Error('offline'));
  await render(); await type('#support-subject', 'Cần hỗ trợ'); await submit('.member-support-form');
  expect(host.querySelector('dialog')?.textContent).toContain('Phiếu #42');
  expect(supportApi.getSupportMessages).toHaveBeenCalledWith(42);
});

it('does not open a chat or clear the form when ticket creation fails', async () => {
  vi.mocked(supportApi.createSupportTicket).mockRejectedValue(new ApiError('Không thể tạo phiếu', 503));
  await render(); await type('#support-subject', 'Cần hỗ trợ'); await submit('.member-support-form');
  expect(host.querySelector('dialog')).toBeNull();
  expect(host.textContent).not.toContain('Đã tạo phiếu');
  expect((host.querySelector('#support-subject') as HTMLInputElement).value).toBe('Cần hỗ trợ');
  expect(host.textContent).toContain('Không thể tạo phiếu');
});

it('invalidates A when B history resolves first and keeps each draft when reopening', async () => {
  const historyA = deferred<supportApi.SupportMessage[]>();
  vi.mocked(supportApi.getMySupportTickets).mockResolvedValue({ content: [ticket, otherTicket], totalPages: 1 });
  vi.mocked(supportApi.getSupportMessages).mockImplementationOnce(() => historyA.promise).mockResolvedValue([message(2, 'Lịch sử B')]);
  await render(); await chooseTicket(7); await type('#support-message', 'Nháp A');
  await chooseTicket(8); await type('#support-message', 'Nháp B');
  await act(async () => historyA.resolve([message(1, 'Response cũ A')]));
  expect(host.querySelector('dialog')?.textContent).toContain('Lịch sử B');
  expect(host.querySelector('dialog')?.textContent).not.toContain('Response cũ A');
  await chooseTicket(7);
  expect((host.querySelector('#support-message') as HTMLTextAreaElement).value).toBe('Nháp A');
  await chooseTicket(8);
  expect((host.querySelector('#support-message') as HTMLTextAreaElement).value).toBe('Nháp B');
});

it('does not clear B draft or load A into B when A send finishes', async () => {
  const sentA = deferred<supportApi.SupportMessage>();
  vi.mocked(supportApi.getMySupportTickets).mockResolvedValue({ content: [ticket, otherTicket], totalPages: 1 });
  vi.mocked(supportApi.sendSupportMessage).mockImplementationOnce(() => sentA.promise);
  await render(); await chooseTicket(7); await type('#support-message', 'Gửi A'); await submit('.member-support-compose');
  await chooseTicket(8); await type('#support-message', 'Giữ B');
  await act(async () => sentA.resolve(message(1, 'Gửi A')));
  expect((host.querySelector('#support-message') as HTMLTextAreaElement).value).toBe('Giữ B');
  expect(supportApi.getSupportMessages).toHaveBeenLastCalledWith(8);
  expect(host.querySelector('dialog')?.textContent).not.toContain('Gửi A');
  await chooseTicket(7);
  expect((host.querySelector('#support-message') as HTMLTextAreaElement).value).toBe('');
});

it('keeps a pending send locked across closing and reopening the same ticket', async () => {
  const sent = deferred<supportApi.SupportMessage>();
  vi.mocked(supportApi.sendSupportMessage).mockImplementationOnce(() => sent.promise);
  await render(); await chooseTicket(7); await type('#support-message', 'Một lần'); await submit('.member-support-compose');
  await chooseTicket(7); await submit('.member-support-compose');
  expect(supportApi.sendSupportMessage).toHaveBeenCalledTimes(1);
  await act(async () => sent.resolve(message(1, 'Một lần')));
});

it('ignores a history error after switching away and can retry the current history', async () => {
  const old = deferred<supportApi.SupportMessage[]>();
  vi.mocked(supportApi.getMySupportTickets).mockResolvedValue({ content: [ticket, otherTicket], totalPages: 1 });
  vi.mocked(supportApi.getSupportMessages).mockImplementationOnce(() => old.promise).mockRejectedValueOnce(new ApiError('Lỗi B', 503)).mockResolvedValue([]);
  await render(); await chooseTicket(7); await chooseTicket(8);
  await act(async () => old.reject(new ApiError('Lỗi cũ A', 503)));
  expect(host.querySelector('dialog')?.textContent).toContain('Lỗi B');
  expect(host.querySelector('dialog')?.textContent).not.toContain('Lỗi cũ A');
  await click([...host.querySelectorAll<HTMLButtonElement>('dialog button')].find(button => button.textContent === 'Thử lại')!);
  expect(host.querySelector('dialog')?.textContent).toContain('Chưa có tin nhắn');
});

it('does not allow a send when the history API rejects ticket ownership', async () => {
  vi.mocked(supportApi.getSupportMessages).mockRejectedValue(new ApiError('Không có quyền xem phiếu', 403));
  await render(); await chooseTicket(7);
  expect(host.querySelector('dialog')?.textContent).toContain('Không có quyền xem phiếu');
  expect(host.querySelector('.member-support-compose')).toBeNull();
  expect(supportApi.sendSupportMessage).not.toHaveBeenCalled();
});

it('closes on Escape, restores focus and reopens chat with its draft', async () => {
  await render(); await chooseTicket(7); await type('#support-message', 'Giữ khi đóng');
  await act(async () => host.querySelector('dialog')?.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true })));
  expect(host.querySelector('dialog')).toBeNull();
  expect(document.activeElement?.classList.contains('member-support-ticket')).toBe(true);
  await chooseTicket(7);
  expect((host.querySelector('#support-message') as HTMLTextAreaElement).value).toBe('Giữ khi đóng');
});

it('ignores completion after unmount without starting more API calls', async () => {
  const created = deferred<supportApi.SupportTicket>();
  vi.mocked(supportApi.createSupportTicket).mockImplementationOnce(() => created.promise);
  await render(); await type('#support-subject', 'Sau unmount'); await submit('.member-support-form');
  await act(async () => root.render(null));
  await act(async () => created.resolve(ticket));
  expect(supportApi.getMySupportTickets).toHaveBeenCalledTimes(1);
  expect(supportApi.getSupportMessages).not.toHaveBeenCalled();
});

it('refreshes ticket status inside the modal and keeps closed status after list pagination', async () => {
  vi.mocked(supportApi.getMySupportTickets).mockResolvedValue({ content: [ticket], totalPages: 2 });
  await render(); await chooseTicket(7); await type('#support-message', 'Chưa gửi');
  vi.mocked(supportApi.getMySupportTickets).mockResolvedValueOnce({ content: [{ ...ticket, status: 'closed' }], totalPages: 2 });
  await click([...host.querySelectorAll<HTMLButtonElement>('dialog button')].find(button => button.textContent === 'Làm mới hội thoại')!);
  expect(host.querySelector('.member-support-compose')).toBeNull();
  vi.mocked(supportApi.getMySupportTickets).mockResolvedValueOnce({ content: [otherTicket], totalPages: 2 });
  await click([...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Sau')!);
  expect(host.querySelector('dialog')?.textContent).toContain('Phiếu đã đóng');
  expect(host.querySelector('.member-support-compose')).toBeNull();
});

it('prevents duplicate ticket creation and opens only after the API returns its ID', async () => {
  const created = deferred<supportApi.SupportTicket>();
  vi.mocked(supportApi.createSupportTicket).mockImplementationOnce(() => created.promise);
  await render(); await type('#support-subject', 'Một phiếu');
  await act(async () => {
    const form = host.querySelector('.member-support-form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(supportApi.createSupportTicket).toHaveBeenCalledTimes(1);
  expect(host.querySelector('dialog')).toBeNull();
  await act(async () => created.resolve({ ...ticket, id: 99 }));
  expect(host.querySelector('dialog')?.textContent).toContain('Phiếu #99');
  expect(supportApi.getSupportMessages).toHaveBeenLastCalledWith(99);
});

it('deduplicates history by backend message ID', async () => {
  vi.mocked(supportApi.getSupportMessages).mockResolvedValue([message(3, 'Một tin'), message(3, 'Một tin')]);
  await render(); await chooseTicket(7);
  expect(host.querySelectorAll('.member-support-messages li')).toHaveLength(1);
});

it('shows a late A send failure only in A and preserves both drafts', async () => {
  const sent = deferred<supportApi.SupportMessage>();
  vi.mocked(supportApi.getMySupportTickets).mockResolvedValue({ content: [ticket, otherTicket], totalPages: 1 });
  vi.mocked(supportApi.sendSupportMessage).mockImplementationOnce(() => sent.promise);
  await render(); await chooseTicket(7); await type('#support-message', 'Nháp A'); await submit('.member-support-compose');
  await chooseTicket(8); await type('#support-message', 'Nháp B');
  await act(async () => sent.reject(new ApiError('Gửi A thất bại', 400)));
  expect(host.querySelector('dialog')?.textContent).not.toContain('Gửi A thất bại');
  expect((host.querySelector('#support-message') as HTMLTextAreaElement).value).toBe('Nháp B');
  await chooseTicket(7);
  expect(host.querySelector('dialog')?.textContent).toContain('Gửi A thất bại');
  expect((host.querySelector('#support-message') as HTMLTextAreaElement).value).toBe('Nháp A');
});

it('does not submit a blank title', async () => {
  await render(); await type('#support-subject', '  '); await submit('.member-support-form');
  expect(supportApi.createSupportTicket).not.toHaveBeenCalled();
  expect(host.querySelector('dialog')).toBeNull();
  expect(host.textContent).toContain('Vui lòng nhập tiêu đề');
});

it('refreshes status on opening an old list item that staff has closed', async () => {
  await render();
  vi.mocked(supportApi.getMySupportTickets).mockResolvedValue({ content: [{ ...ticket, status: 'closed' }], totalPages: 1 });
  await chooseTicket(7);
  expect(host.querySelector('dialog')?.textContent).toContain('Phiếu đã đóng');
  expect(host.querySelector('.member-support-compose')).toBeNull();
  expect(supportApi.sendSupportMessage).not.toHaveBeenCalled();
});

it('prevents duplicate sends while a message is pending', async () => {
  let resolve!: (message: supportApi.SupportMessage) => void;
  vi.mocked(supportApi.sendSupportMessage).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await render(); await click(host.querySelector('.member-support-ticket') as HTMLButtonElement);
  await type('#support-message', 'Xin chào');
  await act(async () => {
    const form = host.querySelector('.member-support-compose') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(supportApi.sendSupportMessage).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ id: 2, senderId: 10, senderName: 'Bạn', senderRole: 'MEMBER', message: 'Xin chào', createdAt: ticket.createdAt }));
});

it('switches support dropdown labels, status, modal and placeholders without changing draft/category values', async () => {
  await render();
  await type('#support-subject', 'Gói tập');
  await chooseTicket(7);
  await type('#support-message', 'Đóng');
  await act(async () => setLanguage('en'));
  expect(host.querySelector('#support-subject')?.getAttribute('placeholder')).toBe('Summarize the issue');
  expect(host.querySelector<HTMLTextAreaElement>('#support-message')?.placeholder).toBe('Enter your reply…');
  expect(host.querySelector<HTMLTextAreaElement>('#support-message')?.value).toBe('Đóng');
  expect(host.querySelector<HTMLInputElement>('#support-subject')?.value).toBe('Gói tập');
  expect(host.querySelector('.member-support-status')?.textContent).toBe('Pending');
  expect(host.querySelector('dialog')?.textContent).toContain('Conversation · Ticket #7');
  expect(host.textContent).toContain('Máy chạy');
  expect(host.querySelector<HTMLSelectElement>('select')?.value).toBe('Gói tập');
  expect(host.querySelector('select option[value="Thiết bị"]')?.textContent).toBe('Equipment');
  await act(async () => setLanguage('vi'));
  expect(host.querySelector('.member-support-status')?.textContent).toBe('Đang chờ');
  expect(host.querySelector<HTMLTextAreaElement>('#support-message')?.value).toBe('Đóng');
});
