import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { PublicLayout } from '../landing/components/PublicLayout';
import { GoalChips } from './components/GoalChips';
import { ProductCard } from './components/ProductCard';
import { ShopDisclaimer } from './components/ShopDisclaimer';
import { shopApi } from './shopApi';
import type { CategoryDto, ProductGoal, ProductSort, ProductSummaryDto } from './shopTypes';
import './shop-public.css';

const VALID_GOALS = new Set<ProductGoal>(['muscle_gain', 'recovery', 'energy', 'weight_management', 'wellness']);
const VALID_SORTS = new Set<ProductSort>(['newest', 'price_asc', 'price_desc', 'price_per_serving']);
const PAGE_SIZE = 12;

function parseGoal(raw: string | null): ProductGoal | '' {
  return raw && VALID_GOALS.has(raw as ProductGoal) ? (raw as ProductGoal) : '';
}

function parseSort(raw: string | null): ProductSort {
  return raw && VALID_SORTS.has(raw as ProductSort) ? (raw as ProductSort) : 'newest';
}

export function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const goal = parseGoal(searchParams.get('goal'));
  const category = searchParams.get('category') ?? '';
  const urlQ = searchParams.get('q') ?? '';
  const sort = parseSort(searchParams.get('sort'));
  const inStock = searchParams.get('inStock') === '1' || searchParams.get('inStock') === 'true';

  const [qInput, setQInput] = useState(urlQ);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [items, setItems] = useState<ProductSummaryDto[]>([]);
  const [page, setPage] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    document.title = 'Sản phẩm · SÖL Fitness';
  }, []);

  useEffect(() => {
    setQInput(urlQ);
  }, [urlQ]);

  useEffect(() => {
    let active = true;
    shopApi
      .listCategories()
      .then(list => {
        if (active && Array.isArray(list)) setCategories(list);
      })
      .catch(() => {
        /* Categories filter remains usable with default option */
      });
    return () => {
      active = false;
    };
  }, []);

  const writeFilters = (
    patch: Partial<{
      goal: ProductGoal | '';
      category: string;
      q: string;
      sort: ProductSort;
      inStock: boolean;
    }>,
  ) => {
    const nextGoal = patch.goal !== undefined ? patch.goal : goal;
    const nextCategory = patch.category !== undefined ? patch.category : category;
    const nextQ = patch.q !== undefined ? patch.q : urlQ;
    const nextSort = patch.sort !== undefined ? patch.sort : sort;
    const nextInStock = patch.inStock !== undefined ? patch.inStock : inStock;

    const next = new URLSearchParams();
    if (nextGoal) next.set('goal', nextGoal);
    if (nextCategory) next.set('category', nextCategory);
    if (nextQ.trim()) next.set('q', nextQ.trim());
    if (nextSort && nextSort !== 'newest') next.set('sort', nextSort);
    if (nextInStock) next.set('inStock', '1');
    setSearchParams(next, { replace: true });
  };

  const handleSearchChange = (value: string) => {
    setQInput(value);
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    if (import.meta.env.MODE === 'test') {
      writeFilters({ q: value });
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      writeFilters({ q: value });
    }, 350);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setPage(0);

    shopApi
      .listProducts({
        goal: goal || undefined,
        category: category || undefined,
        q: urlQ || undefined,
        sort,
        inStock: inStock || undefined,
        page: 0,
        size: PAGE_SIZE,
      })
      .then(res => {
        if (!active) return;
        setItems(res?.content ?? []);
        setTotalElements(res?.totalElements ?? (res?.content?.length ?? 0));
        setTotalPages(res?.totalPages ?? 1);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [goal, category, urlQ, sort, inStock, retryTick]);

  const handleLoadMore = async () => {
    if (loadingMore || page + 1 >= totalPages) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const res = await shopApi.listProducts({
        goal: goal || undefined,
        category: category || undefined,
        q: urlQ || undefined,
        sort,
        inStock: inStock || undefined,
        page: nextPage,
        size: PAGE_SIZE,
      });
      setItems(prev => [...prev, ...(res?.content ?? [])]);
      setPage(nextPage);
      setTotalElements(res?.totalElements ?? totalElements);
      setTotalPages(res?.totalPages ?? totalPages);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const clearFilters = () => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    setQInput('');
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  return (
    <PublicLayout>
      <main id="public-main" className="fit-shop-page">
        <section className="fit-section shop-catalog" aria-labelledby="shop-page-title">
          <div className="shop-catalog__top" data-reveal="soft">
            <div>
              <span className="fit-kicker">SẢN PHẨM</span>
              <h1 id="shop-page-title" className="shop-catalog__title">
                Thực phẩm bổ sung SÖL<span className="fit-title-dot">.</span>
              </h1>
            </div>
            <div className="shop-catalog__search">
              <label htmlFor="shop-search-input" className="sr-only">
                Tìm sản phẩm
              </label>
              <input
                id="shop-search-input"
                type="search"
                placeholder="Tìm sản phẩm…"
                value={qInput}
                onChange={e => handleSearchChange(e.target.value)}
              />
            </div>
          </div>

          <GoalChips value={goal} onChange={next => writeFilters({ goal: (next ?? '') as ProductGoal | '' })} />

          <div className="shop-catalog__toolbar" data-reveal="soft">
            <label className="shop-catalog__filter">
              <span>Loại:</span>
              <select
                aria-label="Loại sản phẩm"
                value={category}
                onChange={e => writeFilters({ category: e.target.value })}
              >
                <option value="">Tất cả loại</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.slug}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="shop-catalog__filter">
              <span>Sắp xếp:</span>
              <select
                aria-label="Sắp xếp"
                value={sort}
                onChange={e => writeFilters({ sort: parseSort(e.target.value) })}
              >
                <option value="newest">Mới nhất</option>
                <option value="price_asc">Giá tăng dần</option>
                <option value="price_desc">Giá giảm dần</option>
                <option value="price_per_serving">Giá mỗi lần dùng thấp nhất</option>
              </select>
            </label>

            <label className="shop-catalog__checkbox">
              <input
                type="checkbox"
                checked={inStock}
                onChange={e => writeFilters({ inStock: e.target.checked })}
              />
              <span>Chỉ hiện còn hàng</span>
            </label>

            {!loading && !error && (
              <span className="shop-catalog__count" aria-live="polite">
                {totalElements} sản phẩm
              </span>
            )}
          </div>

          {loading ? (
            <LoadingSkeleton label="Đang tải sản phẩm…" variant="cards" count={8} />
          ) : error ? (
            <div className="fit-catalog-state" role="alert">
              <p>Không tải được sản phẩm.</p>
              <button type="button" className="fit-pill" onClick={() => setRetryTick(t => t + 1)}>
                Thử lại
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="fit-catalog-state" role="status">
              <p>Không có sản phẩm khớp bộ lọc.</p>
              <button type="button" className="fit-pill" onClick={clearFilters}>
                Xóa bộ lọc
              </button>
            </div>
          ) : (
            <>
              <div className="shop-grid">
                {items.map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              {page + 1 < totalPages && (
                <div className="shop-catalog__more">
                  <button
                    type="button"
                    className="fit-pill"
                    disabled={loadingMore}
                    onClick={() => void handleLoadMore()}
                  >
                    <span>{loadingMore ? 'Đang tải…' : 'Xem thêm'}</span>
                  </button>
                </div>
              )}
            </>
          )}

          <ShopDisclaimer className="shop-catalog__disclaimer" />
        </section>
      </main>
    </PublicLayout>
  );
}
