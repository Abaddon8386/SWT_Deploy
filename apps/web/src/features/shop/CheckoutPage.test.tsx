import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError, AUTH_STORAGE_KEY } from '../../shared/api/client';
import * as vnpayApi from '../payments/vnpayApi';
import * as walletApi from '../wallet/walletApi';
import { addToCart, clearCart, getCart } from './cart';
import { CheckoutPage } from './CheckoutPage';
import { shopApi } from './shopApi';
import type { AddressDto, OrderDto, QuoteDto } from './shopTypes';

vi.mock('./shopApi', () => ({
  shopApi: {
    getShopConfig: vi.fn(),
    listAddresses: vi.fn(),
    listProvinces: vi.fn(),
    listWards: vi.fn(),
    quote: vi.fn(),
    createOrder: vi.fn(),
  },
}));

vi.mock('../payments/vnpayApi', () => ({
  createVnpayCheckout: vi.fn(),
  navigateToVnpay: vi.fn(),
}));

vi.mock('../wallet/walletApi', () => ({
  payWithWallet: vi.fn(),
}));

const defaultAddresses: AddressDto[] = [
  {
    id: 5,
    recipientName: 'Nguyễn An',
    phone: '0901234567',
    provinceCode: '79',
    provinceName: 'TP. Hồ Chí Minh',
    wardCode: '26734',
    wardName: 'Phường Sài Gòn',
    streetLine: '12 Lê Lợi',
    note: null,
    isDefault: true,
  },
];

const buildQuote = (total = 1290000): QuoteDto => ({
  lines: [
    {
      variantId: 101,
      productName: 'SÖL Whey Isolate',
      variantLabel: 'Sô-cô-la · 2,27 kg',
      slug: 'sol-whey-isolate',
      imageUrl: null,
      unitPrice: total,
      requestedQuantity: 1,
      quantity: 1,
      stock: 10,
      lineTotal: total,
      problem: null,
    },
  ],
  subtotal: total,
  shippingFee: 0,
  total,
  valid: true,
});

const buildOrder = (id: number): OrderDto => ({
  id,
  code: `SOL-261105-000${id}`,
  status: 'pending_payment',
  fulfillment: 'delivery',
  paymentMethod: 'online',
  items: [],
  subtotal: 1290000,
  shippingFee: 0,
  total: 1290000,
  shipping: null,
  pickupAddress: null,
  paymentDueAt: '2026-11-05T10:00:00Z',
  createdAt: '2026-11-05T09:30:00Z',
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
});

function LocationProbe() {
  const loc = useLocation();
  return <output data-testid="loc">{loc.pathname + loc.search}</output>;
}

let host: HTMLDivElement;
let root: Root;

const loginAs = (role: 'MEMBER' | 'STAFF' | 'MANAGER') => {
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ id: '1', name: 'User', identifier: 'u', role }),
  );
};

