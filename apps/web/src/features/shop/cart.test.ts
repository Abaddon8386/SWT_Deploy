import { beforeEach, describe, expect, it } from 'vitest';
import { addToCart, CART_LIMITS, cartCount, clearCart, getCart, removeFromCart, setQuantity } from './cart';

describe('cart store', () => {
  beforeEach(() => {
    localStorage.clear();
    clearCart();
  });

  it('merges the same variant and caps each line at 20', () => {
    addToCart(7, 15);
    addToCart(7, 10);
    expect(getCart()).toEqual([{ variantId: 7, quantity: CART_LIMITS.maxQuantity }]);
    expect(cartCount()).toBe(20);
  });

  it('ignores corrupt storage instead of crashing', () => {
    localStorage.setItem('scms_cart_v1', '{oops');
    expect(getCart()).toEqual([]);
  });

  it('filters out invalid entries from localStorage', () => {
    localStorage.setItem(
      'scms_cart_v1',
      JSON.stringify([
        { variantId: -1, quantity: 2 },
        { variantId: 5, quantity: 0 },
        { variantId: 8, quantity: 25 },
      ]),
    );
    expect(getCart()).toEqual([{ variantId: 8, quantity: 20 }]);
  });

  it('removes a line when quantity drops below 1 and refuses a 31st line', () => {
    addToCart(1, 1);
    setQuantity(1, 0);
    expect(getCart()).toEqual([]);
    for (let id = 1; id <= 31; id++) {
      addToCart(id, 1);
    }
    expect(getCart()).toHaveLength(CART_LIMITS.maxLines);
  });

  it('syncs from another tab via the storage event', () => {
    localStorage.setItem('scms_cart_v1', JSON.stringify([{ variantId: 3, quantity: 2 }]));
    window.dispatchEvent(new StorageEvent('storage', { key: 'scms_cart_v1' }));
    expect(getCart()).toEqual([{ variantId: 3, quantity: 2 }]);
    removeFromCart(3);
    expect(cartCount()).toBe(0);
  });
});
