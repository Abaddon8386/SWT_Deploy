import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MemberCheckoutPage } from './MemberCheckoutPage';
import * as membershipApi from './membershipApi';

vi.mock('./membershipApi', () => ({
  getMembershipPackages: vi.fn(),
  getMembershipHistory: vi.fn(),
  createMembershipSubscription: vi.fn(),
  createCashReceiptPayment: vi.fn(),
}));
vi.mock('../../shared/lib/receiptImage', () => ({
  readReceiptImage: vi.fn(async () => 'data:image/jpeg;base64,AAAA'),
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

  async function submitForm() {
    const submitBtn = host.querySelector('form button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn).not.toBeNull();
    await act(async () => {
      submitBtn.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }

  async function attachReceipt() {
    const input = host.querySelector('#receipt-image') as HTMLInputElement;
    expect(input).not.toBeNull();
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'bill.jpg', { type: 'image/jpeg' })], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
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

  it('has no counter appointment picker and asks for a receipt photo for cash payment', async () => {
    await renderCheckout('/member/packages/checkout?packageId=1');

    expect(host.querySelector('#appointment-date')).toBeNull();
    expect(host.querySelector('.time-slot-btn')).toBeNull();
    expect(host.textContent).not.toContain('tới quầy');
    expect(host.querySelector('#receipt-image')).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>('form button[type="submit"]')!.disabled).toBe(true);
  });

  it('creates the request only when the page is opened without one, then sends the receipt', async () => {
    vi.mocked(membershipApi.getMembershipHistory).mockResolvedValue([{ ...pendingUpgrade, id: 101, packageId: 1 }]);
    await renderCheckout('/member/packages/checkout?packageId=1');

    await attachReceipt();
    await submitForm();

    expect(membershipApi.createMembershipSubscription).toHaveBeenCalledExactlyOnceWith(1);
    expect(membershipApi.createCashReceiptPayment).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 101 }), 650000, 'data:image/jpeg;base64,AAAA');
    expect(host.textContent).toContain('Đã gửi ảnh hóa đơn');
    expect(host.textContent).toContain('Đơn #101');
  });

  it('reuses an existing request and charges the quoted upgrade amount, not the list price', async () => {
    await renderCheckout('/member/packages/checkout?packageId=2&subscriptionId=55');

    expect(host.querySelector('.order-breakdown-row.total')?.textContent).toContain('1.150.000');

    await attachReceipt();
    await submitForm();

    expect(membershipApi.createMembershipSubscription).not.toHaveBeenCalled();
    expect(membershipApi.createCashReceiptPayment).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 55 }), 1150000, 'data:image/jpeg;base64,AAAA');
    expect(host.textContent).toContain('Đơn #55');
  });

  it('charges the price fixed on a pending renewal after the package was repriced', async () => {
    // Requested at 600,000; the catalog now lists the package at 650,000.
    vi.mocked(membershipApi.getMembershipHistory).mockResolvedValue([{
      ...pendingUpgrade, id: 56, packageId: 1, packageName: 'Gói Tiêu Chuẩn 1 Tháng',
      upgradeCharge: null, quotedPrice: 600000,
    }]);
    await renderCheckout('/member/packages/checkout?packageId=1&subscriptionId=56');

    expect(host.querySelector('.order-breakdown-row.total')?.textContent).toContain('600.000');
    expect(host.querySelector('.order-breakdown-row.total')?.textContent).not.toContain('650.000');
  });

  it('shows the error and does not claim success when the receipt cannot be sent', async () => {
    vi.mocked(membershipApi.createCashReceiptPayment).mockRejectedValue(new Error('Đã có thanh toán cho yêu cầu này'));
    await renderCheckout('/member/packages/checkout?packageId=2&subscriptionId=55');

    await attachReceipt();
    await submitForm();

    expect(host.textContent).not.toContain('Đã gửi ảnh hóa đơn');
    expect(host.textContent).toContain('Đã có thanh toán cho yêu cầu này');
  });

  it('displays error state when packageId is invalid', async () => {
    await renderCheckout('/member/packages/checkout?packageId=999');

    expect(host.textContent).toContain('Không tìm thấy thông tin gói tập #999.');
    const backLink = host.querySelector('a.btn-primary') as HTMLAnchorElement;
    expect(backLink).not.toBeNull();
    expect(backLink.getAttribute('href')).toBe('/member/packages');
  });
});