beforeEach(() => {
  localStorage.clear();
  clearCart();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 })));
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.mocked(shopApi.getShopConfig).mockResolvedValue({
    shippingFee: 30000,
    freeShippingThreshold: 500000,
    paymentWindowMinutes: 30,
    counterHoldHours: 48,
    pickupAddress: '120 Hai Bà Trưng, Phường Sài Gòn, TP.HCM',
  });
  vi.mocked(shopApi.listAddresses).mockResolvedValue(defaultAddresses);
  vi.mocked(shopApi.listProvinces).mockResolvedValue([{ code: '79', name: 'TP. Hồ Chí Minh' }]);
  vi.mocked(shopApi.listWards).mockResolvedValue([{ code: '26734', name: 'Phường Sài Gòn' }]);
  vi.mocked(shopApi.quote).mockResolvedValue(buildQuote());
  vi.mocked(vnpayApi.createVnpayCheckout).mockResolvedValue({
    reference: 'REF-1',
    paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    amount: 1290000,
    expiresAt: '2026-11-05T10:00:00Z',
  });
  vi.mocked(walletApi.payWithWallet).mockResolvedValue({
    balance: 5000000,
    updatedAt: '2026-11-05T09:00:00Z',
    transactions: [],
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.querySelectorAll('.sol-toast').forEach(el => el.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const renderCheckout = () =>
  act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/checkout']}>
        <Routes>
          <Route
            path="/checkout"
            element={
              <>
                <CheckoutPage />
                <LocationProbe />
              </>
            }
          />
          <Route path="/login" element={<LocationProbe />} />
          <Route path="/member/orders/:id" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });

it('guests are redirected to login with returnTo=/checkout', async () => {
  addToCart(101, 1);
  await renderCheckout();
  expect(host.querySelector('[data-testid="loc"]')?.textContent).toBe('/login?returnTo=%2Fcheckout');
});

it('non-member accounts see the members-only notice instead of the form', async () => {
  loginAs('STAFF');
  addToCart(101, 1);
  await renderCheckout();
  expect(host.textContent).toContain('Mua hàng dành cho tài khoản hội viên.');
  expect(host.textContent).toContain('Về portal');
});

it('delivery requires an address; saved default is preselected', async () => {
  loginAs('MEMBER');
  addToCart(101, 1);
  await renderCheckout();

  expect(host.textContent).toContain('Nguyễn An');
  expect(host.textContent).toContain('Mặc định');

  const newAddrRadio = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(r =>
    r.parentElement?.textContent?.includes('Thêm địa chỉ mới'),
  )!;
  await act(async () => {
    newAddrRadio.click();
  });

  const vnpayBtn = [...host.querySelectorAll('button')].find(b =>
    b.textContent?.includes('Thanh toán VNPay Sandbox'),
  )!;
  await act(async () => {
    vnpayBtn.click();
  });

  expect(shopApi.createOrder).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Vui lòng nhập họ tên người nhận.');
});

it('pay at counter is offered only for pickup', async () => {
  loginAs('MEMBER');
  addToCart(101, 1);
  vi.mocked(shopApi.createOrder).mockResolvedValue(buildOrder(12));
  await renderCheckout();

  expect(
    [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Đặt hàng, trả tại quầy')),
  ).toBeUndefined();

  const pickupRadio = host.querySelector<HTMLInputElement>('input[name="fulfillment"][value="pickup"]')!;
  await act(async () => {
    pickupRadio.click();
  });

  const counterBtn = [...host.querySelectorAll('button')].find(b =>
    b.textContent?.includes('Đặt hàng, trả tại quầy'),
  )!;
  expect(counterBtn).toBeDefined();

  await act(async () => {
    counterBtn.click();
  });

  expect(shopApi.createOrder).toHaveBeenCalledWith(
    expect.objectContaining({
      fulfillment: 'pickup',
      paymentMethod: 'counter',
    }),
  );
  expect(getCart()).toEqual([]);
  expect(host.querySelector('[data-testid="loc"]')?.textContent).toBe('/member/orders/12');
});

it('placing an order reuses one clientRequestId across retries', async () => {
  loginAs('MEMBER');
  addToCart(101, 1);
  vi.mocked(shopApi.createOrder)
    .mockRejectedValueOnce(new ApiError('network', 0))
    .mockResolvedValueOnce(buildOrder(9));

  await renderCheckout();

  const vnpayBtn = [...host.querySelectorAll('button')].find(b =>
    b.textContent?.includes('Thanh toán VNPay Sandbox'),
  )!;
  await act(async () => {
    vnpayBtn.click();
  });
  await act(async () => {
    vnpayBtn.click();
  });

  const ids = vi.mocked(shopApi.createOrder).mock.calls.map(c => c[0].clientRequestId);
  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(1);
  expect(vnpayApi.createVnpayCheckout).toHaveBeenCalledWith({ productOrderId: 9 });
});

it('ORDER_PRICE_CHANGED refreshes the quote, shows the inline message and keeps the chosen address', async () => {
  loginAs('MEMBER');
  addToCart(101, 1);
  vi.mocked(shopApi.createOrder).mockRejectedValueOnce(
    new ApiError('Giá sản phẩm đã thay đổi.', 409, 'ORDER_PRICE_CHANGED'),
  );
  vi.mocked(shopApi.quote)
    .mockResolvedValueOnce(buildQuote(1290000))
    .mockResolvedValueOnce(buildQuote(1350000));

  await renderCheckout();

  const vnpayBtn = [...host.querySelectorAll('button')].find(b =>
    b.textContent?.includes('Thanh toán VNPay Sandbox'),
  )!;
  await act(async () => {
    vnpayBtn.click();
  });

  expect(host.textContent).toContain('Giá sản phẩm đã thay đổi.');
  expect(host.textContent).toContain('1.350.000');
  expect(getCart()).toEqual([{ variantId: 101, quantity: 1 }]);
  expect(host.textContent).toContain('Nguyễn An');
});

it('a successful wallet payment clears the cart and opens the order page', async () => {
  loginAs('MEMBER');
  addToCart(101, 1);
  vi.mocked(shopApi.createOrder).mockResolvedValue(buildOrder(9));

  await renderCheckout();

  const walletBtn = host.querySelector<HTMLButtonElement>('[data-testid="pay-with-wallet-btn"]')!;
  await act(async () => {
    walletBtn.click();
  });

  expect(getCart()).toEqual([]);
  expect(walletApi.payWithWallet).toHaveBeenCalledWith({ productOrderId: 9 });
  expect(host.querySelector('[data-testid="loc"]')?.textContent).toBe('/member/orders/9');
});

it('the cart is cleared once the order exists, even before VNPay returns', async () => {
  loginAs('MEMBER');
  addToCart(101, 1);
  vi.mocked(shopApi.createOrder).mockResolvedValue(buildOrder(9));

  await renderCheckout();

  const vnpayBtn = [...host.querySelectorAll('button')].find(b =>
    b.textContent?.includes('Thanh toán VNPay Sandbox'),
  )!;
  await act(async () => {
    vnpayBtn.click();
  });

  expect(getCart()).toEqual([]);
  expect(vnpayApi.navigateToVnpay).toHaveBeenCalledTimes(1);
});
