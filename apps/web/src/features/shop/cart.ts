import { useSyncExternalStore } from 'react';

export interface CartLine {
  variantId: number;
  quantity: number;
}

export const CART_LIMITS = { maxLines: 30, maxQuantity: 20 } as const;
const KEY = 'scms_cart_v1';
let lines: CartLine[] = read();
const listeners = new Set<() => void>();

function read(): CartLine[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (l): l is CartLine =>
          Number.isSafeInteger((l as CartLine)?.variantId) &&
          (l as CartLine).variantId > 0 &&
          Number.isSafeInteger((l as CartLine)?.quantity) &&
          (l as CartLine).quantity > 0,
      )
      .slice(0, CART_LIMITS.maxLines)
      .map(l => ({ variantId: l.variantId, quantity: Math.min(l.quantity, CART_LIMITS.maxQuantity) }));
  } catch {
    return [];
  }
}

function commit(next: CartLine[]) {
  lines = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* giỏ vẫn chạy trong phiên */
  }
  listeners.forEach(l => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === KEY || e.key === null) {
      lines = read();
      listeners.forEach(l => l());
    }
  });
}

export const getCart = (): CartLine[] => {
  const fromStorage = read();
  if (JSON.stringify(fromStorage) !== JSON.stringify(lines)) {
    lines = fromStorage;
  }
  return lines;
};

export const cartCount = (): number => getCart().reduce((n, l) => n + l.quantity, 0);

export function addToCart(variantId: number, quantity = 1): void {
  const current = getCart();
  const found = current.find(l => l.variantId === variantId);
  if (found) return setQuantity(variantId, found.quantity + quantity);
  if (current.length >= CART_LIMITS.maxLines) return;
  commit([...current, { variantId, quantity: Math.min(Math.max(1, quantity), CART_LIMITS.maxQuantity) }]);
}

export function setQuantity(variantId: number, quantity: number): void {
  if (quantity < 1) return removeFromCart(variantId);
  const current = getCart();
  commit(
    current.map(l => (l.variantId === variantId ? { ...l, quantity: Math.min(quantity, CART_LIMITS.maxQuantity) } : l)),
  );
}

export const removeFromCart = (variantId: number): void => commit(getCart().filter(l => l.variantId !== variantId));

export const clearCart = (): void => commit([]);

export function useCart(): CartLine[] {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getCart,
    getCart,
  );
}
