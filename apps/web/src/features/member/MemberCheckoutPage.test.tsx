import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MemberCheckoutPage } from './MemberCheckoutPage';
import * as membershipApi from './membershipApi';
import * as profileApi from './profileApi';
import * as client from '../../shared/api/client';

// Mock các API calls
vi.mock('./membershipApi', () => ({
  getMembershipPackages: vi.fn(),
  createMembershipSubscription: vi.fn(),
}));

vi.mock('./profileApi', () => ({
  getProfile: vi.fn(),
}));

vi.mock('../../shared/api/client', () => ({
  apiFetch: vi.fn(),
}));

// Mock qrcode module
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockQrCodeDataUrl'),
  },
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

  const mockProfile: profileApi.Profile = {
    userId: 10,
    fullName: 'Hoàng Minh Thắng',
    email: 'thang.hoang@example.com',
    phone: '0912345678',
    gender: 'male',
    dob: '1995-05-10',
    avatarUrl: null,
    address: 'Hà Nội',
    membershipCode: 'MB-10',
    healthNotes: null,
    fitnessGoal: 'Tăng cơ',
    fitnessLevel: 'intermediate',
    emergencyContactName: null,
    emergencyContactPhone: null,
  };

  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    vi.mocked(membershipApi.getMembershipPackages).mockResolvedValue(mockPackages);
    vi.mocked(profileApi.getProfile).mockResolvedValue(mockProfile);
    vi.mocked(membershipApi.createMembershipSubscription).mockResolvedValue({
      id: 101,
      memberId: 10,
      packageId: 1,
      packageName: 'Gói Tiêu Chuẩn 1 Tháng',
      previousSubscriptionId: null,
      startDate: '2026-11-05',
      endDate: '2026-12-05',
      status: 'pending_payment',
      qrCode: null,
      createdAt: '2026-11-03T00:00:00Z',
    });
    vi.mocked(client.apiFetch).mockResolvedValue({ success: true, data: {} });
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
    // Chờ các Promise hoàn thành
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

  it('allows member to pick an appointment time for counter payment and submits voucher', async () => {
    await renderCheckout('/member/packages/checkout?packageId=1');

    expect(host.textContent).toContain('Thanh toán tại quầy lễ tân');

    // Tìm nút giờ 14:00 và click
    const slot14 = Array.from(host.querySelectorAll('.time-slot-btn')).find(
      (btn) => btn.textContent?.trim() === '14:00'
    ) as HTMLButtonElement;
    expect(slot14).not.toBeNull();

    await act(async () => {
      slot14.click();
    });
    expect(slot14.classList.contains('is-active')).toBe(true);

    // Điền ghi chú
    const notesArea = host.querySelector('#appointment-notes') as HTMLTextAreaElement;
    expect(notesArea).not.toBeNull();
    await act(async () => {
      notesArea.value = 'Cần xuất hóa đơn';
      notesArea.dispatchEvent(new Event('input', { bubbles: true }));
      notesArea.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Submit form đặt lịch
    const submitBtn = host.querySelector('form button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn).not.toBeNull();
    await act(async () => {
      submitBtn.click();
    });

    // Chờ hoàn tất
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(host.textContent).toContain('Đặt lịch hẹn tiếp đón tại quầy thành công!');
    expect(host.textContent).toContain('Sảnh Lễ tân chính');
    expect(host.textContent).toContain('SOL-VOUCHER-');
    expect(host.textContent).toContain('Xem Lịch sử Hóa đơn');
  });

  it('allows member to switch to Online VietQR method and confirms payment', async () => {
    await renderCheckout('/member/packages/checkout?packageId=1');

    // Chuyển sang phương thức VietQR
    const cards = host.querySelectorAll('.payment-method-card');
    const qrCard = cards[1] as HTMLElement;
    expect(qrCard).not.toBeNull();

    await act(async () => {
      qrCard.click();
    });

    // Chờ tạo QR và render
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    expect(host.textContent).toContain('MBBank (Quân Đội)');
    expect(host.textContent).toContain('999988886666');
    expect(host.textContent).toContain('SOL FITNESS VIETNAM');

    const qrImg = host.querySelector('img[alt="Mã VietQR thanh toán"]') as HTMLImageElement;
    expect(qrImg).not.toBeNull();

    // Nhấn nút "Tôi Đã Hoàn Tất Chuyển Khoản"
    const confirmBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Tôi Đã Hoàn Tất Chuyển Khoản')
    ) as HTMLButtonElement;
    expect(confirmBtn).not.toBeNull();

    await act(async () => {
      confirmBtn.click();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(host.textContent).toContain('Xác nhận chuyển khoản thành công!');
    expect(host.textContent).toContain('Xem Thẻ Hội Viên');
  });

  it('displays error state when packageId is invalid', async () => {
    await renderCheckout('/member/packages/checkout?packageId=999');

    expect(host.textContent).toContain('Không tìm thấy thông tin gói tập #999.');
    const backLink = host.querySelector('a.btn-primary') as HTMLAnchorElement;
    expect(backLink).not.toBeNull();
    expect(backLink.getAttribute('href')).toBe('/member/packages');
  });
});
