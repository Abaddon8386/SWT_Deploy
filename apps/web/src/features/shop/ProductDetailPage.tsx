import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { ApiError } from '../../shared/api/client';
import { toast } from '../../shared/ui/toast';
import { PublicLayout, RoundArrow } from '../landing/components/PublicLayout';
import { addToCart } from './cart';
import { NutritionFacts } from './components/NutritionFacts';
import { ProductCard } from './components/ProductCard';
import { ProductPackshot } from './components/ProductPackshot';
import { QuantityStepper } from './components/QuantityStepper';
import { ShopDisclaimer } from './components/ShopDisclaimer';
import { VariantPicker } from './components/VariantPicker';
import { shopApi } from './shopApi';
import { FORM_LABELS, formatVnd, GOAL_LABELS, pricePerServingLabel } from './shopFormat';
import type { ProductDetailDto } from './shopTypes';
import './shop-public.css';

export function ProductDetailPage() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<ProductDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(1);
  const [activeImageIdx, setActiveImageIdx] = useState<number>(0);

  useEffect(() => {
    if (!slug) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setNotFound(false);
    setError(false);
    setProduct(null);
    setActiveImageIdx(0);
    setQuantity(1);

    shopApi
      .getProduct(slug)
      .then(detail => {
        if (!active) return;
        if (!detail) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setProduct(detail);
        const firstAvailable = detail.variants.find(v => v.available && v.stock > 0) ?? detail.variants[0];
        setSelectedVariantId(firstAvailable?.id ?? 0);
        document.title = `${detail.name} · SÖL Fitness`;
        setLoading(false);
      })
      .catch(err => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(true);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug, retryTick]);

  const selectedVariant =
    product?.variants.find(v => v.id === selectedVariantId) ?? product?.variants[0] ?? null;

  const canBuy = Boolean(selectedVariant && selectedVariant.available && selectedVariant.stock > 0);
  const maxQty = canBuy && selectedVariant ? Math.min(selectedVariant.stock, 20) : 1;
  const effectiveQty = Math.max(1, Math.min(quantity, maxQty));

  const handleVariantChange = (nextId: number) => {
    setSelectedVariantId(nextId);
    const nextVariant = product?.variants.find(v => v.id === nextId);
    if (nextVariant && nextVariant.stock > 0) {
      const cap = Math.min(nextVariant.stock, 20);
      setQuantity(prev => Math.max(1, Math.min(prev, cap)));
    }
  };

  const handleAddToCart = () => {
    if (!canBuy || !selectedVariant) return;
    addToCart(selectedVariant.id, effectiveQty);
    toast('Đã thêm vào giỏ');
  };

  const handleBuyNow = () => {
    if (!canBuy || !selectedVariant) return;
    addToCart(selectedVariant.id, effectiveQty);
    navigate('/checkout');
  };

  const activeImage = product?.images?.[activeImageIdx] ?? product?.images?.[0] ?? null;
  const ppsLabel = selectedVariant ? pricePerServingLabel(selectedVariant.pricePerServing) : '';

  return (
    <PublicLayout>
      <main id="public-main" className="fit-shop-page">
        <section className="fit-section shop-detail" aria-labelledby="product-detail-title">
          {loading ? (
            <LoadingSkeleton label="Đang tải chi tiết sản phẩm…" variant="cards" count={2} />
          ) : error ? (
            <div className="fit-catalog-state" role="alert">
              <h1 id="product-detail-title">Không tải được chi tiết sản phẩm.</h1>
              <button type="button" className="fit-pill" onClick={() => setRetryTick(t => t + 1)}>Thử lại</button>
              <Link to="/products" className="fit-text-link">Xem tất cả sản phẩm</Link>
            </div>
          ) : notFound || !product ? (
            <div className="fit-catalog-state shop-detail__empty" role="status">
              <h1 id="product-detail-title">Sản phẩm này không còn bán.</h1>
              <Link to="/products" className="fit-pill">
                <span>Xem tất cả sản phẩm</span>
                <RoundArrow />
              </Link>
            </div>
          ) : (
            <>
              <nav className="shop-detail__breadcrumb" aria-label="Đường dẫn sản phẩm">
                <Link to="/products" className="fit-text-link">
                  ← Sản phẩm
                </Link>
                <span aria-hidden="true">/</span>
                <Link to={`/products?category=${encodeURIComponent(product.categorySlug)}`} className="fit-text-link">
                  {product.categoryName}
                </Link>
              </nav>

              <div className="shop-detail__hero">
                <div className="shop-detail__gallery" data-reveal="image">
                  <div className="shop-detail__stage">
                    <ProductPackshot
                      form={product.form}
                      name={product.name}
                      imageUrl={activeImage?.url ?? null}
                      alt={activeImage?.alt ?? product.name}
                      className="shop-detail__packshot"
                    />
                  </div>
                  {product.images.length > 1 && (
                    <div className="shop-detail__thumbs" role="group" aria-label="Ảnh sản phẩm">
                      {product.images.map((img, idx) => (
                        <button
                          key={img.id}
                          type="button"
                          className={`shop-detail__thumb${idx === activeImageIdx ? ' is-active' : ''}`}
                          aria-pressed={idx === activeImageIdx}
                          aria-label={img.alt || `Ảnh ${idx + 1}`}
                          onClick={() => setActiveImageIdx(idx)}
                        >
                          <img src={img.url} alt={img.alt} loading="lazy" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="shop-detail__summary" data-reveal="soft">
                  <span className="fit-kicker">
                    {product.categoryName} · {FORM_LABELS[product.form] ?? product.form}
                  </span>
                  <h1 id="product-detail-title" className="shop-detail__title">
                    {product.name}
                  </h1>
                  <p className="shop-detail__lead">{product.shortDescription}</p>
                  {product.goals.length > 0 && (
                    <p className="shop-detail__goals">
                      <strong>Mục tiêu:</strong> {product.goals.map(g => GOAL_LABELS[g] ?? g).join(' · ')}
                    </p>
                  )}

                  <VariantPicker
                    variants={product.variants}
                    value={selectedVariant?.id ?? 0}
                    onChange={handleVariantChange}
                  />

                  {selectedVariant && (
                    <div className="shop-detail__pricing">
                      <strong className="shop-detail__price">{formatVnd(selectedVariant.price)}</strong>
                      {(ppsLabel || selectedVariant.servingsPerContainer) && (
                        <span className="shop-detail__pps">
                          {ppsLabel}
                          {ppsLabel && selectedVariant.servingsPerContainer ? ' · ' : ''}
                          {selectedVariant.servingsPerContainer ? `${selectedVariant.servingsPerContainer} lần` : ''}
                        </span>
                      )}
                    </div>
                  )}

                  {selectedVariant &&
                    selectedVariant.available &&
                    selectedVariant.stock > 0 &&
                    selectedVariant.stock < 10 && (
                      <p className="shop-detail__low-stock" role="status">
                        Còn {selectedVariant.stock} sản phẩm
                      </p>
                    )}

                  <div className="shop-detail__buy-row">
                    <QuantityStepper
                      value={effectiveQty}
                      max={maxQty}
                      onChange={setQuantity}
                      label="Số lượng"
                      disabled={!canBuy}
                    />
                    {canBuy ? (
                      <>
                        <button type="button" className="fit-pill shop-detail__add" onClick={handleAddToCart}>
                          <span>Thêm vào giỏ</span>
                        </button>
                        <button type="button" className="fit-pill shop-detail__buy-now" onClick={handleBuyNow}>
                          <span>Mua ngay</span>
                          <RoundArrow />
                        </button>
                      </>
                    ) : (
                      <button type="button" className="fit-pill" disabled>
                        <span>Hết hàng</span>
                      </button>
                    )}
                  </div>

                  <p className="shop-detail__fulfillment-note">
                    Nhận tại quầy miễn phí · Giao toàn quốc 30.000đ, miễn phí từ 500.000đ
                  </p>

                  <ShopDisclaimer className="shop-detail__disclaimer" />
                </div>
              </div>

              <div className="shop-detail__info-grid" data-reveal="soft">
                <div className="shop-detail__facts-col">
                  <NutritionFacts
                    servingSize={product.servingSize}
                    servings={selectedVariant?.servingsPerContainer ?? null}
                    nutrients={product.nutrients}
                  />
                </div>
                <div className="shop-detail__copy-col">
                  {product.description && (
                    <div className="shop-detail__block">
                      <h2>Mô tả sản phẩm</h2>
                      <p>{product.description}</p>
                    </div>
                  )}
                  {product.usageInstructions && (
                    <div className="shop-detail__block">
                      <h2>Cách dùng</h2>
                      <p>{product.usageInstructions}</p>
                    </div>
                  )}
                  {product.warnings && (
                    <div className="shop-detail__block">
                      <h2>Lưu ý</h2>
                      <p>{product.warnings}</p>
                    </div>
                  )}
                  {product.registrationNumber && (
                    <p className="shop-detail__reg">Số công bố: {product.registrationNumber}</p>
                  )}
                </div>
              </div>

              {product.related && product.related.length > 0 && (
                <div className="shop-detail__related" data-reveal="soft">
                  <h2 className="shop-detail__related-title">Cùng loại</h2>
                  <div className="shop-grid">
                    {product.related.map(rel => (
                      <ProductCard key={rel.id} product={rel} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </PublicLayout>
  );
}
