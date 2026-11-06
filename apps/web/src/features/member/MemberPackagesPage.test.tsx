import { setLanguage } from '../../shared/i18n';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberPackagesPage } from './MemberPackagesPage';
import type { MemberSubscription } from './membershipApi';
import { clearNotices, getNotices } from '../../shared/lib/portalNotices';
import { formatPrice } from '../../shared/lib/membershipPresentation';

const noticeText = () => getNotices().map((notice) => notice.message).join(' ');

const trialApiMock = vi.hoisted(() => ({
  getStatus: vi.fn(),
  claim: vi.fn(),
}));
vi.mock('./trialApi', () => ({
  trialApi: trialApiMock,
}));

const realtime = vi.hoisted(() => ({ subscribe: vi.fn(), changed: () => {}, cleanup: vi.fn() }));
vi.mock('./membershipRealtime', () => ({ subscribeMembershipChanges: realtime.subscribe }));

const api = vi.hoisted(() => ({
  packages: vi.fn(), current: vi.fn(), history: vi.fn(), payments: vi.fn(),
  create: vi.fn(), renew: vi.fn(), upgrade: vi.fn(), requestHold: vi.fn(), cancelPending: vi.fn(), createPayment: vi.fn(),
  cancellations: vi.fn(), requestCancellation: vi.fn(), resume: vi.fn(),
}));
vi.mock('./membershipApi', () => ({
  getMembershipPackages: api.packages,
  getCurrentMembership: api.current,
  getMembershipHistory: api.history,
  getMyPayments: api.payments,
  getMyMembershipCancellations: api.cancellations,
  requestMembershipCancellation: api.requestCancellation,
  createMembershipSubscription: api.create,
  renewMembershipSubscription: api.renew,
  upgradeMembershipSubscription: api.upgrade,
  requestMembershipHold: api.requestHold,
  resumeMembershipSubscription: api.resume,
  cancelPendingMembershipSubscription: api.cancelPending,
  createPaymentRequest: api.createPayment,
}));

const membershipPackage = {
  id: 5, name: 'Essential', description: null, price: 500000,
  durationDays: 30, classCreditLimit: null, status: 'active',
};
const higherPackage = {
  id: 6, name: 'VIP Sanctuary', description: null, price: 1500000,
  durationDays: 30, classCreditLimit: null, status: 'active',
};
const lowerPackage = {
  id: 4, name: 'Starter', description: null, price: 250000,
  durationDays: 15, classCreditLimit: 4, status: 'active',
};
const pending = {
  id: 12, memberId: 34, packageId: 5, packageName: 'Essential',
  previousSubscriptionId: null, startDate: '2026-10-16', endDate: '2026-11-16',
  status: 'pending_payment', qrCode: null, createdAt: '2026-10-16T10:00:00',
};
const payment = {
  id: 90, memberId: 34, memberName: null, subscriptionId: 12,
  classEnrollmentId: null, amount: 500000, method: 'bank_transfer',
  status: 'pending', paidAt: null, receivedById: null, receivedByName: null,
  note: null, createdAt: '2026-10-16T10:01:00', invoiceNumber: null,
};

