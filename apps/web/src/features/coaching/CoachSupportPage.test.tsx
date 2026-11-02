import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoachSupportPage } from './CoachSupportPage';
import * as coachSupportApi from './coachSupportApi';

vi.mock('./coachSupportApi', () => ({
  getCoachSupportTickets: vi.fn(),
  getSupportMessages: vi.fn(),
  sendSupportMessage: vi.fn(),
  updateSupportTicketStatus: vi.fn(),
}));

describe('CoachSupportPage', () => {
  const mockTickets: coachSupportApi.SupportTicket[] = [
    {
      id: 101,
      memberId: 5,
      subject: '[Lịch học] Yêu cầu đổi ca tập',
      description: 'Em muốn xin đổi sang ca 18:00.',
      status: 'open',
      createdAt: '2026-11-01T10:00:00Z',
      assignedToName: null,
    },
    {
      id: 102,
      memberId: 8,
      subject: '[Khác] Góp ý bài tập',
      description: 'HLV nhiệt tình!',
      status: 'resolved',
      createdAt: '2026-11-01T14:30:00Z',
      assignedToName: 'Coach Nam',
    },
  ];

  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    vi.mocked(coachSupportApi.getCoachSupportTickets).mockResolvedValue({
      content: mockTickets,
      totalElements: 2,
      totalPages: 1,
      number: 0,
      size: 20,
    });
    vi.mocked(coachSupportApi.getSupportMessages).mockResolvedValue([
      {
        id: 1,
        senderId: 5,
        senderName: 'Học viên Mai',
        senderRole: 'MEMBER',
        message: 'Thầy cho em hỏi lớp 18:00 còn chỗ không ạ?',
        createdAt: '2026-11-01T10:05:00Z',
      },
    ]);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  async function render() {
    await act(async () => root.render(<CoachSupportPage />));
  }

  async function click(el: HTMLElement) {
    await act(async () => el.click());
  }

  async function typeTextarea(selector: string, value: string) {
    const field = host.querySelector(selector) as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set;
      setter?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  it('renders header and lists tickets for coach', async () => {
    await render();
    expect(host.textContent).toContain('Khiếu nại & Ý kiến học viên');
    expect(host.textContent).toContain('Huấn luyện viên');
    expect(host.textContent).toContain('[Lịch học] Yêu cầu đổi ca tập');
    expect(host.textContent).toContain('[Khác] Góp ý bài tập');
  });

  it('auto selects first ticket and displays conversation messages', async () => {
    await render();
    expect(coachSupportApi.getSupportMessages).toHaveBeenCalledWith(101);
    expect(host.textContent).toContain('Thầy cho em hỏi lớp 18:00 còn chỗ không ạ?');
  });

  it('allows coach to send reply message', async () => {
    vi.mocked(coachSupportApi.sendSupportMessage).mockResolvedValue({
      id: 2,
      senderId: 2,
      senderName: 'Coach John',
      senderRole: 'COACH',
      message: 'Chào em, lớp 18:00 vẫn còn chỗ nhé!',
      createdAt: '2026-11-01T10:10:00Z',
    });

    await render();
    await typeTextarea('.coach-support-input', 'Chào em, lớp 18:00 vẫn còn chỗ nhé!');

    const form = host.querySelector('.coach-support-compose') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(coachSupportApi.sendSupportMessage).toHaveBeenCalledWith(101, 'Chào em, lớp 18:00 vẫn còn chỗ nhé!');
    expect(host.textContent).toContain('Chào em, lớp 18:00 vẫn còn chỗ nhé!');
  });

  it('allows coach to filter tickets by status', async () => {
    await render();
    const resolvedBtn = Array.from(host.querySelectorAll('.filter-chip')).find(
      (b) => b.textContent?.includes('Đã giải quyết')
    ) as HTMLButtonElement;

    expect(resolvedBtn).toBeDefined();
    await click(resolvedBtn);
    expect(coachSupportApi.getCoachSupportTickets).toHaveBeenCalledWith('RESOLVED', 0);
  });

  it('allows coach to update ticket status via Select component', async () => {
    vi.mocked(coachSupportApi.updateSupportTicketStatus).mockResolvedValue({
      ...mockTickets[0],
      status: 'in_progress',
    });

    await render();
    const nativeSelect = host.querySelector('select.ui-select__native') as HTMLSelectElement;
    expect(nativeSelect).toBeDefined();

    await act(async () => {
      nativeSelect.value = 'in_progress';
      nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(coachSupportApi.updateSupportTicketStatus).toHaveBeenCalledWith(101, 'in_progress');
  });

  it('renders empty state when no tickets found', async () => {
    vi.mocked(coachSupportApi.getCoachSupportTickets).mockResolvedValueOnce({
      content: [],
      totalElements: 0,
      totalPages: 0,
      number: 0,
      size: 20,
    });

    await render();
    expect(host.textContent).toContain('Không có khiếu nại nào');
  });
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
  }

  function ticketButton(id: number) {
    return Array.from(host.querySelectorAll<HTMLButtonElement>('.coach-support-card'))
      .find((button) => button.textContent?.includes(`#${id}`))!;
  }

  it('ignores old message responses after changing ticket', async () => {
    const first = deferred<coachSupportApi.SupportMessage[]>();
    vi.mocked(coachSupportApi.getSupportMessages).mockImplementation((id) => id === 101 ? first.promise : Promise.resolve([
      { id: 2, senderId: 8, senderName: 'Other member', senderRole: 'MEMBER', message: 'Ticket B message', createdAt: '2026-11-01T11:00:00Z' },
    ]));
    await render();
    await click(ticketButton(102));
    await act(async () => first.resolve([
      { id: 1, senderId: 5, senderName: 'First member', senderRole: 'MEMBER', message: 'Late ticket A message', createdAt: '2026-11-01T10:00:00Z' },
    ]));
    expect(host.querySelector('.coach-support-chat')?.textContent).toContain('Ticket B message');
    expect(host.querySelector('.coach-support-chat')?.textContent).not.toContain('Late ticket A message');
  });

  it('keeps drafts separate when changing tickets', async () => {
    await render();
    await typeTextarea('.coach-support-input', 'Draft for A');
    await click(ticketButton(102));
    expect((host.querySelector('.coach-support-input') as HTMLTextAreaElement).value).toBe('');
    await typeTextarea('.coach-support-input', 'Draft for B');
    await click(ticketButton(101));
    expect((host.querySelector('.coach-support-input') as HTMLTextAreaElement).value).toBe('Draft for A');
  });

  it('does not append a reply from another ticket or clear its draft', async () => {
    const sent = deferred<coachSupportApi.SupportMessage>();
    vi.mocked(coachSupportApi.sendSupportMessage).mockReturnValue(sent.promise);
    await render();
    await typeTextarea('.coach-support-input', 'Reply to A');
    await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await click(ticketButton(102));
    await typeTextarea('.coach-support-input', 'Draft for B');
    await act(async () => sent.resolve({ id: 5, senderId: 2, senderName: 'Coach', senderRole: 'COACH', message: 'Reply to A', createdAt: '2026-11-01T12:00:00Z' }));
    expect(host.querySelector('.coach-support-chat')?.textContent).not.toContain('Reply to A');
    expect((host.querySelector('.coach-support-input') as HTMLTextAreaElement).value).toBe('Draft for B');
  });

  it('selects a ticket in the new filter instead of retaining a missing selection', async () => {
    await render();
    vi.mocked(coachSupportApi.getCoachSupportTickets).mockResolvedValue({ content: [mockTickets[1]], totalElements: 1, totalPages: 1, number: 0, size: 20 });
    await click(Array.from(host.querySelectorAll<HTMLButtonElement>('.filter-chip')).find((button) => button.textContent === 'Đã giải quyết')!);
    expect(host.querySelector('.coach-support-detail-title')?.textContent).toBe(mockTickets[1].subject);
  });

  it('ignores an outdated ticket list when status filters change quickly', async () => {
    await render();
    const oldList = deferred<coachSupportApi.SupportTicketPage>();
    vi.mocked(coachSupportApi.getCoachSupportTickets).mockImplementation((status) => status === 'OPEN' ? oldList.promise : Promise.resolve({ content: [mockTickets[1]], totalElements: 1, totalPages: 1, number: 0, size: 20 }));
    await click(Array.from(host.querySelectorAll<HTMLButtonElement>('.filter-chip')).find((button) => button.textContent === 'Đang chờ')!);
    await click(Array.from(host.querySelectorAll<HTMLButtonElement>('.filter-chip')).find((button) => button.textContent === 'Đã giải quyết')!);
    await act(async () => oldList.resolve({ content: [mockTickets[0]], totalElements: 1, totalPages: 1, number: 0, size: 20 }));
    expect(host.querySelector('.coach-support-list')?.textContent).toContain(mockTickets[1].subject);
    expect(host.querySelector('.coach-support-list')?.textContent).not.toContain(mockTickets[0].subject);
  });

  it('allows reaching tickets beyond the first page', async () => {
    vi.mocked(coachSupportApi.getCoachSupportTickets).mockImplementation((_status, page = 0) => Promise.resolve({ content: [mockTickets[page]], totalElements: 21, totalPages: 2, number: page, size: 20 }));
    await render();
    const next = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === 'Trang sau');
    expect(next).toBeDefined();
    await click(next!);
    expect(coachSupportApi.getCoachSupportTickets).toHaveBeenLastCalledWith('ALL', 1);
    expect(host.querySelector('.coach-support-detail-title')?.textContent).toBe(mockTickets[1].subject);
  });

  it('shows actual staff sender names and offers only valid status transitions', async () => {
    vi.mocked(coachSupportApi.getSupportMessages).mockResolvedValue([{ id: 3, senderId: 99, senderName: 'Receptionist Lan', senderRole: 'RECEPTIONIST', message: 'Staff reply', createdAt: '2026-11-01T12:00:00Z' }]);
    await render();
    expect(host.querySelector('.coach-support-chat')?.textContent).toContain('Receptionist Lan');
    expect(host.querySelector('.coach-support-chat')?.textContent).not.toContain('Bạn (HLV)');
    await click(ticketButton(102));
    const select = host.querySelector('select')!;
    expect(select.querySelector<HTMLOptionElement>('option[value="closed"]')?.disabled).toBe(false);
    expect(select.querySelector<HTMLOptionElement>('option[value="open"]')?.disabled).toBe(true);
  });
  it('retains earlier history if a reply completes while history is loading', async () => {
    const history = deferred<coachSupportApi.SupportMessage[]>();
    vi.mocked(coachSupportApi.getSupportMessages).mockReturnValue(history.promise);
    vi.mocked(coachSupportApi.sendSupportMessage).mockResolvedValue({ id: 5, senderId: 2, senderName: 'Coach', senderRole: 'COACH', message: 'New reply', createdAt: '2026-11-01T12:00:00Z' });
    await render();
    await typeTextarea('.coach-support-input', 'New reply');
    await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await act(async () => history.resolve([{ id: 1, senderId: 5, senderName: 'Member', senderRole: 'MEMBER', message: 'Earlier history', createdAt: '2026-11-01T10:00:00Z' }]));
    expect(host.querySelector('.coach-support-chat')?.textContent).toContain('Earlier history');
    expect(host.querySelector('.coach-support-chat')?.textContent).toContain('New reply');
  });
});
