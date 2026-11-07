import { setLanguage } from '../../../shared/i18n';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCart, getCart } from '../cart';
import { formatVnd } from '../shopFormat';
import type { ProductSummaryDto } from '../shopTypes';
import { ProductCard } from './ProductCard';

let host: HTMLDivElement;
let root: Root;

const baseProduct: ProductSummaryDto = {
  id: 10,
  slug: 'sol-whey-isolate',
  name: 'SÖL Whey Isolate',
  categoryName: 'Whey',
  form: 'powder',
  goals: ['muscle_gain'],
  shortDescription: 'Đạm whey tách béo',
  imageUrl: null,
  highlight: { name: 'Đạm', amount: 25, unit: 'g' },
  minPrice: 1290000,
  pricePerServing: 18971,
  inStock: true,
  lowStock: true,
  featured: true,
  isNew: true,
  defaultVariantId: 101,
  variantCount: 1,
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  clearCart();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.querySelectorAll('.sol-toast').forEach((el) => el.remove());
  vi.unstubAllGlobals();
});

describe('ProductCard', () => {
  it('uses a packshot when no real photo exists and requires a real variant ID to add', async () => {
    await act(async () => root.render(<MemoryRouter><ProductCard product={{ ...baseProduct, defaultVariantId: null }} /></MemoryRouter>));
    expect(host.querySelector('.shop-packshot__svg')).not.toBeNull();
    expect(host.querySelector('a.shop-card__cta')?.textContent).toBe('Chọn loại');
    expect(getCart()).toEqual([]);
  });
  it('shows price per serving, real badges, adds to cart and triggers toast', async () => {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <ProductCard product={baseProduct} />
        </MemoryRouter>,
      ),
    );

    const card = host.querySelector('article.shop-card')!;
    expect(card.getAttribute('data-reveal')).toBe('lift');
    expect(card.textContent).toContain('Whey · Bột');
    expect(card.textContent).toContain('25 g đạm');
    expect(card.textContent).toContain('18.971');
    expect(card.textContent).toContain('lần dùng');
    expect(card.textContent).toContain('Sắp hết');
    expect(card.textContent).toContain('Mới');

    const btn = card.querySelector<HTMLButtonElement>('button.shop-card__cta')!;
    expect(btn.textContent).toBe('Thêm vào giỏ');
    await act(async () => btn.click());

    expect(getCart()).toEqual([{ variantId: 101, quantity: 1 }]);
    expect(document.querySelector('.sol-toast')?.textContent).toContain('Đã thêm vào giỏ');
  });

  it('disables add button when out of stock', async () => {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <ProductCard product={{ ...baseProduct, inStock: false, lowStock: false }} />
        </MemoryRouter>,
      ),
    );

    const btn = host.querySelector<HTMLButtonElement>('button.shop-card__cta')!;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Hết hàng');
  });

  it('renders Chọn loại link when multiple variants exist without defaultVariantId', async () => {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <ProductCard
            product={{ ...baseProduct, variantCount: 3, defaultVariantId: null }}
          />
        </MemoryRouter>,
      ),
    );

    expect(host.textContent).toContain(formatVnd(baseProduct.minPrice));
    expect(host.textContent).not.toContain('Từ ');
    const ctaLink = host.querySelector('a.shop-card__cta')!;
    expect(ctaLink.textContent).toBe('Chọn loại');
    expect(ctaLink.getAttribute('href')).toBe('/products/sol-whey-isolate');
  });
});


it('switches all source card chrome VI → EN → VI and preserves product data', async () => {
  await act(async () => root.render(<MemoryRouter><ProductCard product={baseProduct} /></MemoryRouter>));
  expect(host.textContent).toContain('Thêm vào giỏ');
  await act(async () => setLanguage('en'));
  expect(host.textContent).toContain('Add to cart');
  expect(host.textContent).toContain('Low stock');
  expect(host.textContent).toContain('Powder');
  expect(host.textContent).toContain('/ serving');
  expect(host.textContent).toContain('đạm');
  expect(host.textContent).toContain(baseProduct.name);
  await act(async () => host.querySelector<HTMLButtonElement>('button.shop-card__cta')!.click());
  expect(document.querySelector('.sol-toast')?.textContent).toContain('Added to cart');
  await act(async () => setLanguage('vi'));
  expect(host.textContent).toContain('Thêm vào giỏ');
  expect(host.textContent).toContain('Bột');
  expect(document.querySelector('.sol-toast')?.textContent).toContain('Đã thêm vào giỏ');
});