describe('SCRUM-86 packages', () => {
  let host: HTMLDivElement;
  let root: Root;

  it('shows package data without inventing VIP facilities or PT benefits', async () => {
    api.packages.mockResolvedValue([{ ...higherPackage, description: 'Lớp nhóm và phòng tập.' }]);
    await render();
    expect(host.textContent).toContain('Lớp nhóm và phòng tập.');
    expect(host.textContent).not.toMatch(/Hồ bơi|Sauna|khăn tập|1-kèm-1|Gói Đặc Quyền VIP/);
  });

  beforeEach(() => {
  setLanguage('vi');
    clearNotices();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    Object.values(api).forEach((mock) => mock.mockReset());
    realtime.subscribe.mockImplementation((changed: () => void) => { realtime.changed = changed; return realtime.cleanup; });
    realtime.cleanup.mockClear();
    trialApiMock.getStatus.mockResolvedValue({ eligible: true, alreadyClaimed: false, days: 3, tier: 'GOLD' });
    trialApiMock.claim.mockResolvedValue({ id: 1, memberId: 1, cccd: '001200001234', fullName: 'Nguyen Van A', grantedDays: 3, tier: 'GOLD', claimedAt: '2026-10-16T10:00:00' });
    api.packages.mockResolvedValue([membershipPackage]);
    api.current.mockResolvedValue(null);
    api.history.mockResolvedValue([]);
    api.payments.mockResolvedValue([]);
    api.cancellations.mockResolvedValue([]);
    api.create.mockResolvedValue(pending);
    api.createPayment.mockResolvedValue(payment);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    setLanguage('vi');
    host.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function render() {
    await act(async () => root.render(<MemoryRouter><MemberPackagesPage /></MemoryRouter>));
  }

  function button(label: string) {
    return [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
  }

  const active = { ...pending, id: 1, status: 'active', endDate: '2099-11-17' };
  it('renders the requested prices and durations only when returned by the catalog API', async () => {
    api.packages.mockResolvedValue([
      { ...membershipPackage, price: 299000, durationDays: 30, classCreditLimit: 2 },
      { ...higherPackage, price: 499000, durationDays: 30, classCreditLimit: 4 },
      { ...lowerPackage, price: 999000, durationDays: 90, classCreditLimit: 6 },
    ]);
    await render();
    for (const value of ['299.000', '499.000', '30 ngày']) {
      expect(host.textContent).toContain(value);
    }
    expect(host.textContent).not.toContain('999.000');
    await act(async () => button('Đồng hành dài hạn')?.click());
    for (const value of ['999.000', '90 ngày']) {
      expect(host.textContent).toContain(value);
    }
    expect(host.textContent).not.toContain('299.000');
  });

  it('keeps payment confirmation separate from activation', async () => {
    api.history.mockResolvedValue([pending]);
    await render();
    api.payments.mockResolvedValue([{ ...payment, status: 'success' }]);
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Đã thanh toán, đang chờ kích hoạt.');
    expect(host.textContent).not.toContain('Gói đã kích hoạt.');
  });

  it('ignores an older background snapshot when a newer purchase has completed', async () => {
    await render();
    let resolveHistory!: (value: MemberSubscription[]) => void;
    api.history.mockImplementationOnce(() => new Promise<MemberSubscription[]>(resolve => { resolveHistory = resolve; }));
    await act(async () => window.dispatchEvent(new Event('online')));
    api.history.mockResolvedValue([pending]);
    await act(async () => button('Đăng ký lần đầu')?.click());
    await act(async () => resolveHistory([]));
    expect(button('Đang chờ xác nhận')?.disabled).toBe(false);
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it('replays a Realtime invalidation interrupted by a foreground status read', async () => {
    api.history.mockResolvedValue([pending]);
    await render();
    let resolveOld!: (value: MemberSubscription[]) => void;
    api.history.mockImplementationOnce(() => new Promise<MemberSubscription[]>(resolve => { resolveOld = resolve; }));
    await act(async () => realtime.changed());
    api.history.mockResolvedValue([{ ...active, id: pending.id }]);
    api.current.mockResolvedValue({ ...active, id: pending.id });
    api.payments.mockResolvedValue([{ ...payment, status: 'success' }]);
    await act(async () => button('Tải lại trạng thái')?.click());
    await act(async () => resolveOld([pending]));
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Thanh toán thành công');
  });

  it('does not overwrite a newer manual payment refresh with an older response', async () => {
    api.history.mockResolvedValue([pending]);
    api.payments.mockResolvedValue([payment]);
    await render();
    let resolveOld!: (value: typeof payment[]) => void;
    api.payments.mockImplementationOnce(() => new Promise<typeof payment[]>(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce([{ ...payment, status: 'success' }]);
    const reload = button('Tải lại trạng thái')!;
    await act(async () => { reload.click(); reload.click(); });
    expect(host.textContent).toContain('gói chưa active');
    await act(async () => resolveOld([payment]));
    expect(host.textContent).toContain('gói chưa active');
    expect(host.textContent).not.toContain('Đã gửi thông báo chuyển khoản');
  });

  it('blocks renewal and upgrade while an active package has a pending hold', async () => {
    api.packages.mockResolvedValue([membershipPackage, higherPackage]);
    const holding = { ...active, holdStatus: 'PENDING' };
    api.current.mockResolvedValue(holding);
    api.history.mockResolvedValue([holding]);
    await render();
    expect(button('Đang chờ bảo lưu')?.disabled).toBe(false);
    await act(async () => button('Đang chờ bảo lưu')?.click());
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Yêu cầu bảo lưu đang chờ xử lý');
    expect(api.renew).not.toHaveBeenCalled();
    expect(api.upgrade).not.toHaveBeenCalled();
  });
  it('refetches staff changes without F5 and announces only API-confirmed payment once', async () => {
    api.history.mockResolvedValue([pending]);
    await render();
    api.current.mockResolvedValue({ ...active, id: pending.id });
    api.history.mockResolvedValue([{ ...active, id: pending.id }]);
    api.payments.mockResolvedValue([{ ...payment, status: 'success' }]);
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(host.textContent).toContain('Thanh toán thành công');
    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(button('Gia hạn')?.disabled).toBe(false);
    await act(async () => button('Đóng')?.click());
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows a clear request success without claiming payment success', async () => {
    await render();
    await act(async () => button('Đăng ký lần đầu')?.click());
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Đã gửi yêu cầu thành công');
    expect(dialog?.textContent).toContain('Yêu cầu của bạn đang chờ xử lý.');
    expect(dialog?.textContent).not.toContain('Thanh toán thành công');
  });

  it('refreshes immediately on Supabase events and unsubscribes on unmount without polling', async () => {
    vi.useFakeTimers();
    try {
      api.history.mockResolvedValue([pending]);
      await render();
      api.current.mockResolvedValue({ ...active, id: pending.id });
      api.history.mockResolvedValue([{ ...active, id: pending.id }]);
      api.payments.mockResolvedValue([{ ...payment, status: 'success' }]);
      await act(async () => realtime.changed());
      expect(host.textContent).toContain('Thanh toán thành công');
      const reads = api.current.mock.calls.length;
      await act(async () => vi.advanceTimersByTimeAsync(30000));
      expect(api.current).toHaveBeenCalledTimes(reads);
      await act(async () => root.unmount());
      expect(realtime.cleanup).toHaveBeenCalled();
      root = createRoot(host);
    } finally { vi.useRealTimers(); }
  });

  it('blocks purchases when background synchronization fails and recovers online', async () => {
    await render();
    api.history.mockRejectedValueOnce(new Error('offline'));
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(host.textContent).not.toContain('Không thể đồng bộ trạng thái mới nhất');
    expect(getNotices().find((notice) => notice.key === 'packages-sync')).toMatchObject({ type: 'error', action: { label: 'Thử đồng bộ lại' } });
    expect(button('Đăng ký lần đầu')?.disabled).toBe(false);
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(getNotices().some((notice) => notice.key === 'packages-sync')).toBe(false);
    expect(button('Đăng ký lần đầu')?.disabled).toBe(false);
  });
  it('shows the same paid-through expiry as the member card and dashboard', async () => {
    api.current.mockResolvedValue({ ...active, paidThroughDate: '2100-03-01' });
    api.history.mockResolvedValue([active]);
    await render();
    expect(host.textContent).toContain('đến 01/03/2100');
  });
  it('resumes a frozen subscription without creating a purchase or payment', async () => {
    const frozen = { ...active, status: 'frozen', holdStatus: 'APPROVED' };
    api.history.mockResolvedValue([frozen]);
    api.resume.mockResolvedValue(active);
    await render();
    expect(button('Mở lại gói tập miễn phí')).toBeDefined();
    expect(button('Đang có gói bảo lưu')?.disabled).toBe(false);
    await act(async () => button('Mở lại gói tập miễn phí')?.click());
    expect(api.resume).toHaveBeenCalledExactlyOnceWith(1);
    expect(api.create).not.toHaveBeenCalled();
    expect(api.createPayment).not.toHaveBeenCalled();
    expect(noticeText()).toContain('Đã mở lại gói tập');
    expect(host.textContent).not.toContain('Đã mở lại gói tập');
  });
  it('keeps the frozen package and shows errors when resume fails', async () => {
    api.history.mockResolvedValue([{ ...active, status: 'frozen', holdStatus: 'APPROVED' }]);
    api.resume.mockRejectedValue(new Error('Vui lòng liên hệ lễ tân'));
    await render();
    await act(async () => {
      button('Mở lại gói tập miễn phí')?.click();
      button('Mở lại gói tập miễn phí')?.click();
    });
    expect(api.resume).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('Vui lòng liên hệ lễ tân');
    expect(button('Mở lại gói tập miễn phí')?.disabled).toBe(false);
    expect(api.create).not.toHaveBeenCalled();
  });
  const renewal = { ...pending, id: 5, previousSubscriptionId: 1, status: 'active',
    startDate: '2099-11-18', endDate: '2099-12-18' };

  it('explains a paid future period as paid rather than a pending request when blocking upgrade', async () => {
    api.packages.mockResolvedValue([membershipPackage, higherPackage]);
    api.current.mockResolvedValue(active);
    api.history.mockResolvedValue([active, renewal]);
    await render();
    expect(button('Có kỳ đã thanh toán')?.disabled).toBe(false);
    expect(button('Gia hạn')?.disabled).toBe(false);
  });

  it('allows an active subscription without a successor to renew only once', async () => {
    api.current.mockResolvedValue(active);
    api.history.mockResolvedValue([active]);
    api.renew.mockResolvedValue({ ...renewal, status: 'pending_payment' });
    await render();
    expect(button('Gia hạn')?.disabled).toBe(false);
    await act(async () => {
      button('Gia hạn')?.click();
      button('Gia hạn')?.click();
    });
    expect(api.renew).toHaveBeenCalledExactlyOnceWith(1);
    expect(api.create).not.toHaveBeenCalled();
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Gia hạn gói tập');
  });

  it('allows a third paid period without a future-periods card', async () => {
    const third = { ...renewal, id: 6, previousSubscriptionId: 5,
      startDate: '2099-12-19', endDate: '2100-01-18' };
    api.current.mockResolvedValue(active);
    api.history.mockResolvedValue([active, renewal, third]);
    api.renew.mockResolvedValue({ ...pending, id: 7, previousSubscriptionId: 6 });
    await render();
    expect(host.textContent).not.toContain('Kỳ đã thanh toán tiếp theo');
    expect(host.querySelector('.membership-periods__toggle')).toBeNull();

    expect(button('Gia hạn')?.disabled).toBe(false);
    await act(async () => button('Gia hạn')?.click());
    expect(api.renew).toHaveBeenCalledExactlyOnceWith(1);
  });
  it('allows an active subscription to upgrade to a higher package and blocks lower packages', async () => {
    const upgradePending = {
      ...pending,
      id: 18,
      packageId: 6,
      packageName: 'VIP Sanctuary',
      previousSubscriptionId: 1,
      status: 'pending_payment',
    };
    api.packages.mockResolvedValue([lowerPackage, membershipPackage, higherPackage]);
    const activeWithValue = { ...active, remainingValue: 266000 };
    api.current.mockResolvedValue(activeWithValue);
    api.history.mockResolvedValue([activeWithValue]);
    api.upgrade.mockResolvedValue({ ...upgradePending, upgradeCharge: 1234000, creditApplied: 266000 });

    await render();

    // The card previews the charge: the new price minus the unused value the backend computed from what was paid.
    const quote = host.querySelector('[data-testid="upgrade-quote"]');
    expect(quote?.textContent).toContain(`Nâng cấp: thanh toán ${formatPrice(higherPackage.price - 266000)}`);
    expect(quote?.textContent).toContain(`đã trừ ${formatPrice(266000)} giá trị còn lại`);

    expect(button('Đang có gói hoạt động')?.disabled).toBe(false);
    expect(button('Gia hạn')?.disabled).toBe(false);
    expect(button('Nâng cấp gói')?.disabled).toBe(false);

    await act(async () => {
      button('Nâng cấp gói')?.click();
    });

    expect(api.upgrade).toHaveBeenCalledExactlyOnceWith(1, 6);
    expect(api.create).not.toHaveBeenCalled();
    expect(api.renew).not.toHaveBeenCalled();
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Nâng cấp gói tập');
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('VIP Sanctuary');
    // The amount the backend quoted is shown, not the catalog price.
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Số tiền cần thanh toán để nâng cấp');
    expect(host.querySelector('[role="dialog"]')?.textContent).toMatch(/1\.234\.000/);
  });

  it('allows an active member to submit a hold request with a reason', async () => {
    const heldPending = {
      ...active,
      holdStatus: 'PENDING',
      holdReason: 'Đi công tác dài ngày tại Nhật Bản',
    };
    api.current.mockResolvedValue(active);
    api.history.mockResolvedValue([active]);
    api.requestHold.mockResolvedValue(heldPending);

    await render();

    const holdBtn = button('Bảo lưu gói tập');
    expect(holdBtn).toBeDefined();
    expect(holdBtn?.disabled).toBe(false);

    await act(async () => {
      holdBtn?.click();
    });

    const textarea = host.querySelector('#hold-reason-input') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();

    await act(async () => {
      const nativeValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      nativeValueSetter?.call(textarea, 'Đi công tác dài ngày tại Nhật Bản');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      button('Gửi yêu cầu bảo lưu')?.click();
    });

    expect(api.requestHold).toHaveBeenCalledExactlyOnceWith(1, 'Đi công tác dài ngày tại Nhật Bản');
    expect(noticeText()).toContain('Đã gửi yêu cầu bảo lưu gói tập');
    expect(button('Đang chờ duyệt bảo lưu')?.disabled).toBe(true);
  });

  it('does not offer package cancellation request for active membership', async () => {
    api.current.mockResolvedValue(active);
    api.history.mockResolvedValue([active]);
    await render();
    expect(button('Yêu cầu hủy gói')).toBeUndefined();
  });

  it('allows another renewal after a paid successor', async () => {
    api.current.mockResolvedValue(active);
    api.history.mockResolvedValue([active, renewal]);
    await render();
    expect(button('Gia hạn')?.disabled).toBe(false);
  });

  it('blocks another renewal while a successor awaits payment', async () => {
    api.current.mockResolvedValue(active);
    api.history.mockResolvedValue([active, { ...renewal, status: 'pending_payment' }]);
    await render();
    expect(button('Đang chờ xác nhận')?.disabled).toBe(false);
    expect(api.renew).not.toHaveBeenCalled();
  });
  it('warns about multiple valid successors of the same subscription', async () => {
    api.current.mockResolvedValue(active);
    api.history.mockResolvedValue([active, renewal, { ...renewal, id: 9 }, { ...renewal, id: 10 }]);
    await render();
    expect(button('Cần kiểm tra gia hạn')?.disabled).toBe(false);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => button('Cần kiểm tra gia hạn')?.click());
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('chuỗi gia hạn bất thường');
    expect(api.renew).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'expired'])('does not treat a %s child as a blocking successor', async (status) => {
    api.current.mockResolvedValue(active);
    api.history.mockResolvedValue([active, { ...renewal, status }]);
    await render();
    expect(button('Gia hạn')?.disabled).toBe(false);
  });

  it('does not confuse another subscription successor with the selected source', async () => {
    api.current.mockResolvedValue(active);
    api.history.mockResolvedValue([active, { ...renewal, previousSubscriptionId: 99, packageId: 99 }]);
    await render();
    expect(button('Gia hạn')?.disabled).toBe(false);
  });

  it('still purchases a new package when eligible', async () => {
    await render();
    expect(button('Đăng ký lần đầu')?.disabled).toBe(false);
    await act(async () => button('Đăng ký lần đầu')?.click());
    expect(api.create).toHaveBeenCalledExactlyOnceWith(5);
    expect(api.renew).not.toHaveBeenCalled();
  });

  it('blocks renewal while history loads and restores the successor state when it arrives', async () => {
    let resolveHistory!: (items: MemberSubscription[]) => void;
    api.current.mockResolvedValue(active);
    api.history.mockReturnValue(new Promise((resolve) => { resolveHistory = resolve; }));
    await render();
    expect(button('Gia hạn')?.disabled).toBe(true);
    await act(async () => button('Gia hạn')?.click());
    expect(api.renew).not.toHaveBeenCalled();
    await act(async () => resolveHistory([active, renewal]));
    expect(button('Gia hạn')?.disabled).toBe(false);
  });

  it('blocks renewal on history failure and verifies it again on retry', async () => {
    api.current.mockResolvedValue(active);
    api.history.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([active, renewal]);
    await render();
    expect(button('Gia hạn')?.disabled).toBe(false);
    expect(host.textContent).toContain('Không thể kiểm tra lịch sử gói');
    await act(async () => button('Gia hạn')?.click());
    expect(api.renew).not.toHaveBeenCalled();
    await act(async () => button('Đóng')?.click());
    await act(async () => button('Thử lại')?.click());
    expect(button('Gia hạn')?.disabled).toBe(false);
  });

  it('blocks an expired source with a valid future successor', async () => {
    api.history.mockResolvedValue([{ ...active, status: 'expired', startDate: '2019-12-01', endDate: '2020-01-01' }, renewal]);
    await render();
    expect(button('Gia hạn')?.disabled).toBe(false);
    expect(api.renew).not.toHaveBeenCalled();
  });

  it('restores renewal protection after remounting the page', async () => {
    api.current.mockResolvedValue(active);
    api.history.mockResolvedValue([active, renewal]);
    await render();
    await act(async () => root.unmount());
    root = createRoot(host);
    await render();
    expect(api.history).toHaveBeenCalledTimes(2);
    expect(button('Gia hạn')?.disabled).toBe(false);
    expect(api.renew).not.toHaveBeenCalled();
  });

  it('keeps catalog visible and blocks purchases when history fails', async () => {
    api.history.mockRejectedValue(new Error('offline'));
    await render();
    expect(host.textContent).toContain('Essential');
    expect(host.textContent).toContain('Không thể kiểm tra lịch sử gói');
    expect(button('Đăng ký gói mới')?.disabled).toBe(false);
  });

  it('keeps catalog when payment or current API fails', async () => {
    api.payments.mockRejectedValue(new Error('offline'));
    api.current.mockRejectedValue(new Error('offline'));
    await render();
    expect(host.textContent).toContain('Essential');
    expect(host.textContent).toContain('Không thể kiểm tra thanh toán');
    expect(host.textContent).toContain('Không thể kiểm tra gói hiện tại');
    expect(button('Đăng ký lần đầu')?.disabled).toBe(false);
  });

  it('shows an empty catalog', async () => {
    api.packages.mockResolvedValue([]);
    await render();
    expect(host.textContent).toContain('Chưa có gói tập khả dụng');
  });

  it('keeps current membership visible when catalog fails', async () => {
    api.packages.mockRejectedValue(new Error('offline'));
    api.current.mockResolvedValue({ ...pending, status: 'active' });
    await render();
    expect(host.textContent).toContain('Không thể tải gói tập');
    expect(host.textContent).toContain('Gói hiện tại');
  });

  it('restores a pending subscription without rendering a transfer confirmation button', async () => {
    api.history.mockResolvedValue([pending]);
    await render();
    expect(host.textContent).toContain('Yêu cầu #12');
    expect(host.textContent).toContain('Bạn có thể thanh toán bằng VNPay Sandbox hoặc tới quầy lễ tân.');
    expect(button('Tôi đã chuyển khoản')).toBeUndefined();
    expect(button('Hủy yêu cầu đăng ký')).toBeDefined();
    expect(host.querySelector('img')).toBeNull();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('allows cancelling a pending subscription request awaiting receptionist confirmation', async () => {
    const cancelledSub = { ...pending, status: 'cancelled' };
    api.history.mockResolvedValue([pending]);
    api.cancelPending.mockResolvedValue(cancelledSub);

    await render();
    expect(host.textContent).toContain('Yêu cầu #12');
    expect(button('Hủy yêu cầu đăng ký')?.disabled).toBe(false);

    await act(async () => {
      button('Hủy yêu cầu đăng ký')?.click();
    });

    expect(api.cancelPending).not.toHaveBeenCalled();
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Essential');
    api.history.mockResolvedValue([cancelledSub]);
    await act(async () => { button('Xác nhận hủy')?.click(); });

    expect(api.cancelPending).toHaveBeenCalledExactlyOnceWith(12);
    expect(noticeText()).toContain('Đã hủy yêu cầu gói tập #12');
    expect(host.textContent).not.toContain('Thanh toán gói tập • Yêu cầu #12');
  });

  it('does not create a second payment when one is pending for this subscription', async () => {
    api.history.mockResolvedValue([pending]);
    api.payments.mockResolvedValue([{ ...payment, subscriptionId: 88 }, payment]);
    await render();
    expect(noticeText()).toContain('Đã gửi thông báo chuyển khoản. Vui lòng chờ nhân viên xác nhận.');
    expect(host.textContent).not.toContain('Đã gửi thông báo chuyển khoản');
    expect(host.textContent).not.toContain('Thanh toán thành công');
    expect(button('Tôi đã chuyển khoản')).toBeUndefined();
    expect(api.createPayment).not.toHaveBeenCalled();
    expect(button('Hủy yêu cầu đăng ký')?.disabled).toBe(true);
  });

  it('does not confuse a different subscription payment with this one', async () => {
    api.history.mockResolvedValue([pending]);
    api.payments.mockResolvedValue([{ ...payment, subscriptionId: 88 }]);
    await render();
    expect(button('Tôi đã chuyển khoản')).toBeUndefined();
    expect(noticeText()).not.toContain('Đã gửi thông báo chuyển khoản');
  });

  it('shows POS payment instructions in the purchase modal without a transfer confirmation button', async () => {
    await render();
    await act(async () => button('Đăng ký lần đầu')?.click());
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Essential');
    expect(dialog?.textContent).toContain('500.000');
    expect(dialog?.textContent).toContain('#12');
    expect(dialog?.textContent).toContain('Bạn có thể thanh toán bằng VNPay Sandbox hoặc tới quầy lễ tân.');
    expect(dialog?.textContent).not.toContain('Số tài khoản');
    expect(dialog?.textContent).not.toContain('Tên người nhận');
    expect(dialog?.querySelector('img, canvas')).toBeNull();
    const confirm = [...dialog!.querySelectorAll('button')].find((item) => item.textContent?.includes('Tôi đã chuyển khoản'));
    expect(confirm).toBeUndefined();
    expect(api.createPayment).not.toHaveBeenCalled();
  });

  it('restores an activated subscription only when the backend reports it active', async () => {
    api.current.mockResolvedValue({ ...pending, status: 'active' });
    api.history.mockResolvedValue([{ ...pending, status: 'active' }]);
    api.payments.mockResolvedValue([{ ...payment, status: 'success' }]);
    await render();
    expect(host.textContent).toContain('Xem thẻ QR Check-in');
    expect(button('Tôi đã chuyển khoản')).toBeUndefined();
    expect(api.createPayment).not.toHaveBeenCalled();
  });

  it('refreshes payments without submitting a new transfer notification', async () => {
    api.history.mockResolvedValue([pending]);
    api.payments.mockResolvedValueOnce([]).mockResolvedValueOnce([payment]);
    await render();
    await act(async () => button('Tải lại trạng thái')?.click());
    expect(api.payments).toHaveBeenCalledTimes(2);
    expect(noticeText()).toContain('Đã gửi thông báo chuyển khoản');
    expect(button('Tôi đã chuyển khoản')).toBeUndefined();
    expect(api.createPayment).not.toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('keeps payment unverified when refreshing fails and recovers through Retry', async () => {
    api.history.mockResolvedValue([pending]);
    api.payments.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([payment]);
    await render();
    await act(async () => button('Tải lại trạng thái')?.click());
    expect(host.textContent).toContain('Không thể kiểm tra thanh toán');
    expect(button('Tôi đã chuyển khoản')).toBeUndefined();
    await act(async () => button('Thử lại')?.click());
    expect(noticeText()).toContain('Đã gửi thông báo chuyển khoản');
    expect(api.createPayment).not.toHaveBeenCalled();
  });

  it('never displays an active package when payment is success but membership is pending', async () => {
    api.history.mockResolvedValue([pending]);
    api.payments.mockResolvedValue([{ ...payment, status: 'success' }]);
    await render();
    expect(host.textContent).toContain('gói chưa active');
    expect(host.textContent).not.toContain('Gói hiện tại');
  });

  it('does not choose between multiple pending subscriptions', async () => {
    api.history.mockResolvedValue([pending, { ...pending, id: 13 }]);
    await render();
    expect(host.textContent).toContain('Có nhiều yêu cầu đang chờ');
    expect(button('Có yêu cầu đang chờ')?.disabled).toBe(false);
  });

  it('keeps the created subscription after closing the modal', async () => {
    api.history.mockResolvedValueOnce([]).mockResolvedValue([pending]);
    await render();
    await act(async () => button('Đăng ký lần đầu')?.click());
    expect(api.create).toHaveBeenCalledTimes(1);
    await act(async () => button('Đóng')?.click());
    expect(button('Tôi đã chuyển khoản')).toBeUndefined();
    expect(api.createPayment).not.toHaveBeenCalled();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('Yêu cầu #12');
  });

  it('shows a cancellation conflict inside one confirmation dialog', async () => {
    api.cancelPending.mockRejectedValue(new Error('Yêu cầu đã được thanh toán, không thể hủy.'));
    await render();
    await act(async () => button('Đăng ký lần đầu')?.click());
    await act(async () => button('Hủy yêu cầu đăng ký')?.click());
    await act(async () => button('Xác nhận hủy')?.click());
    const dialogs = host.querySelectorAll('[role="dialog"], dialog');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].querySelector('[role="alert"]')?.textContent).toContain('không thể hủy');
  });

  it('renews the latest expired subscription of the selected package', async () => {
    const older = { ...pending, id: 20, status: 'expired', startDate: '2019-12-01', endDate: '2020-01-01' };
    const latest = { ...pending, id: 21, status: 'expired', startDate: '2020-02-01', endDate: '2021-01-01' };
    api.history.mockResolvedValue([older, latest]);
    api.renew.mockResolvedValue({ ...pending, previousSubscriptionId: 21 });
    await render();
    expect(button('Gia hạn')?.disabled).toBe(false);
    await act(async () => button('Gia hạn')?.click());
    expect(api.renew).toHaveBeenCalledWith(21);
    expect(api.create).not.toHaveBeenCalled();
  });

  it('does not renew from cancelled or pending subscriptions', async () => {
    api.history.mockResolvedValue([{ ...pending, status: 'cancelled' }]);
    await render();
    expect(button('Đăng ký gói mới')?.disabled).toBe(false);
    expect(api.renew).not.toHaveBeenCalled();
  });

  it('blocks an ambiguous expired renewal source', async () => {
    api.history.mockResolvedValue([
      { ...pending, id: 20, status: 'expired', endDate: '2020-01-01' },
      { ...pending, id: 21, status: 'expired', endDate: '2020-01-01' },
    ]);
    await render();
    expect(button('Cần kiểm tra lịch sử')?.disabled).toBe(false);
    expect(api.renew).not.toHaveBeenCalled();
  });

  it('renders and claims the 3-day trial with cccd', async () => {
    trialApiMock.getStatus.mockResolvedValue({ eligible: true, alreadyClaimed: false, days: 3, tier: 'GOLD' });
    await render();
    expect(host.textContent).toContain('Gói Trải Nghiệm 3 Ngày miễn phí');
    expect(button('Nhận 3 ngày tập miễn phí')).toBeDefined();
    await act(async () => button('Nhận 3 ngày tập miễn phí')?.click());
    expect(host.textContent).toContain('Xác minh Căn cước công dân (CCCD)');
    const nameInput = host.querySelector('#trial-full-name');
    const cccdInput = host.querySelector('#trial-cccd');
    expect(nameInput).not.toBeNull();
    expect(cccdInput).not.toBeNull();
    const submitBtn = button('Xác minh & Kích hoạt');
    expect(submitBtn).toBeDefined();
  });

  it('hides hold button and displays Gói Trải Nghiệm 3 Ngày when current subscription is a 3-day trial', async () => {
    const trialSub: MemberSubscription = {
      id: 99,
      memberId: 1,
      packageId: 2,
      packageName: 'GOLD',
      previousSubscriptionId: null,
      startDate: '2026-11-05',
      endDate: '2026-11-08',
      status: 'active',
      qrCode: 'qr-123',
      createdAt: '2026-11-05T08:00:00',
      holdStatus: null,
      holdReason: null,
      holdRequestedAt: null,
      holdResolvedAt: null,
      paidThroughDate: '2026-11-08',
      upgradeCharge: 0,
      remainingValue: 0,
    };
    api.current.mockResolvedValue(trialSub);
    await render();

    expect(host.textContent).toContain('Gói Trải Nghiệm 3 Ngày');
    expect(button('Quản lý gói')).toBeUndefined();
    expect(button('Bảo lưu gói tập')).toBeUndefined();
  });

  it.each(['failed', 'refunded'])('explains a %s payment without offering another POST', async (status) => {
    api.history.mockResolvedValue([pending]);
    api.payments.mockResolvedValue([{ ...payment, status }]);
    await render();
    expect(host.textContent).toContain(status === 'failed' ? 'giao dịch thất bại' : 'đã hoàn tiền');
    expect(button('Tôi đã chuyển khoản')).toBeUndefined();
    expect(api.createPayment).not.toHaveBeenCalled();
  });

  it('switches an open trial modal and existing validation error VI → EN → VI without rewriting catalog content', async () => {
    await render();
    await act(async () => button('Nhận 3 ngày tập miễn phí')?.click());
    await act(async () => host.querySelector('dialog form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(host.querySelector('dialog')?.textContent).toContain('Số CCCD không hợp lệ');
    await act(async () => setLanguage('en'));
    expect(host.querySelector('dialog')?.textContent).toContain('Apply for a 3-day trial');
    expect(host.querySelector('dialog [role="alert"]')?.textContent).toContain('Invalid citizen ID number');
    expect(host.querySelector('dialog button[aria-label="Close dialog"]')).not.toBeNull();
    expect(host.querySelector('.package-benefit-list')?.getAttribute('aria-label')).toBe('Essential benefits');
    expect(host.textContent).toContain('Essential');
    await act(async () => setLanguage('vi'));
    expect(host.querySelector('dialog [role="alert"]')?.textContent).toContain('Số CCCD không hợp lệ');
    expect(host.querySelector('dialog button[aria-label="Đóng hộp thoại"]')).not.toBeNull();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('revalidates persisted browser Back before allowing stale pending actions', async () => {
    api.history.mockResolvedValue([pending]);
    await render();
    let finish!: (value: MemberSubscription[]) => void;
    api.history.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    api.current.mockResolvedValue(active);
    api.payments.mockResolvedValue([{ ...payment, method: 'online_wallet', status: 'success' }]);
    await act(async () => window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })));
    expect(api.history).toHaveBeenCalledTimes(2);
    expect(button('Hủy yêu cầu đăng ký')?.disabled).toBe(true);
    await act(async () => finish([{ ...pending, status: 'active' }]));
    expect(button('Hủy yêu cầu đăng ký')).toBeUndefined();
    expect(api.cancelPending).not.toHaveBeenCalled();
  });

  it('lets the backend guard decide cancellation for pending online checkout, rather than blocking it forever', async () => {
    api.history.mockResolvedValue([pending]);
    api.payments.mockResolvedValue([{ ...payment, method: 'online_wallet' }]);
    api.cancelPending.mockResolvedValue({ ...pending, status: 'cancelled' });
    await render();
    expect(button('Hủy yêu cầu đăng ký')?.disabled).toBe(false);
    expect(noticeText()).not.toContain('Đã gửi thông báo chuyển khoản');
    await act(async () => button('Hủy yêu cầu đăng ký')?.click());
    await act(async () => button('Xác nhận hủy')?.click());
    expect(api.cancelPending).toHaveBeenCalledWith(pending.id);
  });

  it('keeps a live VNPay attempt pending when cancellation is rejected and allows a later retry', async () => {
    api.history.mockResolvedValue([pending]);
    api.payments.mockResolvedValue([{ ...payment, method: 'online_wallet' }]);
    api.cancelPending.mockRejectedValueOnce(new Error('VNPay đang chờ xác nhận.'));
    await render();
    await act(async () => button('Hủy yêu cầu đăng ký')?.click());
    await act(async () => button('Xác nhận hủy')?.click());
    expect(host.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain('VNPay đang chờ xác nhận');
    expect(api.cancelPending).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('Đang chờ thanh toán');
    api.cancelPending.mockResolvedValueOnce({ ...pending, status: 'cancelled' });
    await act(async () => button('Xác nhận hủy')?.click());
    expect(api.cancelPending).toHaveBeenCalledTimes(2);
  });
  it('does not accept a pre-Back background snapshot while a newer return read is pending', async () => {
    api.history.mockResolvedValue([pending]);
    await render();
    let oldRead!: (value: MemberSubscription[]) => void;
    let newRead!: (value: MemberSubscription[]) => void;
    api.history.mockImplementationOnce(() => new Promise(resolve => { oldRead = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { newRead = resolve; }));
    await act(async () => window.dispatchEvent(new Event('online')));
    await act(async () => window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })));
    await act(async () => oldRead([pending]));
    expect(api.history).toHaveBeenCalledTimes(3);
    expect(button('Hủy yêu cầu đăng ký')?.disabled).toBe(true);
    await act(async () => newRead([{ ...pending, status: 'cancelled' }]));
    expect(button('Hủy yêu cầu đăng ký')).toBeUndefined();
  });
  it('recovers a failed browser-return sync through the pending status refresh control', async () => {
    api.history.mockResolvedValue([pending]);
    await render();
    api.payments.mockRejectedValueOnce(new Error('offline'));
    await act(async () => window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })));
    expect(button('Hủy yêu cầu đăng ký')?.disabled).toBe(true);
    await act(async () => host.querySelector<HTMLButtonElement>('button[title="Tải lại trạng thái"]')?.click());
    expect(button('Hủy yêu cầu đăng ký')?.disabled).toBe(false);
  });


  it('excludes trial packages from the purchasable catalog grid', async () => {
    const trialPkg = {
      id: 999,
      name: 'Gói Trải Nghiệm 3 Ngày',
      description: 'GÓI TRẢI NGHIỆM',
      price: 0,
      durationDays: 3,
      classCreditLimit: 3,
      status: 'active',
    };
    api.packages.mockResolvedValue([membershipPackage, higherPackage, trialPkg]);
    await render();

    const grid = host.querySelector('.grid-3');
    expect(grid).not.toBeNull();
    // Grid must contain regular packages but must NOT render trial package as a purchasable card
    expect(grid?.textContent).toContain('Essential');
    expect(grid?.textContent).toContain('VIP Sanctuary');
    expect(grid?.textContent).not.toContain('Gói Trải Nghiệm 3 Ngày');
    expect(grid?.textContent).not.toContain('0 đ / 3 ngày');
  });

  it('hides trial horizontal banner if member has existing subscriptions in history', async () => {
    trialApiMock.getStatus.mockResolvedValue({ eligible: true, alreadyClaimed: false, days: 3, tier: 'GOLD' });
    api.current.mockResolvedValue(null);
    api.history.mockResolvedValue([{ ...pending, id: 88, status: 'expired' }]);
    await render();

    // Banner should NOT be visible because user has membership history
    expect(host.textContent).not.toContain('Gói Trải Nghiệm 3 Ngày miễn phí');
    expect(button('Nhận 3 ngày tập miễn phí')).toBeUndefined();
  });
});
