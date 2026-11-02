import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffInternalRequestsPage } from './StaffInternalRequestsPage';
import * as staffRequestApi from './staffRequestApi';

vi.mock('./staffRequestApi', () => ({
  getMyStaffRequests: vi.fn(),
  createStaffRequest: vi.fn(),
  cancelStaffRequest: vi.fn(),
}));

describe('StaffInternalRequestsPage (Hệ thống Đơn từ nội bộ)', () => {
  let host: HTMLDivElement;
  let root: Root;

  const mockRequests: staffRequestApi.StaffInternalRequestDto[] = [
    {
      id: 1,
      userId: 10,
      userFullName: 'Huỳnh Đắc Tài',
      userEmail: 'tai.huynh@solfitness.vn',
      userRole: 'COACH',
      requestType: 'LEAVE',
      title: 'Xin nghỉ phép cá nhân',
      reason: 'Bận việc gia đình 2 ngày',
      startDate: '2026-11-05',
      endDate: '2026-11-06',
      targetShift: null,
      replacementUserId: null,
      replacementUserFullName: null,
      status: 'PENDING',
      managerNotes: null,
      reviewedByUserId: null,
      reviewedByName: null,
      reviewedAt: null,
      createdAt: '2026-10-31T08:00:00',
      updatedAt: null,
    },
    {
      id: 2,
      userId: 10,
      userFullName: 'Huỳnh Đắc Tài',
      userEmail: 'tai.huynh@solfitness.vn',
      userRole: 'COACH',
      requestType: 'SHIFT_EXCHANGE',
      title: 'Xin đổi ca trực sáng',
      reason: 'Cần đổi ca sáng sang ca chiều để đi khám sức khỏe',
      startDate: '2026-11-08',
      endDate: null,
      targetShift: 'Ca sáng (06:00 - 14:00)',
      replacementUserId: null,
      replacementUserFullName: null,
      status: 'APPROVED',
      managerNotes: 'Đã duyệt và sắp xếp người trực thay.',
      reviewedByUserId: 1,
      reviewedByName: 'Trần Quản Lý',
      reviewedAt: '2026-10-31T09:30:00',
      createdAt: '2026-10-30T14:00:00',
      updatedAt: '2026-10-31T09:30:00',
    },
  ];

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    vi.mocked(staffRequestApi.getMyStaffRequests).mockResolvedValue(mockRequests);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  async function render() {
    await act(async () => {
      root.render(<StaffInternalRequestsPage />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }

  it('renders staff internal requests list with status badges and create button', async () => {
    await render();

    expect(host.textContent).toContain('Đơn Từ & Đề Xuất Nội Bộ');
    expect(host.textContent).toContain('Tạo đơn từ mới');
    expect(host.textContent).toContain('Xin nghỉ phép cá nhân');
    expect(host.textContent).toContain('Xin đổi ca trực sáng');
    expect(host.textContent).toContain('Chờ duyệt');
    expect(host.textContent).toContain('Đã duyệt');
    expect(host.textContent).toContain('Đã duyệt và sắp xếp người trực thay.');
  });

  it('opens create modal, validates required fields, and submits new request', async () => {
    await render();

    const createBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Tạo đơn từ mới')
    );
    expect(createBtn).not.toBeUndefined();

    await act(async () => {
      createBtn?.click();
    });

    expect(host.textContent).toContain('Tạo Đơn Từ & Đề Xuất Mới');

    vi.mocked(staffRequestApi.createStaffRequest).mockResolvedValue({
      ...mockRequests[0],
      id: 3,
      title: 'Xin đổi lịch dạy thứ 7',
      requestType: 'SCHEDULE_CHANGE',
    });

    const submitBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Gửi đơn tới Quản Lý')
    );

    // Click without filling fields -> triggers validation error
    await act(async () => {
      submitBtn?.click();
    });
    expect(host.textContent).toContain('Vui lòng nhập tiêu đề đơn.');
  });
});

