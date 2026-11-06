import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage } from '../../../shared/lib/errorMessage';
import { LoadingSkeleton } from '../../../shared/ui/LoadingSkeleton';
import { Modal } from '../../../shared/ui/Modal';
import { toast } from '../../../shared/ui/toast';
import { addToCart, useCart } from '../cart';
import { shopApi } from '../shopApi';
import { FORM_LABELS, formatVnd, pricePerServingLabel } from '../shopFormat';
import type {
  CategoryDto,
  Page,
  ProductDetailDto,
  ProductGoal,
  ProductSummaryDto,
} from '../shopTypes';
import { GoalChips } from './GoalChips';
import { NutritionFacts } from './NutritionFacts';
import { ProductCard } from './ProductCard';
import { ProductPackshot } from './ProductPackshot';
import { QuantityStepper } from './QuantityStepper';
import { ShopDisclaimer } from './ShopDisclaimer';
import { VariantPicker } from './VariantPicker';

import { Select } from '../../../shared/ui/Select';
const SORT_OPTIONS: Array<{ value: 'newest' | 'price_per_serving' | 'price_asc' | 'price_desc'; label: string }> = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'price_per_serving', label: 'Giá mỗi lần dùng' },
  { value: 'price_asc', label: 'Giá tăng dần' },
  { value: 'price_desc', label: 'Giá giảm dần' },
];

