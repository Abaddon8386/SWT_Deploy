import { useSourceLanguage, sourceText } from "../shopI18n";
import { useId } from 'react';
import type { ProductVariantDto } from '../shopTypes';

export function VariantPicker({
  variants,
  value,
  onChange,
}: {
  variants: ProductVariantDto[];
  value: number;
  onChange: (variantId: number) => void;
}) {
  useSourceLanguage();
  const groupName = useId();

  return (
    <fieldset className="shop-variants">
      <legend className="shop-variants__legend">{sourceText("Lựa chọn")}</legend>
      <div className="shop-variants__list">
        {variants.map((variant) => {
          const soldOut = !variant.available || variant.stock <= 0;
          const selected = variant.id === value;
          return (
            <label
              key={variant.id}
              className={`shop-variant-pill${selected ? ' is-selected' : ''}${soldOut ? ' is-disabled' : ''}`}
            >
              <input
                type="radio"
                name={groupName}
                value={variant.id}
                checked={selected}
                disabled={soldOut}
                onChange={() => {
                  if (!soldOut) onChange(variant.id);
                }}
              />
              <span>{variant.label}</span>
              {soldOut && <span className="shop-variant-pill__soldout">{sourceText("Hết hàng")}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
