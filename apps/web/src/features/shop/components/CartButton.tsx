import { useSourceLanguage, sourceFormat } from "../shopI18n";
import { useEffect, useRef, useState } from 'react';
import { useCart } from '../cart';
import { CartDrawer } from './CartDrawer';
import '../shop-public.css';

export function CartButton() {
  useSourceLanguage();
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
        aria-label={sourceFormat("Giỏ hàng · {0} sản phẩm", count)}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="9" cy="20" r="1.4" />
          <circle cx="18" cy="20" r="1.4" />
          <path d="M2.5 3.5h2.6l2.3 11.2a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.55-1.2L20.8 8H6" />
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
