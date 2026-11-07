import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { notify } from '../../shared/lib/portalNotices';
import { toast } from '../../shared/ui/toast';
import { createVnpayCheckout } from '../payments/vnpayApi';
import { MemberOrderDetailPage } from './MemberOrderDetailPage';
import { shopApi } from './shopApi';
import type { OrderDto } from './shopTypes';

vi.mock('../../shared/lib/portalNotices', () => ({ notify: vi.fn() }));
vi.mock('../../shared/ui/toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock('../payments/vnpayApi', () => ({
  createVnpayCheckout: vi.fn(),
  navigateToVnpay: vi.fn(),
}));
vi.mock('../wallet/walletApi', () => ({
  payWithWallet: vi.fn(),
}));
vi.mock('./shopApi', () => ({
  shopApi: {
    getMyOrder: vi.fn(),
    cancelMyOrder: vi.fn(),
  },
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function sampleOrder(overrides: Partial<OrderDto> = {}): OrderDto {
  return {
    id: 42,
    code: 'SOL-261105-7KQ2',
    status: 'pending_payment',
    fulfillment: 'delivery',
    paymentMethod: 'online',
    items: [
      {
        variantId: 10,
        productName: 'SÖL Whey Isolate',
        variantLabel: 'Sô-cô-la · 2,27 kg',
        sku: 'SOL-WHEY-2KG',
        unitPrice: 1290000,
        quantity: 2,
        lineTotal: 2580000,
        slug: 'sol-whey-isolate',
        imageUrl: null,
      },
    ],
    subtotal: 2580000,
    shippingFee: 0,
    total: 2580000,
    shipping: {
      recipientName: 'Nguyễn An',
      phone: '0901234567',
      provinceName: 'TP. Hồ Chí Minh',
      wardName: 'Phường Sài Gòn',
      streetLine: '12 Lê Lợi',
      note: null,
    },
    pickupAddress: null,
    paymentDueAt: '2026-11-05T14:35:00',
    createdAt: '2026-11-05T14:05:00',
    paidAt: null,
    processingAt: null,
    shippedAt: null,
    readyAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
    trackingCarrier: null,
    trackingNumber: null,
    canCancel: true,
    canPay: true,
    refundedAmount: null,
    member: null,
    ...overrides,
  };
}

async function renderOrder(id = 42) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/member/orders/${id}`]}>
        <Routes>
          <Route path="/member/orders/:orderId" element={<MemberOrderDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

async function click(text: string) {
  await act(async () => {
    const btn = [...host.querySelectorAll<HTMLButtonElement>('button')].find(el =>
      el.textContent?.includes(text),
    );
    expect(btn).toBeTruthy();
    btn!.click();
  });
}

it('detail timeline shows only reached steps with timestamps and the pickup instruction for pickup orders', async () => {
  vi.mocked(shopApi.getMyOrder).mockResolvedValue(
    sampleOrder({
      status: 'ready_for_pickup',
      fulfillment: 'pickup',
      shipping: null,
      pickupAddress: 'Quầy lễ tân SÖL Quận 1',
      paidAt: '2026-11-05T14:07:00',
      processingAt: '2026-11-05T15:00:00',
      readyAt: '2026-11-05T16:10:00',
      canPay: false,
      canCancel: false,
    }),
  );

  await renderOrder(42);
  const reachedSteps = [...host.querySelectorAll('.shop-timeline__step.is-reached')];
  const pendingSteps = [...host.querySelectorAll('.shop-timeline__step.is-pending')];
  expect(reachedSteps.map(s => s.querySelector('.shop-timeline__label')?.textContent)).toEqual([
    'Đặt hàng',
    'Đã thanh toán',
    'Đang chuẩn bị',
    'Chờ nhận tại quầy',
  ]);
  expect(pendingSteps.map(s => s.querySelector('.shop-timeline__label')?.textContent)).toEqual([
    'Đã nhận tại quầy',
  ]);
  expect(host.textContent).toContain('Quầy lễ tân SÖL Quận 1');
  expect(host.textContent).toContain('Mang thẻ hội viên');
});

it('pending online order shows VnpayPayButton targeting the order and the hold deadline', async () => {
  vi.mocked(shopApi.getMyOrder).mockResolvedValue(sampleOrder());
  vi.mocked(createVnpayCheckout).mockResolvedValue({
    paymentUrl: 'https://sandbox.vnpayment.vn/pay',
    reference: 'REF42',
    amount: 2580000,
    expiresAt: '2026-11-05T14:35:00',
  });

  await renderOrder(42);
  expect(host.textContent).toContain('Giữ hàng đến 14:35 05/11/2026');
  await click('Thanh toán VNPay Sandbox');
  expect(createVnpayCheckout).toHaveBeenCalledWith({ productOrderId: 42 });
});

it('cancel goes through useConfirm and records a notice', async () => {
  vi.mocked(shopApi.getMyOrder).mockResolvedValue(sampleOrder());
  vi.mocked(shopApi.cancelMyOrder).mockResolvedValue(
    sampleOrder({
      status: 'cancelled',
      cancelledAt: '2026-11-05T14:10:00',
      canCancel: false,
      canPay: false,
    }),
  );

  await renderOrder(42);
  await click('Hủy đơn');
  expect(shopApi.cancelMyOrder).not.toHaveBeenCalled();

  await click('Xác nhận hủy');
  expect(shopApi.cancelMyOrder).toHaveBeenCalledWith(42);
  expect(notify).toHaveBeenCalledWith('Đã hủy đơn SOL-261105-7KQ2', 'success', { record: true, translation: { vi: 'Đã hủy đơn SOL-261105-7KQ2', en: 'Order SOL-261105-7KQ2 cancelled' } });
});

it('copying the tracking number uses toast, not the bell', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  vi.mocked(shopApi.getMyOrder).mockResolvedValue(
    sampleOrder({
      status: 'shipping',
      paidAt: '2026-11-05T14:07:00',
      processingAt: '2026-11-06T09:00:00',
      shippedAt: '2026-11-06T15:30:00',
      trackingCarrier: 'GHN',
      trackingNumber: '88342210',
      canPay: false,
      canCancel: false,
    }),
  );

  await renderOrder(42);
  expect(host.textContent).toContain('GHN');
  expect(host.textContent).toContain('88342210');

  await click('Sao chép');
  expect(writeText).toHaveBeenCalledWith('88342210');
  expect(toast.success).toHaveBeenCalledWith('Đã sao chép mã vận đơn', { vi: 'Đã sao chép mã vận đơn', en: 'Tracking number copied' });
  expect(notify).not.toHaveBeenCalled();
});
