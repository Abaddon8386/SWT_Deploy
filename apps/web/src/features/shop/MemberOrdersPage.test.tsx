import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemberOrdersPage } from './MemberOrdersPage';
import { shopApi } from './shopApi';

vi.mock('../../shared/lib/portalNotices', () => ({ notify: vi.fn() }));
vi.mock('./shopApi', () => ({
  shopApi: {
    listMyOrders: vi.fn(),
    listAddresses: vi.fn(),
    saveAddress: vi.fn(),
    makeDefaultAddress: vi.fn(),
    deleteAddress: vi.fn(),
    listProvinces: vi.fn(),
    listWards: vi.fn(),
    listCategories: vi.fn(),
    listProducts: vi.fn(),
    getProduct: vi.fn(),
    quote: vi.fn(),
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
  vi.mocked(shopApi.listProvinces).mockResolvedValue([{ code: '79', name: 'TP. Hồ Chí Minh' }]);
  vi.mocked(shopApi.listWards).mockResolvedValue([{ code: '26734', name: 'Phường Sài Gòn' }]);
  vi.mocked(shopApi.listCategories).mockResolvedValue([{ id: 1, name: 'Whey', slug: 'whey' }]);
  vi.mocked(shopApi.listProducts).mockResolvedValue({
    content: [],
    number: 0,
    size: 12,
    totalElements: 0,
    totalPages: 0,
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

async function renderAt(entry = '/member/orders') {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <MemberOrdersPage />
      </MemoryRouter>,
    );
  });
}

async function click(text: string) {
  await act(async () => {
    const btn = [...host.querySelectorAll<HTMLElement>('button, a')].find(el =>
      el.textContent?.includes(text),
    );
    expect(btn).toBeTruthy();
    btn!.click();
  });
}

it('lists orders by status group with real totals and a pay action for unpaid online orders', async () => {
  vi.mocked(shopApi.listMyOrders).mockResolvedValue({
    content: [
      {
        id: 42,
        code: 'SOL-261105-7KQ2',
        status: 'pending_payment',
        fulfillment: 'delivery',
        paymentMethod: 'online',
        total: 2580000,
        itemCount: 2,
        firstItemName: 'SÖL Whey Isolate',
        createdAt: '2026-11-05T14:05:00',
        canPay: true,
      },
    ],
    number: 0,
    size: 10,
    totalElements: 1,
    totalPages: 1,
  });

  await renderAt('/member/orders');
  expect(host.textContent).toContain('SOL-261105-7KQ2');
  expect(host.textContent).toContain('SÖL Whey Isolate và 1 sản phẩm khác');
  expect(host.textContent).toContain('2.580.000');
  expect(host.querySelector('a[href="/member/orders/42"]')?.textContent).toContain('Thanh toán');

  await click('Đang xử lý');
  expect(shopApi.listMyOrders).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'active', page: 0 }),
  );
});