export function MemberShopCatalog({ onOpenCart }: { onOpenCart: () => void }) {
  const navigate = useNavigate();
  const cartLines = useCart();
  const cartCount = cartLines.reduce((sum, l) => sum + l.quantity, 0);

  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [q, setQ] = useState('');
  const [goal, setGoal] = useState<ProductGoal | ''>('');
  const [category, setCategory] = useState('');
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState<'newest' | 'price_per_serving' | 'price_asc' | 'price_desc'>('newest');
  const [page, setPage] = useState(0);

  const [data, setData] = useState<Page<ProductSummaryDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Quick-buy product modal state
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProductDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState<number>(0);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    shopApi
      .listCategories()
      .then(list => setCategories(Array.isArray(list) ? list : []))
      .catch(() => setCategories([]));
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await shopApi.listProducts({
        q: q.trim() || undefined,
        goal: goal || undefined,
        category: category || undefined,
        inStock: inStock || undefined,
        sort,
        page,
        size: 12,
      });
      setData(res);
    } catch (err) {
      setError(errorMessage(err, 'Không thể tải danh mục sản phẩm.'));
    } finally {
      setLoading(false);
    }
  }, [q, goal, category, inStock, sort, page]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const openProductModal = async (slug: string) => {
    setActiveSlug(slug);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    setQty(1);
    try {
      const d = await shopApi.getProduct(slug);
      setDetail(d);
      const firstAvail = d.variants.find(v => v.available && v.stock > 0) ?? d.variants[0];
      setSelectedVariantId(firstAvail ? firstAvail.id : 0);
    } catch (err) {
      setDetailError(errorMessage(err, 'Không thể tải chi tiết sản phẩm.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const selectedVariant =
    detail?.variants.find(v => v.id === selectedVariantId) ?? detail?.variants[0] ?? null;
  const canBuy = Boolean(selectedVariant && selectedVariant.available && selectedVariant.stock > 0);
  const maxQty = canBuy && selectedVariant ? Math.min(selectedVariant.stock, 20) : 1;

  const handleAddFromModal = () => {
    if (!canBuy || !selectedVariant) return;
    addToCart(selectedVariant.id, qty);
    toast.success('Đã thêm vào giỏ');
  };

  const handleBuyNowFromModal = () => {
    if (!canBuy || !selectedVariant) return;
    addToCart(selectedVariant.id, qty);
    setActiveSlug(null);
    navigate('/checkout');
  };

  return (
    <section className="stack" aria-label="Cửa hàng thực phẩm bổ sung">
      <div className="portal-card stack" style={{ gap: 14 }}>
        <div className="portal-shop-toolbar">
          <div className="shop-field">
            <label className="shop-sr-only" htmlFor="portal-shop-search">
              Tìm sản phẩm
            </label>
            <input
              id="portal-shop-search"
              type="search"
              className="shop-input"
              placeholder="Tìm whey, creatine, điện giải…"
              value={q}
              onChange={e => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </div>

          <div className="shop-field">
            <label className="shop-sr-only" htmlFor="portal-shop-category">
              Danh mục sản phẩm
            </label>
            <Select
              id="portal-shop-category"
              className="shop-select"
              aria-label="Danh mục sản phẩm"
              value={category}
              onChange={e => {
                setCategory(e.target.value);
                setPage(0);
              }}
            >
              <option value="">Tất cả danh mục</option>
              {categories.map(c => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="shop-field">
            <label className="shop-sr-only" htmlFor="portal-shop-sort">
              Sắp xếp
            </label>
            <Select
              id="portal-shop-sort"
              className="shop-select"
              aria-label="Sắp xếp sản phẩm"
              value={sort}
              onChange={e => {
                setSort(e.target.value as typeof sort);
                setPage(0);
              }}
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <label className="portal-shop-stock-toggle">
            <input
              type="checkbox"
              checked={inStock}
              onChange={e => {
                setInStock(e.target.checked);
                setPage(0);
              }}
            />
            <span>Còn hàng</span>
          </label>
        </div>

        <GoalChips
          value={goal}
          onChange={next => {
            setGoal((next ?? '') as ProductGoal | '');
            setPage(0);
          }}
        />
      </div>

      {loading ? (
        <LoadingSkeleton label="Đang tải kệ sản phẩm…" variant="cards" count={3} />
      ) : error ? (
        <div className="portal-alert" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void loadProducts()}>
            Thử lại
          </button>
        </div>
      ) : !data?.content.length ? (
        <div className="portal-card portal-state stack" style={{ alignItems: 'flex-start' }}>
          <p style={{ margin: 0 }}>Không tìm thấy sản phẩm phù hợp với bộ lọc.</p>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              setQ('');
              setGoal('');
              setCategory('');
              setInStock(false);
              setPage(0);
            }}
          >
            Xóa bộ lọc
          </button>
        </div>
      ) : (
        <>
          <div className="portal-shop-grid">
            {data.content.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onSelect={p => void openProductModal(p.slug)}
              />
            ))}
          </div>

          {data.totalPages > 1 && (
            <nav className="court-pagination" aria-label="Phân trang sản phẩm">
              <button
                type="button"
                className="btn-secondary"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                Trang trước
              </button>
              <span>
                Trang {page + 1} / {data.totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={page + 1 >= data.totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Trang sau
              </button>
            </nav>
          )}
        </>
      )}

      {cartCount > 0 && (
        <div className="portal-shop-cart-bar" role="region" aria-label="Tóm tắt giỏ hàng">
          <div>
            <strong>Giỏ hàng có {cartCount} sản phẩm</strong>
            <div className="muted" style={{ fontSize: 12 }}>
              Nhận tại quầy SÖL hoặc giao tận nơi
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={onOpenCart}>
              Xem giỏ hàng ({cartCount})
            </button>
            <Link to="/checkout" className="btn-primary">
              Thanh toán ngay
            </Link>
          </div>
        </div>
      )}

      {activeSlug && (
        <Modal
          title={detail ? detail.name : 'Chi tiết sản phẩm'}
          className="shop-product-dialog"
          onClose={() => setActiveSlug(null)}
        >
          {detailLoading ? (
            <LoadingSkeleton label="Đang tải chi tiết sản phẩm…" variant="rows" count={3} />
          ) : detailError ? (
            <div className="portal-alert" role="alert">
              <span>{detailError}</span>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => void openProductModal(activeSlug)}
              >
                Thử lại
              </button>
            </div>
          ) : (
            detail && (
              <div className="stack" style={{ gap: 16 }}>
                <div className="portal-shop-detail-grid">
                  <div>
                    <ProductPackshot
                      form={detail.form}
                      name={detail.name}
                      imageUrl={detail.images[0]?.url ?? null}
                      alt={detail.images[0]?.alt ?? detail.name}
                    />
                  </div>
                  <div className="stack" style={{ gap: 12 }}>
                    <span className="shop-card__kicker">
                      {detail.categoryName} · {FORM_LABELS[detail.form]}
                    </span>
                    <p style={{ margin: 0 }}>{detail.shortDescription}</p>

                    {selectedVariant && (
                      <div style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <strong style={{ fontSize: 22 }}>{formatVnd(selectedVariant.price)}</strong>
                        {selectedVariant.pricePerServing != null && (
                          <div className="shop-card__pps">
                            {pricePerServingLabel(selectedVariant.pricePerServing)}
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <VariantPicker
                        variants={detail.variants}
                        value={selectedVariant?.id ?? 0}
                        onChange={(id: number) => {
                          setSelectedVariantId(id);
                          const v = detail.variants.find(item => item.id === id);
                          if (v && v.stock > 0) {
                            setQty(prev => Math.min(prev, Math.min(v.stock, 20)));
                          }
                        }}
                      />
                    </div>

                    {selectedVariant &&
                      selectedVariant.available &&
                      selectedVariant.stock > 0 &&
                      selectedVariant.stock < 10 && (
                        <p className="shop-status-pill shop-status-pill--pending_payment" role="status" style={{ margin: 0, width: 'fit-content' }}>
                          Sắp hết · Còn {selectedVariant.stock} sản phẩm
                        </p>
                      )}

                    <div className="portal-shop-buy-actions">
                      <QuantityStepper
                        value={qty}
                        max={maxQty}
                        disabled={!canBuy}
                        onChange={setQty}
                        label={`Số lượng ${detail.name}`}
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={!canBuy}
                        onClick={handleAddFromModal}
                      >
                        {canBuy ? 'Thêm vào giỏ' : 'Hết hàng'}
                      </button>
                      {canBuy && (
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={handleBuyNowFromModal}
                        >
                          Mua ngay
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {detail.nutrients.length > 0 && (
                  <NutritionFacts
                    servingSize={detail.servingSize}
                    servings={selectedVariant?.servingsPerContainer ?? null}
                    nutrients={detail.nutrients}
                  />
                )}

                <ShopDisclaimer />
              </div>
            )
          )}
        </Modal>
      )}
    </section>
  );
}
