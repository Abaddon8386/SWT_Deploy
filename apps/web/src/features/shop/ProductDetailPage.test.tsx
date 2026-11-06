import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearCart, getCart } from './cart';
import { ApiError } from '../../shared/api/client';
import { ProductDetailPage } from './ProductDetailPage';
import { shopApi } from './shopApi';
import type { ProductDetailDto } from './shopTypes';

vi.mock('./shopApi', () => ({
  shopApi: {
    getProduct: vi.fn(),
  },
}));

const sampleDetail: ProductDetailDto = {
  id: 10,
  slug: 'sol-whey-isolate',
  name: 'SÖL Whey Isolate',
  brand: 'SÖL Nutrition',
  categoryName: 'Whey',
  categorySlug: 'whey',
  form: 'powder',
  goals: ['muscle_gain', 'recovery'],
  shortDescription: 'Đạm whey tách béo dễ pha, vị nhẹ.',
  description: 'Đạm whey tách béo lọc lạnh.',
  servingSize: '1 muỗng (33 g)',
  usageInstructions: 'Pha 1 muỗng với 250 ml nước.',
  warnings: 'Không dùng cho người mẫn cảm với sữa.',
  registrationNumber: null,
  images: [],
  variants: [
    {
      id: 101,
      sku: 'SOL-WHEY-227',
      label: 'Sô-cô-la · 2,27 kg',
      price: 1290000,
      servingsPerContainer: 68,
      pricePerServing: 18971,
      stock: 10,
      available: true,
    },
    {
      id: 102,
      sku: 'SOL-WHEY-907',
      label: 'Vani · 907 g',
      price: 690000,
      servingsPerContainer: 30,
      pricePerServing: 23000,
      stock: 3,
      available: true,
    },
    {
      id: 103,
      sku: 'SOL-WHEY-OUT',
      label: 'Dâu · 907 g',
      price: 690000,
      servingsPerContainer: 30,
      pricePerServing: 23000,
      stock: 0,
      available: false,
    },
  ],
  nutrients: [
    { name: 'Năng lượng', amount: 130, unit: 'kcal', dailyValuePercent: null, subRow: false, highlight: false },
    { name: 'Đạm', amount: 25, unit: 'g', dailyValuePercent: 50, subRow: false, highlight: true },
  ],
  related: [],
};

function LocationProbe() {
  const loc = useLocation();
  return <output data-testid="loc">{loc.pathname}</output>;
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

const renderAt = (path: string) =>
  act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/products/:slug"
            element={
              <>
                <ProductDetailPage />
                <LocationProbe />
              </>
            }
          />
          <Route path="/checkout" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });

it('detail updates price per serving when switching variant and caps quantity at stock', async () => {
  vi.mocked(shopApi.getProduct).mockResolvedValue(sampleDetail);

  await renderAt('/products/sol-whey-isolate');

  expect(host.textContent).toContain('18.971');
  expect(host.textContent).toContain('68 lần');

  const incBtn = host.querySelector('button[aria-label="Tăng số lượng"]') as HTMLButtonElement;
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      incBtn.click();
    });
  }

  const radios = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  const vaniRadio = radios.find(r => r.parentElement?.textContent?.includes('Vani · 907 g')) ?? radios[1];
  await act(async () => {
    vaniRadio.click();
  });

  expect(host.textContent).toContain('23.000');
  expect(host.textContent).toContain('30 lần');
  expect(host.textContent).toContain('Còn 3 sản phẩm');

  const qtyInput = host.querySelector<HTMLInputElement>('input[type="number"]')!;
  expect(Number(qtyInput.value)).toBe(3);
});

it('detail Mua ngay adds to cart and goes to /checkout', async () => {
  vi.mocked(shopApi.getProduct).mockResolvedValue(sampleDetail);

  await renderAt('/products/sol-whey-isolate');

  const buyNowBtn = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Mua ngay'))!;
  await act(async () => {
    buyNowBtn.click();
  });

  expect(getCart()).toEqual([{ variantId: 101, quantity: 1 }]);
  expect(host.querySelector('[data-testid="loc"]')?.textContent).toBe('/checkout');
});

it('unknown slug shows Sản phẩm này không còn bán with a link back', async () => {
  vi.mocked(shopApi.getProduct).mockRejectedValue(new ApiError('Not found', 404));

  await renderAt('/products/missing-slug');

  expect(host.textContent).toContain('Sản phẩm này không còn bán.');
  expect(host.querySelector('a[href="/products"]')).not.toBeNull();
});

it('shows a retryable error for a network failure instead of a missing product', async () => {
  vi.mocked(shopApi.getProduct).mockRejectedValueOnce(new Error('Network error'));
  await renderAt('/products/sol-whey-isolate');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Không tải được');
  expect(host.textContent).not.toContain('Sản phẩm này không còn bán.');
  vi.mocked(shopApi.getProduct).mockResolvedValue(sampleDetail);
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Thử lại')!.click());
  expect(host.querySelector('#product-detail-title')?.textContent).toBe(sampleDetail.name);
});

it('detail always renders the legal disclaimer', async () => {
  vi.mocked(shopApi.getProduct).mockResolvedValue(sampleDetail);

  await renderAt('/products/sol-whey-isolate');

  expect(host.textContent).toContain(
    'Thực phẩm này không phải là thuốc và không có tác dụng thay thế thuốc chữa bệnh.',
  );
  expect(host.querySelector('.shop-facts table caption')?.textContent).toContain('Thành phần dinh dưỡng');
});