it('address tab adds, edits, sets default and deletes with confirmation', async () => {
  vi.mocked(shopApi.listAddresses).mockResolvedValue([
    {
      id: 1,
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
    {
      id: 2,
      recipientName: 'Trần Bình',
      phone: '0912345678',
      provinceCode: '79',
      provinceName: 'TP. Hồ Chí Minh',
      wardCode: '26734',
      wardName: 'Phường Sài Gòn',
      streetLine: '88 Nguyễn Huệ',
      note: 'Giao giờ hành chính',
      isDefault: false,
    },
  ]);
  vi.mocked(shopApi.makeDefaultAddress).mockResolvedValue([
    {
      id: 2,
      recipientName: 'Trần Bình',
      phone: '0912345678',
      provinceCode: '79',
      provinceName: 'TP. Hồ Chí Minh',
      wardCode: '26734',
      wardName: 'Phường Sài Gòn',
      streetLine: '88 Nguyễn Huệ',
      note: 'Giao giờ hành chính',
      isDefault: true,
    },
  ]);
  vi.mocked(shopApi.deleteAddress).mockResolvedValue([]);
  vi.mocked(shopApi.saveAddress).mockResolvedValue({
    id: 2,
    recipientName: 'Trần Bình Mới',
    phone: '0912345678',
    provinceCode: '79',
    provinceName: 'TP. Hồ Chí Minh',
    wardCode: '26734',
    wardName: 'Phường Sài Gòn',
    streetLine: '88 Nguyễn Huệ',
    note: null,
    isDefault: false,
  });

  await renderAt('/member/orders?tab=addresses');
  expect(host.textContent).toContain('Lưu tối đa 5 địa chỉ giao hàng (2/5)');
  expect(host.textContent).toContain('Nguyễn An');
  expect(host.textContent).toContain('Trần Bình');

  // Set default
  await click('Đặt làm mặc định');
  expect(shopApi.makeDefaultAddress).toHaveBeenCalledWith(2);

  // Edit in modal
  await click('Sửa');
  expect(host.querySelector('dialog')).not.toBeNull();
  await click('Lưu địa chỉ');
  expect(shopApi.saveAddress).toHaveBeenCalledWith(
    expect.objectContaining({ recipientName: 'Trần Bình', phone: '0912345678' }),
    2,
  );

  // Delete with useConfirm
  await click('Xóa');
  expect(shopApi.deleteAddress).not.toHaveBeenCalled();
  await click('Xóa địa chỉ');
  expect(shopApi.deleteAddress).toHaveBeenCalledWith(1);
});

it('shop tab lets members browse products with real images, open quick-buy modal and add to cart inside portal', async () => {
  vi.mocked(shopApi.listProducts).mockResolvedValue({
    content: [
      {
        id: 10,
        slug: 'sol-whey-isolate',
        name: 'SÖL Whey Isolate',
        categoryName: 'Whey',
        form: 'powder',
        goals: ['muscle_gain'],
        shortDescription: 'Đạm whey tách béo',
        imageUrl: '/images/shop/whey-isolate.jpg',
        highlight: { name: 'Đạm', amount: 25, unit: 'g' },
        minPrice: 1290000,
        pricePerServing: 18971,
        inStock: true,
        lowStock: true,
        featured: true,
        isNew: true,
        defaultVariantId: 101,
        variantCount: 2,
      },
    ],
    number: 0,
    size: 12,
    totalElements: 1,
    totalPages: 1,
  });
  vi.mocked(shopApi.getProduct).mockResolvedValue({
    id: 10,
    slug: 'sol-whey-isolate',
    name: 'SÖL Whey Isolate',
    brand: 'SÖL Nutrition',
    categoryName: 'Whey',
    categorySlug: 'whey',
    form: 'powder',
    goals: ['muscle_gain'],
    shortDescription: 'Đạm whey tách béo',
    description: 'Chi tiết whey isolate',
    servingSize: '1 muỗng (33 g)',
    usageInstructions: 'Pha với nước',
    warnings: null,
    registrationNumber: null,
    images: [{ id: 1, url: '/images/shop/whey-isolate.jpg', alt: 'SÖL Whey Isolate' }],
    variants: [
      {
        id: 101,
        sku: 'SOL-WHEY-2KG',
        label: 'Sô-cô-la · 2,27 kg',
        price: 1290000,
        servingsPerContainer: 68,
        pricePerServing: 18971,
        stock: 7,
        available: true,
      },
    ],
    nutrients: [
      { name: 'Đạm', amount: 25, unit: 'g', dailyValuePercent: 50, subRow: false, highlight: true },
    ],
    related: [],
  });

  await renderAt('/member/orders?tab=shop');
  expect(host.textContent).toContain('SÖL Whey Isolate');
  expect(host.textContent).toContain('Sắp hết');
  expect(host.textContent).toContain('Mới');
  expect(host.querySelector<HTMLImageElement>('img.shop-packshot__img')?.getAttribute('src')).toBe(
    '/images/shop/whey-isolate.jpg',
  );

  // Open quick-buy modal by clicking product title
  await click('SÖL Whey Isolate');
  expect(shopApi.getProduct).toHaveBeenCalledWith('sol-whey-isolate');
  expect(host.textContent).toContain('Sắp hết · Còn 7 sản phẩm');

  // Add to cart from modal
  await click('Thêm vào giỏ');
  expect(host.textContent).toContain('Giỏ hàng có');
});
