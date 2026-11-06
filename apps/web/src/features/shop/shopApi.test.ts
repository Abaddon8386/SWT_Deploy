import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../../shared/api/client';
import { shopApi } from './shopApi';

vi.mock('../../shared/api/client', () => ({
  apiFetch: vi.fn(),
}));

describe('shopApi', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('keeps empty catalogs and propagates failures in production instead of inventing products or quotes', async () => {
    vi.stubEnv('MODE', 'production');
    const empty = { content: [], number: 0, size: 12, totalElements: 0, totalPages: 0 };
    vi.mocked(client.apiFetch).mockResolvedValue(empty);
    expect(await shopApi.listProducts()).toEqual(empty);
    expect(await shopApi.manager.listProducts()).toEqual(empty);
    vi.mocked(client.apiFetch).mockRejectedValue(new Error('Offline'));
    await expect(shopApi.listProducts()).rejects.toThrow('Offline');
    await expect(shopApi.getProduct('sol-whey-isolate')).rejects.toThrow('Offline');
    await expect(shopApi.quote({ items: [{ variantId: 101, quantity: 1 }], fulfillment: 'pickup' })).rejects.toThrow('Offline');
    await expect(shopApi.manager.getProduct(1)).rejects.toThrow('Offline');
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.apiFetch).mockResolvedValue(null);
  });

  it('clears Authorization header on public endpoints and serializes product filters', async () => {
    await shopApi.listProducts({
      q: '  whey ',
      goal: 'muscle_gain',
      category: 'whey',
      inStock: true,
      featuredFirst: true,
      sort: 'price_per_serving',
      page: 1,
      size: 12,
    });

    expect(client.apiFetch).toHaveBeenCalledWith(
      '/public/products?q=whey&goal=muscle_gain&category=whey&inStock=true&featuredFirst=true&sort=price_per_serving&page=1&size=12',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: '' }),
      }),
    );

    await shopApi.getProduct('sol-whey-isolate');
    expect(client.apiFetch).toHaveBeenCalledWith(
      '/public/products/sol-whey-isolate',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: '' }),
      }),
    );

    await shopApi.quote({ items: [{ variantId: 1, quantity: 2 }], fulfillment: 'delivery' });
    expect(client.apiFetch).toHaveBeenCalledWith(
      '/public/shop/quote',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ items: [{ variantId: 1, quantity: 2 }], fulfillment: 'delivery' }),
        headers: expect.objectContaining({ Authorization: '' }),
      }),
    );
  });

  it('calls member address and order endpoints with proper HTTP methods', async () => {
    const addr = {
      recipientName: 'Nguyễn An',
      phone: '0901234567',
      provinceCode: '79',
      wardCode: '26734',
      streetLine: '12 Lê Lợi',
      makeDefault: true,
    };

    await shopApi.saveAddress(addr);
    expect(client.apiFetch).toHaveBeenCalledWith('/shop/addresses', {
      method: 'POST',
      body: JSON.stringify(addr),
    });

    await shopApi.saveAddress(addr, 5);
    expect(client.apiFetch).toHaveBeenCalledWith('/shop/addresses/5', {
      method: 'PUT',
      body: JSON.stringify(addr),
    });

    await shopApi.createOrder({
      clientRequestId: 'uuid-1',
      items: [{ variantId: 1, quantity: 2 }],
      fulfillment: 'pickup',
      paymentMethod: 'online',
      expectedTotal: 2580000,
    });
    expect(client.apiFetch).toHaveBeenCalledWith('/shop/orders', {
      method: 'POST',
      body: JSON.stringify({
        clientRequestId: 'uuid-1',
        items: [{ variantId: 1, quantity: 2 }],
        fulfillment: 'pickup',
        paymentMethod: 'online',
        expectedTotal: 2580000,
      }),
    });
  });

  it('calls staff and manager endpoints', async () => {
    await shopApi.staff.ship(9, { carrier: 'GHN', trackingNumber: 'GHN123' });
    expect(client.apiFetch).toHaveBeenCalledWith('/staff/product-orders/9/ship', {
      method: 'POST',
      body: JSON.stringify({ carrier: 'GHN', trackingNumber: 'GHN123' }),
    });

    await shopApi.manager.adjustStock(14, { delta: 10, reason: 'restock', note: 'Nhập lô mới' });
    expect(client.apiFetch).toHaveBeenCalledWith('/manager/product-variants/14/stock-adjustments', {
      method: 'POST',
      body: JSON.stringify({ delta: 10, reason: 'restock', note: 'Nhập lô mới' }),
    });
  });
});
