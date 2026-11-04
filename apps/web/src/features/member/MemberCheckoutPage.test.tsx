import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MemberCheckoutPage } from './MemberCheckoutPage';
import * as membershipApi from './membershipApi';
import * as vnpayApi from '../payments/vnpayApi';

vi.mock('./membershipApi', () => ({
  getMembershipPackages: vi.fn(),
  getMembershipHistory: vi.fn(),
  createMembershipSubscription: vi.fn(),
}));
vi.mock('../payments/vnpayApi', () => ({
  createVnpayCheckout: vi.fn(),
  navigateToVnpay: vi.fn(),
}));

describe('MemberCheckoutPage Component', () => {
  const mockPackages: membershipApi.MembershipPackage[] = [
    {
      id: 1,
      name: 'Gói Tiêu Chuẩn 1 Tháng',
      description: 'Sử dụng phòng tập và lớp nhóm cơ bản.',
      price: 650000,
      durationDays: 30,
      classCreditLimit: 12,
      status: 'active',
    },
    {
      id: 2,
      name: 'Gói Cao Cấp 3 Tháng',
      description: 'Không giới hạn phòng tập và huấn luyện viên.',
      price: 1800000,
      durationDays: 90,
      classCreditLimit: 36,
      status: 'active',
    },
  ];

  const pendingUpgrade: membershipApi.MemberSubscription = {
    id: 55,
    memberId: 10,
    packageId: 2,
    packageName: 'Gói Cao Cấp 3 Tháng',
    previousSubscriptionId: 40,
    startDate: '2026-11-05',
    endDate: '2027-02-02',
    status: 'pending_payment',
    qrCode: null,
    createdAt: '2026-11-03T00:00:00',
    upgradeCharge: 1150000,
  };

  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    vi.mocked(membershipApi.getMembershipPackages).mockResolvedValue(mockPackages);
    vi.mocked(membershipApi.getMembershipHistory).mockResolvedValue([pendingUpgrade]);
    vi.mocked(membershipApi.createMembershipSubscription).mockResolvedValue({
      ...pendingUpgrade,
      id: 101,
      packageId: 1,
      packageName: 'Gói Tiêu Chuẩn 1 Tháng',
      previousSubscriptionId: null,
      upgradeCharge: null,
    });
    vi.mocked(vnpayApi.createVnpayCheckout).mockResolvedValue({
      reference: 'VNPAY_123',
      amount: 650000,
      expiresAt: '2026-11-05T00:00:00',
      paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?token=123',
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  async function renderCheckout(initialEntry = '/member/packages/checkout?packageId=1') {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[initialEntry]}>
          <MemberCheckoutPage />
        </MemoryRouter>
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }

  it('renders order summary and package details correctly', async () => {
    await renderCheckout('/member/packages/checkout?packageId=1');

    expect(host.textContent).toContain('Tóm tắt đơn hàng');
    expect(host.textContent).toContain('Gói Tiêu Chuẩn 1 Tháng');
    expect(host.textContent).toContain('30 ngày tập');
    expect(host.textContent).toContain('Tối đa 12 buổi');
    expect(host.textContent).toContain('650.000');
  });

  it('does not render cash payment or receipt photo upload', async () => {
    await renderCheckout('/member/packages/checkout?packageId=1');

    expect(host.querySelector('#receipt-image')).toBeNull();
    expect(host.textContent).not.toContain('Thanh toán tiền mặt');
    expect(host.textContent).not.toContain('gửi ảnh hóa đơn');
    expect(host.textContent).toContain('VNPay Sandbox');
  });

  it('prepares and triggers VNPay payment when VNPay button is clicked', async () => {
    vi.mocked(membershipApi.getMembershipHistory).mockResolvedValue([]);
    await renderCheckout('/member/packages/checkout?packageId=1');

    const vnpayBtn = host.querySelector('button.btn-primary') as HTMLButtonElement;
    expect(vnpayBtn).not.toBeNull();
    expect(vnpayBtn.textContent).toContain('Thanh toán VNPay Sandbox');

    await act(async () => {
      vnpayBtn.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(membershipApi.createMembershipSubscription).toHaveBeenCalledExactlyOnceWith(1);
    expect(vnpayApi.createVnpayCheckout).toHaveBeenCalledWith({ subscriptionId: 101 });
    expect(vnpayApi.navigateToVnpay).toHaveBeenCalledWith(
      'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?token=123'
    );
  });

  it('reuses an existing request and charges the quoted upgrade amount, not the list price', async () => {
    await renderCheckout('/member/packages/checkout?packageId=2&subscriptionId=55');

    expect(host.querySelector('.order-breakdown-row.total')?.textContent).toContain('1.150.000');

    const vnpayBtn = host.querySelector('button.btn-primary') as HTMLButtonElement;
    await act(async () => {
      vnpayBtn.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(membershipApi.createMembershipSubscription).not.toHaveBeenCalled();
    expect(vnpayApi.createVnpayCheckout).toHaveBeenCalledWith({ subscriptionId: 55 });
  });

  it('displays error state when packageId is invalid', async () => {
    await renderCheckout('/member/packages/checkout?packageId=999');

    expect(host.textContent).toContain('Không tìm thấy thông tin gói tập #999.');
  });
});
