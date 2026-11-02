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
    expect(coachSupportApi.getCoachSupportTickets).toHaveBeenCalledWith('RESOLVED');
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
});
