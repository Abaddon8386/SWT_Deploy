import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { shopApi } from '../../shop/shopApi';
import type { ProductSummaryDto } from '../../shop/shopTypes';
import { ProductShelf } from './ProductShelf';

vi.mock('../../shop/shopApi', () => ({
  shopApi: {
    listProducts: vi.fn(),
  },
}));

const sampleProduct: ProductSummaryDto = {
  id: 11,
  slug: 'sol-whey-isolate',
  name: 'SÖL Whey Isolate',
  categoryName: 'Whey',
  form: 'powder',
  goals: ['muscle_gain', 'recovery'],
  shortDescription: 'Đạm whey tách béo dễ pha.',
  imageUrl: null,
  highlight: { name: 'Đạm', amount: 25, unit: 'g' },
  minPrice: 1290000,
  pricePerServing: 18971,
  inStock: true,
  lowStock: false,
  featured: true,
  isNew: false,
  defaultVariantId: 101,
  variantCount: 1,
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

it('renders featured products on the shelf and filters by goal', async () => {
  vi.mocked(shopApi.listProducts).mockResolvedValue({
    content: [sampleProduct],
    number: 0,
    size: 3,
    totalElements: 1,
    totalPages: 1,
  });

  await act(async () => {
    root.render(
      <MemoryRouter>
        <ProductShelf />
      </MemoryRouter>,
    );
  });

  expect(shopApi.listProducts).toHaveBeenCalledWith({
    goal: '',
    size: 3,
    sort: 'newest',
    featuredFirst: true,
  });
  expect(host.querySelector('#products')).not.toBeNull();
  expect(host.textContent).toContain('FUEL THE WORK');
  expect(host.textContent).toContain('SÖL Whey Isolate');
  expect(host.querySelector('a[href="/products"]')?.textContent).toContain('Xem tất cả sản phẩm');

  const muscleChip = [...host.querySelectorAll('button')].find(b => b.textContent === 'Tăng cơ')!;
  await act(async () => {
    muscleChip.click();
  });

  expect(shopApi.listProducts).toHaveBeenLastCalledWith({
    goal: 'muscle_gain',
    size: 3,
    sort: 'newest',
    featuredFirst: true,
  });
});

it('shelf hides itself when there are no products on initial load', async () => {
  vi.mocked(shopApi.listProducts).mockResolvedValue({
    content: [],
    number: 0,
    size: 3,
    totalElements: 0,
    totalPages: 0,
  });

  await act(async () => {
    root.render(
      <MemoryRouter>
        <ProductShelf />
      </MemoryRouter>,
    );
  });

  expect(host.querySelector('#products')).toBeNull();
});

it('shelf shows retry on error and reloads when clicked', async () => {
  vi.mocked(shopApi.listProducts)
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce({
      content: [sampleProduct],
      number: 0,
      size: 3,
      totalElements: 1,
      totalPages: 1,
    });

  await act(async () => {
    root.render(
      <MemoryRouter>
        <ProductShelf />
      </MemoryRouter>,
    );
  });

  const retryBtn = [...host.querySelectorAll('button')].find(b => b.textContent === 'Thử lại')!;
  expect(retryBtn).toBeDefined();

  await act(async () => {
    retryBtn.click();
  });

  expect(host.textContent).toContain('SÖL Whey Isolate');
});
