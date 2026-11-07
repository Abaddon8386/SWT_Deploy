import { useSourceLanguage, sourceText } from "./shopI18n";
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

import { Select } from '../../shared/ui/Select';
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
  useSourceLanguage();
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
  const [moreError, setMoreError] = useState(false);
  const [error, setError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const debounceRef = useRef<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);

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
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(patch)) {
        const text = typeof value === 'boolean' ? (value ? '1' : '') : value.trim();
        if (!text || (key === 'sort' && text === 'newest')) next.delete(key);
        else next.set(key, text);
      }
      return next;
    }, { replace: true });
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
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setLoadingMore(false);
    setMoreError(false);
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
        signal: controller.signal,
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
      controller.abort();
    };
  }, [goal, category, urlQ, sort, inStock, retryTick]);

  const handleLoadMore = async () => {
    if (loadingMore || page + 1 >= totalPages) return;
    const controller = requestRef.current;
    if (!controller || controller.signal.aborted) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const res = await shopApi.listProducts({
        goal: goal || undefined,
        category: category || undefined,
        q: urlQ || undefined,
        sort,
        inStock: inStock || undefined,
        page: nextPage,
        size: PAGE_SIZE,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setItems(prev => [...prev, ...(res?.content ?? [])]);
      setPage(nextPage);
      setTotalElements(res?.totalElements ?? totalElements);
      setTotalPages(res?.totalPages ?? totalPages);
    } catch {
      if (!controller.signal.aborted) setMoreError(true);
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
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
              <span className="fit-kicker">{sourceText("SẢN PHẨM")}</span>
              <h1 id="shop-page-title" className="shop-catalog__title">
                {sourceText("Thực phẩm bổ sung SÖL")}<span className="fit-title-dot">.</span>
              </h1>
            </div>
            <div className="shop-catalog__search">
              <label htmlFor="shop-search-input" className="sr-only">
                {sourceText("Tìm sản phẩm")}</label>
              <input
                id="shop-search-input"
                type="search"
                placeholder={sourceText("Tìm sản phẩm…")}
                value={qInput}
                onChange={e => handleSearchChange(e.target.value)}
              />
            </div>
          </div>

          <GoalChips value={goal} onChange={next => writeFilters({ goal: (next ?? '') as ProductGoal | '' })} />

          <div className="shop-catalog__toolbar" data-reveal="soft">
            <label className="shop-catalog__filter">
              <span>{sourceText("Loại:")}</span>
              <Select
                aria-label={sourceText("Loại sản phẩm")}
                value={category}
                onChange={e => writeFilters({ category: e.target.value })}
              >
                <option value="">{sourceText("Tất cả loại")}</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.slug}>
                    {cat.name}
                  </option>
                ))}
              </Select>
            </label>

            <label className="shop-catalog__filter">
              <span>{sourceText("Sắp xếp:")}</span>
              <Select
                aria-label={sourceText("Sắp xếp")}
                value={sort}
                onChange={e => writeFilters({ sort: parseSort(e.target.value) })}
              >
                <option value="newest">{sourceText("Mới nhất")}</option>
                <option value="price_asc">{sourceText("Giá tăng dần")}</option>
                <option value="price_desc">{sourceText("Giá giảm dần")}</option>
                <option value="price_per_serving">{sourceText("Giá mỗi lần dùng thấp nhất")}</option>
              </Select>
            </label>

            <label className="shop-catalog__checkbox">
              <input
                type="checkbox"
                checked={inStock}
                onChange={e => writeFilters({ inStock: e.target.checked })}
              />
              <span>{sourceText("Chỉ hiện còn hàng")}</span>
            </label>

            {!loading && !error && (
              <span className="shop-catalog__count" aria-live="polite">
                {totalElements} {sourceText(" sản phẩm")}</span>
            )}
          </div>

          {loading ? (
            <LoadingSkeleton label={sourceText("Đang tải sản phẩm…")} variant="cards" count={8} />
          ) : error ? (
            <div className="fit-catalog-state" role="alert">
              <p>{sourceText("Không tải được sản phẩm.")}</p>
              <button type="button" className="fit-pill" onClick={() => setRetryTick(t => t + 1)}>
                {sourceText("Thử lại")}</button>
            </div>
          ) : items.length === 0 ? (
            <div className="fit-catalog-state" role="status">
              <p>{sourceText("Không có sản phẩm khớp bộ lọc.")}</p>
              <button type="button" className="fit-pill" onClick={clearFilters}>
                {sourceText("Xóa bộ lọc")}</button>
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
                  {moreError && <p role="alert">{sourceText("Không tải thêm được sản phẩm. Danh sách hiện tại vẫn được giữ.")}</p>}
                  <button
                    type="button"
                    className="fit-pill"
                    disabled={loadingMore}
                    onClick={() => void handleLoadMore()}
                  >
                    <span>{loadingMore ? sourceText('Đang tải…') : moreError ? sourceText('Thử tải thêm') : sourceText('Xem thêm')}</span>
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
