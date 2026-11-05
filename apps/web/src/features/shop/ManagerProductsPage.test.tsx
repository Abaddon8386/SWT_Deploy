import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/api/client';
import { ManagerProductsPage } from './ManagerProductsPage';
import { shopApi } from './shopApi';

vi.mock('../../shared/lib/portalNotices', () => ({ notify: vi.fn() }));
vi.mock('./shopApi', () => ({
  shopApi: {
    manager: {
      listProducts: vi.fn(),
      setProductActive: vi.fn(),
      deleteProduct: vi.fn(),
      listCategories: vi.fn(),
      createCategory: vi.fn(),
      updateCategory: vi.fn(),
      deleteCategory: vi.fn(),
      orderSummary: vi.fn(),
    },
    staff: {
      listOrders: vi.fn(),
      counts: vi.fn(),
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
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function renderAt(entry = '/manager/products') {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <ManagerProductsPage />
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

it('product table flags low stock and moves delete into the ⋯ menu', async () => {
  vi.mocked(shopApi.manager.listProducts).mockResolvedValue({
    content: [
      {
        id: 1,
        name: 'SÖL Whey Isolate',
        slug: 'sol-whey-isolate',
        categoryName: 'Whey',
        variantCount: 2,
        totalStock: 3,
        lowStock: true,
        active: true,
        featured: true,
        imageUrl: null,
      },
    ],
    number: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });

  await renderAt('/manager/products');
  expect(host.textContent).toContain('SÖL Whey Isolate');
  expect(host.textContent).toContain('Sắp hết');

  const menuDelete = host.querySelector('.action-menu button.action-menu__item--danger');
  expect(menuDelete?.textContent).toBe('Xóa');
});

it('deleting a product with orders shows the server message and suggests stopping sales', async () => {
  vi.mocked(shopApi.manager.listProducts).mockResolvedValue({
    content: [
      {
        id: 1,
        name: 'SÖL Whey Isolate',
        slug: 'sol-whey-isolate',
        categoryName: 'Whey',
        variantCount: 2,
        totalStock: 12,
        lowStock: false,
        active: true,
        featured: false,
        imageUrl: null,
      },
    ],
    number: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });
  vi.mocked(shopApi.manager.deleteProduct).mockRejectedValueOnce(
    new ApiError('Sản phẩm đã có trong đơn hàng, không thể xóa.', 409, 'PRODUCT_HAS_ORDERS'),
  );

  await renderAt('/manager/products');
  await click('Xóa');
  await click('Xóa sản phẩm');

  expect(shopApi.manager.deleteProduct).toHaveBeenCalledWith(1);
  const alert = host.querySelector('[role="alert"]');
  expect(alert?.textContent).toContain('Sản phẩm đã có trong đơn hàng, không thể xóa.');
  expect(alert?.textContent).toContain('Ngừng bán');
});

it('orders tab reuses the staff table and shows the three real summary numbers', async () => {
  vi.mocked(shopApi.manager.orderSummary).mockResolvedValue({
    pendingFulfillment: 5,
    revenue30d: 18450000,
    lowStockVariants: 2,
  });
  vi.mocked(shopApi.staff.counts).mockResolvedValue({
    paid: 3,
    processing: 2,
    ready_for_pickup: 0,
    shipping: 1,
    counter_pending: 0,
  });
  vi.mocked(shopApi.staff.listOrders).mockResolvedValue({
    content: [
      {
        id: 9,
        code: 'SOL-261105-ABCD',
        status: 'paid',
        fulfillment: 'pickup',
        paymentMethod: 'online',
        items: [],
        subtotal: 690000,
        shippingFee: 0,
        total: 690000,
        shipping: null,
        pickupAddress: 'Quầy SÖL',
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
      },
    ],
    number: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
  });

  await renderAt('/manager/products?tab=orders');
  expect(host.textContent).toContain('Đơn cần xử lý');
  expect(host.textContent).toContain('5');
  expect(host.textContent).toContain('Doanh thu sản phẩm 30 ngày');
  expect(host.textContent).toContain('18.450.000');
  expect(host.textContent).toContain('Biến thể sắp hết');
  expect(host.textContent).toContain('SOL-261105-ABCD');
});
