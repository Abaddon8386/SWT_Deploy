import { Link } from 'react-router-dom';
import { toast } from '../../../shared/ui/toast';
import { addToCart } from '../cart';
import { FORM_LABELS, formatVnd, pricePerServingLabel } from '../shopFormat';
import type { ProductSummaryDto } from '../shopTypes';
import { ProductPackshot } from './ProductPackshot';

const num = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

export function ProductCard({
  product,
  onAdd,
  onSelect,
}: {
  product: ProductSummaryDto;
  onAdd?: (product: ProductSummaryDto) => void;
  onSelect?: (product: ProductSummaryDto) => void;
}) {
  const detailPath = `/products/${product.slug}`;
  const priceText =
    product.variantCount && product.variantCount > 1
      ? `Từ ${formatVnd(product.minPrice)}`
      : formatVnd(product.minPrice);
  const ppsText = pricePerServingLabel(product.pricePerServing);
  const needsVariantChoice =
    Boolean(product.variantCount && product.variantCount > 1 && !product.defaultVariantId && !onAdd);

  const handleAdd = () => {
    if (onAdd) {
      onAdd(product);
    } else {
      addToCart(product.defaultVariantId ?? product.id, 1);
    }
    toast.success('Đã thêm vào giỏ');
  };

  return (
    <article className="shop-card" data-reveal="lift">
      <Link
        to={detailPath}
        className="shop-card__media"
        aria-label={product.name}
        onClick={
          onSelect
            ? e => {
                e.preventDefault();
                onSelect(product);
              }
            : undefined
        }
      >
        <div className="shop-card__badges">
          {!product.inStock && <span className="shop-badge shop-badge--out">Hết hàng</span>}
          {product.inStock && product.lowStock && <span className="shop-badge shop-badge--low">Sắp hết</span>}
          {product.isNew && <span className="shop-badge shop-badge--new">Mới</span>}
        </div>
        <ProductPackshot form={product.form} name={product.name} imageUrl={product.imageUrl} alt={product.name} />
      </Link>

      <span className="shop-card__kicker">
        {product.categoryName} · {FORM_LABELS[product.form]}
      </span>

      <h3 className="shop-card__title">
        <Link
          to={detailPath}
          onClick={
            onSelect
              ? e => {
                  e.preventDefault();
                  onSelect(product);
                }
              : undefined
          }
        >
          {product.name}
        </Link>
      </h3>

      {product.highlight && (
        <p className="shop-card__highlight">
          {num.format(product.highlight.amount)} {product.highlight.unit} {product.highlight.name.toLowerCase()}
        </p>
      )}

      <div className="shop-card__pricing">
        <strong className="shop-card__price">{priceText}</strong>
        {ppsText && <span className="shop-card__pps">{ppsText}</span>}
      </div>

      {!product.inStock ? (
        <button type="button" className="shop-card__cta" disabled>
          Hết hàng
        </button>
      ) : needsVariantChoice ? (
        <Link
          to={detailPath}
          className="shop-card__cta"
          onClick={
            onSelect
              ? e => {
                  e.preventDefault();
                  onSelect(product);
                }
              : undefined
          }
        >
          Chọn loại
        </Link>
      ) : (
        <button type="button" className="shop-card__cta" onClick={handleAdd}>
          Thêm vào giỏ
        </button>
      )}
    </article>
  );
}
