import { useSourceLanguage, sourceText } from "../../shop/shopI18n";
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingSkeleton } from '../../../shared/ui/LoadingSkeleton';
import { GoalChips } from '../../shop/components/GoalChips';
import { ProductCard } from '../../shop/components/ProductCard';
import { shopApi } from '../../shop/shopApi';
import type { ProductGoal, ProductSummaryDto } from '../../shop/shopTypes';
import '../../shop/shop-public.css';
import { RoundArrow } from './PublicLayout';
import { SplitHeading } from './SplitHeading';

export function ProductShelf() {
  useSourceLanguage();
  const [goal, setGoal] = useState<ProductGoal | ''>('');
  const [products, setProducts] = useState<ProductSummaryDto[] | null>(null);
  const [error, setError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [initialEmpty, setInitialEmpty] = useState(false);

  useEffect(() => {
    let active = true;
    setError(false);
    setProducts(null);

    shopApi
      .listProducts({ goal, size: 3, sort: 'newest', featuredFirst: true })
      .then(page => {
        if (!active) return;
        const list = page?.content ?? [];
        if (!goal && list.length === 0) {
          setInitialEmpty(true);
        } else {
          setInitialEmpty(false);
        }
        setProducts(list);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
      });

    return () => {
      active = false;
    };
  }, [goal, retryTick]);

  if (initialEmpty && !goal && !error) {
    return null;
  }

  const retry = () => {
    setError(false);
    setProducts(null);
    setRetryTick(t => t + 1);
  };

  return (
    <section className="fit-section fit-products" id="products" aria-labelledby="products-title">
      <div className="fit-section-heading fit-centered" data-reveal="soft">
        <span className="fit-kicker">{sourceText("FUEL THE WORK")}</span>
        <SplitHeading id="products-title" lines={['Fuel &', 'Recovery']} />
        <p className="fit-catalog-caption">
          {sourceText("Thực phẩm bổ sung chọn cho lịch tập của bạn. Nhận tại quầy hoặc giao tận nơi.")}</p>
      </div>

      <GoalChips value={goal} onChange={next => setGoal((next ?? '') as ProductGoal | '')} />

      {error ? (
        <div className="fit-catalog-state" role="alert">
          <p>{sourceText("Chưa tải được danh mục sản phẩm. Vui lòng thử lại.")}</p>
          <button type="button" className="fit-pill" onClick={retry}>
            {sourceText("Thử lại")}</button>
        </div>
      ) : products === null ? (
        <LoadingSkeleton
          label={sourceText("Đang tải sản phẩm…")}
          variant="cards"
          count={3}
          className="fit-catalog-skeleton fit-catalog-skeleton--packages"
        />
      ) : products.length === 0 ? (
        <p className="fit-catalog-state" role="status">
          {sourceText("Chưa có sản phẩm phù hợp với mục tiêu đã chọn.")}</p>
      ) : (
        <div className="shop-shelf-grid shop-grid--shelf" key={goal || 'all'}>
          {products.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      <div className="shop-shelf__footer" data-reveal="soft">
        <Link to="/products" className="fit-pill">
          <span>{sourceText("Xem tất cả sản phẩm")}</span>
          <RoundArrow />
        </Link>
      </div>
    </section>
  );
}
