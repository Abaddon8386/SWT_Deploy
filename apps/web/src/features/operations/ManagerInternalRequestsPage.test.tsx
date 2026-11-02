import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagerInternalRequestsPage } from './ManagerInternalRequestsPage';
import * as staffRequestApi from './staffRequestApi';

vi.mock('./staffRequestApi', () => ({
  getAllStaffRequests: vi.fn(),
  reviewStaffRequest: vi.fn(),
}));

describe('ManagerInternalRequestsPage (Phê duyệt đơn từ nội bộ)', () => {
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
      userId: 11,
      userFullName: 'Nguyễn Minh Quân',
      userEmail: 'quan.nguyen@solfitness.vn',
      userRole: 'COACH',
      requestType: 'SHIFT_EXCHANGE',
      title: 'Đổi ca trực',
      reason: 'Đổi sang ca chiều',
      startDate: '2026-11-08',
      endDate: null,
      targetShift: 'Ca sáng',
      replacementUserId: null,
      replacementUserFullName: null,
      status: 'APPROVED',
      managerNotes: 'Đồng ý',
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

    vi.mocked(staffRequestApi.getAllStaffRequests).mockResolvedValue(mockRequests);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  async function render() {
    await act(async () => {
      root.render(<ManagerInternalRequestsPage />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }

  it('renders manager review page with pending requests and approve/reject actions', async () => {
    await render();

    expect(host.textContent).toContain('Phê Duyệt Đơn Từ Nội Bộ');
    expect(host.textContent).toContain('Huỳnh Đắc Tài');
    expect(host.textContent).toContain('Xin nghỉ phép cá nhân');
    expect(host.textContent).toContain('Phê duyệt đơn');
    expect(host.textContent).toContain('Từ chối đơn');
  });

  it('opens approve modal and confirms approval', async () => {
    await render();

    const approveBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Phê duyệt đơn')
    );
    expect(approveBtn).not.toBeUndefined();

    await act(async () => {
      approveBtn?.click();
    });

    expect(host.textContent).toContain('Phê Duyệt Đơn: Xin nghỉ phép cá nhân');

    vi.mocked(staffRequestApi.reviewStaffRequest).mockResolvedValue({
      ...mockRequests[0],
      status: 'APPROVED',
      managerNotes: 'Đã xem xét và chấp thuận.',
    });

    const confirmBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Xác nhận Phê duyệt')
    );
    expect(confirmBtn).not.toBeUndefined();

    await act(async () => {
      confirmBtn?.click();
    });

    expect(staffRequestApi.reviewStaffRequest).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        status: 'APPROVED',
      })
    );
  });

  it('opens reject modal and requires reason', async () => {
    await render();

    const rejectBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Từ chối đơn')
    );
    expect(rejectBtn).not.toBeUndefined();

    await act(async () => {
      rejectBtn?.click();
    });

    expect(host.textContent).toContain('Từ Chối Đơn: Xin nghỉ phép cá nhân');

    const confirmRejectBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Xác nhận Từ chối')
    );

    // Empty reason triggers error
    await act(async () => {
      confirmRejectBtn?.click();
    });

    expect(host.textContent).toContain('Vui lòng nhập lý do từ chối đơn');
  });
});

