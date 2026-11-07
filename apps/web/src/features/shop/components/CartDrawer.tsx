import { useSourceLanguage, sourceFormat, sourceText, sourceError } from '../shopI18n';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCurrentUser } from '../../../shared/api/client';
import { LoadingSkeleton } from '../../../shared/ui/LoadingSkeleton';
import { Modal } from '../../../shared/ui/Modal';
import { RoundArrow } from '../../landing/components/PublicLayout';
import { removeFromCart, setQuantity, useCart } from '../cart';
import { shopApi } from '../shopApi';
import { formatVnd } from '../shopFormat';
import type { QuoteDto, QuoteLineDto } from '../shopTypes';
import { ProductPackshot } from './ProductPackshot';
import { QuantityStepper } from './QuantityStepper';
import { ShopDisclaimer } from './ShopDisclaimer';
import '../shop-public.css';

function lineProblemText(line: QuoteLineDto): string | null {
  switch (line.problem) {
    case 'INSUFFICIENT_STOCK':
      return sourceFormat("Chỉ còn {0} sản phẩm — vui lòng giảm số lượng", line.stock);
    case 'OUT_OF_STOCK':
      return 'Sản phẩm đã hết hàng';
    case 'INACTIVE':
    case 'NOT_FOUND':
      return 'Sản phẩm này không còn bán';
    default:
      return null;
  }
}

export function CartDrawer({
  onClose,
  returnFocusRef,
}: {
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  useSourceLanguage();
  const lines = useCart();
  const navigate = useNavigate();
  const [quote, setQuote] = useState<QuoteDto | null>(null);
  const [loading, setLoading] = useState(lines.length > 0);
  const [error, setError] = useState<string | Error>('');
  const [retryTick, setRetryTick] = useState(0);
  const firstQuote = useRef(true);

  const totalCount = lines.reduce((sum, l) => sum + l.quantity, 0);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    if (lines.length === 0) {
      setQuote(null);
      setLoading(false);
      setError('');
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError('');

    const runQuote = async () => {
      try {
        const res = await shopApi.quote(
          {
            items: lines.map(l => ({ variantId: l.variantId, quantity: l.quantity })),
            fulfillment: 'pickup',
          },
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setQuote(res);
          setLoading(false);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(sourceError(err, 'Không tải được báo giá giỏ hàng.'));
          setLoading(false);
        }
      }
    };

    const isTest = import.meta.env.MODE === 'test';
    if (firstQuote.current || isTest) {
      firstQuote.current = false;
      void runQuote();
      return () => controller.abort();
    }

    const timer = window.setTimeout(() => {
      void runQuote();
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [lines, retryTick]);

  const handleCheckout = () => {
    if (!quote?.valid || lines.length === 0) return;
    const user = getCurrentUser();
    onClose();
    navigate(user ? '/checkout' : '/login?returnTo=%2Fcheckout');
  };

  return (
    <Modal
      title={totalCount > 0 ? sourceFormat("Giỏ hàng ({0})", totalCount) : sourceText('Giỏ hàng')}
      onClose={onClose}
      className="shop-drawer"
      returnFocusRef={returnFocusRef}
    >
      <div className="shop-drawer__content" aria-busy={loading}>
        {lines.length === 0 ? (
          <div className="shop-drawer__empty" role="status">
            <p>{sourceText("Giỏ hàng đang trống.")}</p>
            <Link to="/products" className="fit-pill" onClick={onClose}>
              <span>{sourceText("Xem sản phẩm")}</span>
              <RoundArrow />
            </Link>
          </div>
        ) : (
          <>
            {loading && !quote && (
              <LoadingSkeleton label={sourceText("Đang tính giỏ hàng…")} variant="rows" count={Math.min(lines.length, 3)} />
            )}
            {loading && quote && <p className="shop-drawer__updating" role="status">{sourceText("Đang cập nhật giỏ hàng…")}</p>}
            {error && (
              <div className="shop-drawer__error" role="alert">
                <p>{sourceText(error)}</p>
                <button
                  type="button"
                  className="fit-pill"
                  onClick={() => {
                    firstQuote.current = true;
                    setRetryTick(t => t + 1);
                  }}
                >
                  {sourceText("Thử lại")}</button>
              </div>
            )}
            {quote && (
              <ul className="shop-drawer__list" aria-label={sourceText("Sản phẩm trong giỏ")}>
                {quote.lines.filter(line => lines.some(item => item.variantId === line.variantId)).map(line => {
                  const cartLine = lines.find(l => l.variantId === line.variantId);
                  const currentQty = cartLine?.quantity ?? line.requestedQuantity;
                  const problem = lineProblemText(line);
                  const maxQty = line.stock > 0 ? Math.min(line.stock, 20) : 20;
                  return (
                    <li key={line.variantId} className="shop-drawer__item">
                      <div className="shop-drawer__item-media">
                        <ProductPackshot
                          form="powder"
                          name={line.productName}
                          imageUrl={line.imageUrl}
                          alt={line.productName}
                          className="shop-drawer__packshot"
                        />
                      </div>
                      <div className="shop-drawer__item-body">
                        <div className="shop-drawer__item-top">
                          <Link
                            to={`/products/${line.slug}`}
                            className="shop-drawer__item-name"
                            onClick={onClose}
                          >
                            {line.productName}
                          </Link>
                          <span className="shop-drawer__item-price">{formatVnd(line.lineTotal)}</span>
                        </div>
                        <p className="shop-drawer__item-variant">
                          {line.variantLabel} · {formatVnd(line.unitPrice)}
                        </p>
                        <div className="shop-drawer__item-actions">
                          <QuantityStepper
                            value={currentQty}
                            max={maxQty}
                            onChange={next => setQuantity(line.variantId, next)}
                            label={sourceFormat("Số lượng {0}", line.productName)}
                          />
                          <button
                            type="button"
                            className="shop-drawer__remove"
                            onClick={() => removeFromCart(line.variantId)}
                          >
                            <span aria-hidden="true">{sourceText("Xóa")}</span>
                            <span className="shop-sr-only">{sourceText("Xóa")}{line.productName} · {line.variantLabel}</span>
                          </button>
                        </div>
                        {problem && (
                          <p className="shop-drawer__problem form-error" role="alert">
                            {sourceText(problem)}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="shop-drawer__footer">
              <div className="shop-drawer__subtotal">
                <span>{sourceText("Tạm tính")}</span>
                <strong aria-live="polite">{loading ? (quote ? sourceText('Đang cập nhật…') : sourceText('Đang tính…')) : error || !quote ? '—' : formatVnd(quote.subtotal)}</strong>
              </div>
              <p className="shop-drawer__shipping-note">{sourceText("Phí giao hàng được tính ở bước thanh toán.")}</p>
              <div className="shop-drawer__actions">
                <button
                  type="button"
                  className="fit-pill shop-drawer__checkout"
                  disabled={!quote?.valid || lines.length === 0 || loading || Boolean(error)}
                  onClick={handleCheckout}
                >
                  <span>{sourceText("Thanh toán")}</span>
                  <RoundArrow />
                </button>
                <Link to="/products" className="shop-drawer__continue" onClick={onClose}>
                  {sourceText("Tiếp tục xem sản phẩm")}</Link>
              </div>
            </div>
          </>
        )}
        <ShopDisclaimer className="shop-drawer__disclaimer" />
      </div>
    </Modal>
  );
}
