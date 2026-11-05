import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MemberCheckoutPage } from './MemberCheckoutPage';
import * as membershipApi from './membershipApi';
import * as walletApi from '../wallet/walletApi';

vi.mock('./membershipApi', () => ({
  getMembershipPackages: vi.fn(),
  getMembershipHistory: vi.fn(),
  createMembershipSubscription: vi.fn(),
}));

vi.mock('../wallet/walletApi', () => ({
  payWithWallet: vi.fn(),
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
    vi.mocked(walletApi.payWithWallet).mockResolvedValue({ balance: 500000, updatedAt: '2026-11-05T10:00:00', transactions: [] });
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

  it('shows VNPay and Wallet payment buttons, removes cash receipt upload and top-up buttons, and displays receptionist cash note', async () => {
    await renderCheckout('/member/packages/checkout?packageId=1');

    expect(host.querySelector('#receipt-image')).toBeNull();
    expect(host.textContent).toContain('Thanh toán VNPay Sandbox');
    expect(host.textContent).toContain('Thanh toán bằng Ví SÖL');
    expect(host.textContent).not.toContain('Nạp thêm tiền');
    expect(host.textContent).toContain('Lưu ý: Nếu bạn muốn thanh toán bằng tiền mặt, vui lòng gặp trực tiếp Lễ tân tại quầy');
  });

  it('creates the subscription request when opened without one and pays with Wallet', async () => {
    vi.mocked(membershipApi.getMembershipHistory).mockResolvedValue([]);
    await renderCheckout('/member/packages/checkout?packageId=1');

    const walletBtn = host.querySelector('[data-testid="pay-with-wallet-btn"]') as HTMLButtonElement;
    expect(walletBtn).not.toBeNull();
    await act(async () => {
      walletBtn.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(membershipApi.createMembershipSubscription).toHaveBeenCalledExactlyOnceWith(1);
    expect(walletApi.payWithWallet).toHaveBeenCalledExactlyOnceWith({ subscriptionId: 101 });
  });

  it('reuses an existing request and displays the quoted upgrade amount, not the list price', async () => {
    await renderCheckout('/member/packages/checkout?packageId=2&subscriptionId=55');

    expect(host.querySelector('.order-breakdown-row.total')?.textContent).toContain('1.150.000');

    const walletBtn = host.querySelector('[data-testid="pay-with-wallet-btn"]') as HTMLButtonElement;
    await act(async () => {
      walletBtn.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(membershipApi.createMembershipSubscription).not.toHaveBeenCalled();
    expect(walletApi.payWithWallet).toHaveBeenCalledExactlyOnceWith({ subscriptionId: 55 });
  });

  it('charges the price fixed on a pending renewal after the package was repriced', async () => {
    vi.mocked(membershipApi.getMembershipHistory).mockResolvedValue([
      {
        ...pendingUpgrade,
        id: 56,
        packageId: 1,
        packageName: 'Gói Tiêu Chuẩn 1 Tháng',
        upgradeCharge: null,
        quotedPrice: 600000,
      },
    ]);
    await renderCheckout('/member/packages/checkout?packageId=1&subscriptionId=56');

    expect(host.querySelector('.order-breakdown-row.total')?.textContent).toContain('600.000');
    expect(host.querySelector('.order-breakdown-row.total')?.textContent).not.toContain('650.000');
  });

  it('displays error state when packageId is invalid', async () => {
    await renderCheckout('/member/packages/checkout?packageId=999');

    expect(host.textContent).toContain('Không tìm thấy thông tin gói tập #999.');
    const backLink = host.querySelector('a.btn-primary') as HTMLAnchorElement;
    expect(backLink).not.toBeNull();
    expect(backLink.getAttribute('href')).toBe('/member/packages');
  });
});
