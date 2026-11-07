import { useSourceLanguage, sourceText } from "../shopI18n";
import { useId } from 'react';

export function QuantityStepper({
  value,
  max = 20,
  onChange,
  label,
  disabled = false,
}: {
  value: number;
  max?: number;
  onChange: (next: number) => void;
  label?: string;
  disabled?: boolean;
}) {
  useSourceLanguage();
  const inputId = useId();
  const upper = Math.min(Math.max(1, max), 20);
  const clamp = (next: number) => Math.min(Math.max(1, Math.trunc(next) || 1), upper);

  return (
    <div className="shop-stepper">
      <button
        type="button"
        className="shop-stepper__btn"
        aria-label={sourceText("Giảm số lượng")}
        disabled={disabled || value <= 1}
        onClick={() => onChange(clamp(value - 1))}
      >
        −
      </button>
      <label htmlFor={inputId} className="shop-sr-only">
        {label ?? sourceText('Số lượng')}
      </label>
      <input
        id={inputId}
        type="number"
        className="shop-stepper__input"
        min={1}
        max={upper}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const parsed = Number.parseInt(e.target.value, 10);
          if (Number.isNaN(parsed)) return;
          onChange(clamp(parsed));
        }}
      />
      <button
        type="button"
        className="shop-stepper__btn"
        aria-label={sourceText("Tăng số lượng")}
        disabled={disabled || value >= upper}
        onClick={() => onChange(clamp(value + 1))}
      >
        +
      </button>
    </div>
  );
}
