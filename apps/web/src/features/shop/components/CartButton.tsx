import { useEffect, useRef, useState } from 'react';
import { useCart } from '../cart';
import { CartDrawer } from './CartDrawer';
import '../shop-public.css';

export function CartButton() {
  const lines = useCart();
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const [open, setOpen] = useState(false);
  const [bumped, setBumped] = useState(false);
  const prevCount = useRef(count);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const increased = count > prevCount.current;
    prevCount.current = count;
    if (!increased) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    setBumped(true);
    const timer = window.setTimeout(() => setBumped(false), 180);
    return () => window.clearTimeout(timer);
  }, [count]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`shop-cart-btn fit-cart-btn${bumped ? ' is-bumped' : ''}`}
        aria-label={`Giỏ hàng · ${count} sản phẩm`}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5.5 6.5h9l.9 9.5a1.5 1.5 0 0 1-1.5 1.65H6.1A1.5 1.5 0 0 1 4.6 16l.9-9.5Z" />
          <path d="M7.5 6.5V5a2.5 2.5 0 0 1 5 0v1.5" />
        </svg>
        {count > 0 && (
          <span className={`shop-cart-btn__badge fit-cart-badge${bumped ? ' is-bumped' : ''}`} aria-hidden="true">
            {count}
          </span>
        )}
      </button>
      {open && <CartDrawer onClose={() => setOpen(false)} returnFocusRef={btnRef} />}
    </>
  );
}
