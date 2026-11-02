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

  async function setDate(value: string) {
    const input = host.querySelector('#appointment-date') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
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

  it('offers only counter payment and invents no bank details or payment gateway', async () => {
    await renderCheckout('/member/packages/checkout?packageId=1');

    expect(host.textContent).toContain('Thanh toán tại quầy lễ tân');
    expect(host.textContent).not.toContain('VietQR');
    expect(host.textContent).not.toContain('999988886666');
    expect(host.textContent).not.toContain('VAT');
    expect(host.querySelector('img')).toBeNull();
  });

  it('creates the request only when the page is opened without one, and shows its real number', async () => {
    await renderCheckout('/member/packages/checkout?packageId=1');

    const slot14 = Array.from(host.querySelectorAll('.time-slot-btn')).find(
      (btn) => btn.textContent?.trim() === '14:00'
    ) as HTMLButtonElement;
    await act(async () => {
      slot14.click();
    });
    expect(slot14.classList.contains('is-active')).toBe(true);
    // A date far in the future is never "in the past", whatever time is picked.
    await setDate('2099-01-02');
    await submitForm();

    expect(membershipApi.createMembershipSubscription).toHaveBeenCalledExactlyOnceWith(1);
    expect(host.textContent).toContain('Đã ghi lịch dự kiến tới quầy');
    expect(host.textContent).toContain('Đơn #101');
    expect(host.textContent).toContain('14:00 ngày 02/01/2099');
    expect(host.textContent).not.toContain('VOUCHER');
    expect(host.textContent).toContain('không được gửi cho lễ tân');
  });

  it('reuses an existing request and charges the quoted upgrade amount, not the list price', async () => {
    await renderCheckout('/member/packages/checkout?packageId=2&subscriptionId=55');

    expect(membershipApi.getMembershipHistory).toHaveBeenCalled();
    expect(host.querySelector('.order-breakdown-row.total')?.textContent).toContain('1.150.000');

    await setDate('2099-01-02');
    await submitForm();

    expect(membershipApi.createMembershipSubscription).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Đơn #55');
    expect(host.textContent).toContain('1.150.000');
  });

  it('rejects a time that has already passed instead of recording it', async () => {
    await renderCheckout('/member/packages/checkout?packageId=1');

    await setDate('2000-01-01');
    await submitForm();

    expect(membershipApi.createMembershipSubscription).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain('Đã ghi lịch dự kiến');
  });

  it('shows the error and does not claim success when the request cannot be created', async () => {
    vi.mocked(membershipApi.createMembershipSubscription).mockRejectedValue(new Error('Bạn đã có gói tập đang hoạt động'));
    await renderCheckout('/member/packages/checkout?packageId=1');

    await setDate('2099-01-02');
    await submitForm();

    expect(host.textContent).not.toContain('Đã ghi lịch dự kiến');
    expect(host.textContent).toContain('Tóm tắt đơn hàng');
  });

  it('displays error state when packageId is invalid', async () => {
    await renderCheckout('/member/packages/checkout?packageId=999');

    expect(host.textContent).toContain('Không tìm thấy thông tin gói tập #999.');
    const backLink = host.querySelector('a.btn-primary') as HTMLAnchorElement;
    expect(backLink).not.toBeNull();
    expect(backLink.getAttribute('href')).toBe('/member/packages');
  });
});
