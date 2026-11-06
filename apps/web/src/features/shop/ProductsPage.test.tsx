import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearCart } from './cart';
import { ProductsPage } from './ProductsPage';
import { shopApi } from './shopApi';
import type { ProductSummaryDto } from './shopTypes';

vi.mock('./shopApi', () => ({
  shopApi: {
    listCategories: vi.fn(),
    listProducts: vi.fn(),
  },
}));

const makeProduct = (id: number, name: string): ProductSummaryDto => ({
  id,
  slug: `prod-${id}`,
  name,
  categoryName: 'Whey',
  form: 'powder',
  goals: ['muscle_gain'],
  shortDescription: 'Đạm whey cô lập',
  imageUrl: null,
  highlight: { name: 'Đạm', amount: 25, unit: 'g' },
  minPrice: 1290000,
  pricePerServing: 18971,
  inStock: true,
  lowStock: false,
  featured: true,
  isNew: false,
  defaultVariantId: id * 10,
  variantCount: 1,
});

function LocationProbe() {
  const loc = useLocation();
  return <output data-testid="loc">{loc.pathname + loc.search}</output>;
}

let host: HTMLDivElement;
let root: Root;

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
  vi.mocked(shopApi.listCategories).mockResolvedValue([
    { id: 1, name: 'Whey', slug: 'whey' },
    { id: 2, name: 'Creatine', slug: 'creatine' },
  ]);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const renderAt = (entry: string) =>
  act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/products"
            element={
              <>
                <ProductsPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
  });

it('restores filters from the URL and writes them back', async () => {
  vi.mocked(shopApi.listProducts).mockResolvedValue({
    content: [makeProduct(1, 'SÖL Whey Isolate')],
    number: 0,
    size: 12,
    totalElements: 1,
    totalPages: 1,
  });

  await renderAt('/products?goal=recovery&sort=price_per_serving&q=whey');

  expect(shopApi.listProducts).toHaveBeenCalledWith(
    expect.objectContaining({
      goal: 'recovery',
      sort: 'price_per_serving',
      q: 'whey',
      page: 0,
    }),
  );

  const energyBtn = [...host.querySelectorAll('button')].find(b => b.textContent === 'Năng lượng')!;
  await act(async () => {
    energyBtn.click();
  });

  expect(host.querySelector('[data-testid="loc"]')?.textContent).toContain('goal=energy');
});

it('shows empty state with a clear-filters action', async () => {
  vi.mocked(shopApi.listProducts)
    .mockResolvedValueOnce({
      content: [],
      number: 0,
      size: 12,
      totalElements: 0,
      totalPages: 0,
    })
    .mockResolvedValueOnce({
      content: [makeProduct(1, 'SÖL Whey Isolate')],
      number: 0,
      size: 12,
      totalElements: 1,
      totalPages: 1,
    });

  await renderAt('/products?goal=wellness&inStock=1');

  expect(host.textContent).toContain('Không có sản phẩm khớp bộ lọc.');
  const clearBtn = [...host.querySelectorAll('button')].find(b => b.textContent === 'Xóa bộ lọc')!;
  await act(async () => {
    clearBtn.click();
  });

  expect(host.querySelector('[data-testid="loc"]')?.textContent).toBe('/products');
  expect(host.textContent).toContain('SÖL Whey Isolate');
});

it('loads more pages and keeps earlier cards', async () => {
  vi.mocked(shopApi.listProducts)
    .mockResolvedValueOnce({
      content: [makeProduct(1, 'SÖL Whey Isolate')],
      number: 0,
      size: 12,
      totalElements: 2,
      totalPages: 2,
    })
    .mockResolvedValueOnce({
      content: [makeProduct(2, 'SÖL Creatine Monohydrate')],
      number: 1,
      size: 12,
      totalElements: 2,
      totalPages: 2,
    });

  await renderAt('/products');

  expect(host.textContent).toContain('SÖL Whey Isolate');
  const moreBtn = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Xem thêm'))!;
  await act(async () => {
    moreBtn.click();
  });

  expect(shopApi.listProducts).toHaveBeenLastCalledWith(
    expect.objectContaining({
      page: 1,
      size: 12,
    }),
  );
  expect(host.textContent).toContain('SÖL Whey Isolate');
  expect(host.textContent).toContain('SÖL Creatine Monohydrate');
});

it('keeps existing products visible when loading more fails and retries the same page', async () => {
  vi.mocked(shopApi.listProducts).mockResolvedValueOnce({ content: [makeProduct(1, 'Whey đang xem')], number: 0, size: 12, totalElements: 2, totalPages: 2 })
    .mockRejectedValueOnce(new Error('Offline'));
  await renderAt('/products');
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Xem thêm'))!.click());
  expect(host.querySelector('.shop-card')?.textContent).toContain('Whey đang xem');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Không tải thêm');
  vi.mocked(shopApi.listProducts).mockResolvedValueOnce({ content: [makeProduct(2, 'Creatine mới')], number: 1, size: 12, totalElements: 2, totalPages: 2 });
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Thử tải thêm'))!.click());
  expect(host.querySelectorAll('.shop-card')).toHaveLength(2);
});

it('ignores a late load-more response after the user changes filters', async () => {
  let resolveMore!: (value: Awaited<ReturnType<typeof shopApi.listProducts>>) => void;
  vi.mocked(shopApi.listProducts).mockResolvedValueOnce({ content: [makeProduct(1, 'Whey cũ')], number: 0, size: 12, totalElements: 2, totalPages: 2 })
    .mockImplementationOnce(() => new Promise(resolve => { resolveMore = resolve; }))
    .mockResolvedValueOnce({ content: [makeProduct(3, 'Sản phẩm phục hồi')], number: 0, size: 12, totalElements: 1, totalPages: 1 });
  await renderAt('/products');
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Xem thêm'))!.click());
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Phục hồi')!.click());
  await act(async () => resolveMore({ content: [makeProduct(2, 'Trang cũ đến muộn')], number: 1, size: 12, totalElements: 2, totalPages: 2 }));
  expect(host.textContent).toContain('Sản phẩm phục hồi');
  expect(host.textContent).not.toContain('Trang cũ đến muộn');
});
