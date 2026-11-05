import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AUTH_STORAGE_KEY } from '../../../shared/api/client';
import { PublicLayout } from '../../landing/components/PublicLayout';
import { addToCart, clearCart } from '../cart';
import { shopApi } from '../shopApi';
import type { QuoteDto, QuoteProblem } from '../shopTypes';
import { CartDrawer } from './CartDrawer';

vi.mock('../shopApi', () => ({
  shopApi: {
    quote: vi.fn(),
  },
}));

let host: HTMLDivElement;
let root: Root;

function buildQuote(overrides: { valid?: boolean; problem?: QuoteProblem; stock?: number } = {}): QuoteDto {
  const { valid = true, problem = null, stock = 10 } = overrides;
  return {
    lines: [
      {
        variantId: 1,
        productName: 'SÖL Whey Isolate',
        variantLabel: 'Sô-cô-la · 2,27 kg',
        slug: 'sol-whey-isolate',
        imageUrl: null,
        unitPrice: 1290000,
        requestedQuantity: 2,
        quantity: Math.min(2, stock),
        stock,
        lineTotal: 1290000 * Math.min(2, stock),
        problem,
      },
    ],
    subtotal: 1290000 * Math.min(2, stock),
    shippingFee: 0,
    total: 1290000 * Math.min(2, stock),
    valid,
  };
}

function LocationProbe() {
  const loc = useLocation();
  return <output data-testid="loc">{loc.pathname + loc.search}</output>;
}

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
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
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

it('header shows a Sản phẩm route link and a cart button with live count', async () => {
  addToCart(1, 2);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/products']}>
        <PublicLayout>
          <main id="public-main">Nội dung</main>
        </PublicLayout>
      </MemoryRouter>,
    );
  });

  const navLink = [...host.querySelectorAll('.fit-nav a')].find(a => a.textContent === 'Sản phẩm');
  expect(navLink?.getAttribute('href')).toBe('/products');
  expect(navLink?.getAttribute('aria-current')).toBe('page');
  expect(navLink?.hasAttribute('data-nav-target')).toBe(false);
  expect(host.querySelector('button[aria-label="Giỏ hàng · 2 sản phẩm"]')).not.toBeNull();
});

it('drawer quotes the cart, flags short stock and blocks checkout while invalid', async () => {
  addToCart(1, 2);
  vi.mocked(shopApi.quote).mockResolvedValue(
    buildQuote({ valid: false, problem: 'INSUFFICIENT_STOCK', stock: 1 }),
  );

  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/']}>
        <CartDrawer onClose={() => {}} />
      </MemoryRouter>,
    );
  });

  expect(host.textContent).toContain('Chỉ còn 1 sản phẩm');
  expect(host.textContent).toContain(
    'Thực phẩm này không phải là thuốc và không có tác dụng thay thế thuốc chữa bệnh.',
  );
  const checkoutBtn = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Thanh toán'))!;
  expect(checkoutBtn.disabled).toBe(true);
});

it('checkout from the drawer sends guests to login with returnTo=/checkout', async () => {
  addToCart(1, 2);
  vi.mocked(shopApi.quote).mockResolvedValue(buildQuote({ valid: true }));
  const onClose = vi.fn();

  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/products']}>
        <CartDrawer onClose={onClose} />
        <LocationProbe />
      </MemoryRouter>,
    );
  });

  const checkoutBtn = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Thanh toán'))!;
  expect(checkoutBtn.disabled).toBe(false);
  await act(async () => {
    checkoutBtn.click();
  });

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[data-testid="loc"]')?.textContent).toBe('/login?returnTo=%2Fcheckout');
});

it('checkout from the drawer sends signed-in members directly to /checkout', async () => {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ id: '1', name: 'Member', identifier: 'm', role: 'MEMBER' }));
  addToCart(1, 2);
  vi.mocked(shopApi.quote).mockResolvedValue(buildQuote({ valid: true }));

  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/products']}>
        <CartDrawer onClose={() => {}} />
        <LocationProbe />
      </MemoryRouter>,
    );
  });

  const checkoutBtn = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Thanh toán'))!;
  await act(async () => {
    checkoutBtn.click();
  });

  expect(host.querySelector('[data-testid="loc"]')?.textContent).toBe('/checkout');
});
