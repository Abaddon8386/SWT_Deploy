import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { notify } from '../../shared/lib/portalNotices';
import { StaffOrdersPage } from './StaffOrdersPage';
import { shopApi } from './shopApi';
import type { OrderDto } from './shopTypes';

vi.mock('../../shared/lib/portalNotices', () => ({ notify: vi.fn() }));
vi.mock('./shopApi', () => ({
  shopApi: {
    staff: {
      listOrders: vi.fn(),
      counts: vi.fn(),
      getOrder: vi.fn(),
      startProcessing: vi.fn(),
      ship: vi.fn(),
      readyForPickup: vi.fn(),
      complete: vi.fn(),
      counterPayment: vi.fn(),
      cancel: vi.fn(),
    },
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
  vi.mocked(shopApi.staff.counts).mockResolvedValue({
    paid: 3,
    processing: 1,
    ready_for_pickup: 2,
    shipping: 4,
    counter_pending: 1,
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function sampleStaffOrder(overrides: Partial<OrderDto> = {}): OrderDto {
  return {
    id: 9,
    code: 'SOL-261105-ABCD',
    status: 'paid',
    fulfillment: 'delivery',
    paymentMethod: 'online',
    items: [
      {
        variantId: 1,
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
    paymentDueAt: null,
    createdAt: '2026-11-05T14:05:00',
    paidAt: '2026-11-05T14:07:00',
    processingAt: null,
    shippedAt: null,
    readyAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
    trackingCarrier: null,
    trackingNumber: null,
    canCancel: true,
    canPay: false,
    refundedAmount: null,
    member: { id: 1, fullName: 'Nguyễn An', phone: '0901234567' },
    ...overrides,
  };
}

async function renderPage() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/staff/orders']}>
        <StaffOrdersPage />
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

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, val: string) {
  const proto =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

it('tabs show live counts and search filters by code, name or phone', async () => {
  vi.mocked(shopApi.staff.listOrders).mockResolvedValue({
    content: [sampleStaffOrder()],
    number: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });

  await renderPage();
  expect(host.textContent).toContain('Cần xử lý (3)');
  expect(host.textContent).toContain('Đang chuẩn bị (1)');
  expect(host.textContent).toContain('Chờ nhận tại quầy (2)');
  expect(host.textContent).toContain('Đang giao (4)');
  expect(host.textContent).toContain('Chờ trả tại quầy (1)');

  const searchInput = host.querySelector<HTMLInputElement>('#staff-order-search')!;
  await act(async () => {
    setInputValue(searchInput, '0901234567');
  });
  expect(shopApi.staff.listOrders).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'paid', q: '0901234567', page: 0 }),
  );
});

it('dialog offers only the actions valid for the order status and fulfilment', async () => {
  vi.mocked(shopApi.staff.listOrders).mockResolvedValue({
    content: [sampleStaffOrder({ status: 'processing', fulfillment: 'pickup' })],
    number: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });

  await renderPage();
  await click('Mở');
  const dialog = host.querySelector('dialog')!;
  expect(dialog.textContent).toContain('Sẵn sàng nhận tại quầy');
  expect(dialog.textContent).not.toContain('Giao cho vận chuyển');
  expect(dialog.textContent).not.toContain('Bắt đầu chuẩn bị');
  expect(dialog.textContent).not.toContain('Thu tiền tại quầy');
});

it('ship requires a tracking number before submitting', async () => {
  vi.mocked(shopApi.staff.listOrders).mockResolvedValue({
    content: [sampleStaffOrder({ status: 'processing', fulfillment: 'delivery' })],
    number: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });
  vi.mocked(shopApi.staff.ship).mockResolvedValue(
    sampleStaffOrder({
      status: 'shipping',
      trackingCarrier: 'GHN',
      trackingNumber: '88342210',
    }),
  );

  await renderPage();
  await click('Mở');
  await click('Giao cho vận chuyển');
  expect(shopApi.staff.ship).not.toHaveBeenCalled();
  expect(host.querySelector('dialog [role="alert"]')?.textContent).toContain(
    'Vui lòng nhập mã vận đơn',
  );

  await act(async () => {
    setInputValue(host.querySelector<HTMLInputElement>('#staff-ship-carrier')!, 'GHN');
    setInputValue(host.querySelector<HTMLInputElement>('#staff-ship-tracking')!, '88342210');
  });
  await click('Giao cho vận chuyển');
  expect(shopApi.staff.ship).toHaveBeenCalledWith(9, {
    carrier: 'GHN',
    trackingNumber: '88342210',
  });
});

it('counter payment asks for the method and refreshes the order', async () => {
  vi.mocked(shopApi.staff.listOrders).mockResolvedValue({
    content: [
      sampleStaffOrder({
        status: 'pending_payment',
        fulfillment: 'pickup',
        paymentMethod: 'counter',
        paidAt: null,
      }),
    ],
    number: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });
  vi.mocked(shopApi.staff.counterPayment).mockResolvedValue(
    sampleStaffOrder({
      status: 'paid',
      fulfillment: 'pickup',
      paymentMethod: 'counter',
      paidAt: '2026-11-05T14:20:00',
    }),
  );

  await renderPage();
  await click('Mở');
  const select = host.querySelector('#staff-counter-method')!.closest('.ui-select')!.querySelector<HTMLSelectElement>('select.ui-select__native')!;
  await act(async () => {
    setInputValue(select, 'pos');
  });
  await click('Thu tiền tại quầy');
  expect(shopApi.staff.counterPayment).toHaveBeenCalledWith(9, 'pos');
  expect(notify).toHaveBeenCalledWith(
    expect.stringContaining('SOL-261105-ABCD'),
    'success',
    { record: true },
  );
  expect(host.querySelector('dialog')?.textContent).toContain('Bắt đầu chuẩn bị');
});

it('cancel requires a reason, shows the wallet refund amount for paid orders and the restock option', async () => {
  vi.mocked(shopApi.staff.listOrders).mockResolvedValue({
    content: [sampleStaffOrder({ status: 'paid', paidAt: '2026-11-05T14:07:00' })],
    number: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });
  vi.mocked(shopApi.staff.cancel).mockResolvedValue(
    sampleStaffOrder({ status: 'cancelled', cancelledAt: '2026-11-05T14:30:00' }),
  );

  await renderPage();
  await click('Mở');
  await click('Hủy đơn');

  const dialog = host.querySelector('dialog')!;
  expect(dialog.textContent).toContain('2.580.000');
  expect(dialog.textContent).toContain('Ví SÖL');

  await click('Xác nhận hủy đơn');
  expect(shopApi.staff.cancel).not.toHaveBeenCalled();
  expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('Vui lòng nhập lý do hủy');

  await act(async () => {
    setInputValue(
      host.querySelector<HTMLTextAreaElement>('#staff-cancel-reason')!,
      'Hội viên đổi ý trước khi đóng gói',
    );
  });
  await click('Xác nhận hủy đơn');
  expect(shopApi.staff.cancel).toHaveBeenCalledWith(9, {
    reason: 'Hội viên đổi ý trước khi đóng gói',
    restock: true,
  });
  expect(notify).toHaveBeenCalledWith(
    expect.stringContaining('SOL-261105-ABCD'),
    'success',
    { record: true },
  );
});

it('errors stay inside the dialog and the dialog cannot close while sending', async () => {
  vi.mocked(shopApi.staff.listOrders).mockResolvedValue({
    content: [sampleStaffOrder({ status: 'paid' })],
    number: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });
  let rejectFn!: (err: Error) => void;
  vi.mocked(shopApi.staff.startProcessing).mockReturnValue(
    new Promise((_, rej) => {
      rejectFn = rej;
    }),
  );

  await renderPage();
  await click('Mở');
  await click('Bắt đầu chuẩn bị');

  const dialog = host.querySelector<HTMLDialogElement>('dialog')!;
  expect(dialog.getAttribute('aria-busy')).toBe('true');

  // Attempt to cancel/close while busy
  await act(async () => {
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
  });
  expect(host.querySelector('dialog')).not.toBeNull();

  await act(async () => {
    rejectFn(new Error('Không thể chuyển trạng thái đơn'));
  });
  expect(host.querySelector('dialog')).not.toBeNull();
  expect(host.querySelector('dialog [role="alert"]')?.textContent).toContain(
    'Không thể chuyển trạng thái đơn',
  );
});
