import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductVariantDto } from '../shopTypes';
import { VariantPicker } from './VariantPicker';

let host: HTMLDivElement;
let root: Root;

const variants: ProductVariantDto[] = [
  {
    id: 1,
    sku: 'WHEY-CHOC-2KG',
    label: 'Sô-cô-la · 2,27 kg',
    price: 1290000,
    servingsPerContainer: 68,
    pricePerServing: 18971,
    stock: 10,
    available: true,
  },
  {
    id: 2,
    sku: 'WHEY-VAN-2KG',
    label: 'Vani · 2,27 kg',
    price: 1290000,
    servingsPerContainer: 68,
    pricePerServing: 18971,
    stock: 5,
    available: true,
  },
  {
    id: 3,
    sku: 'WHEY-CHOC-900G',
    label: 'Sô-cô-la · 907 g',
    price: 690000,
    servingsPerContainer: 27,
    pricePerServing: 25556,
    stock: 0,
    available: false,
  },
];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('VariantPicker', () => {
  it('disables sold-out variants, announces Hết hàng and switches active variant', async () => {
    const onChange = vi.fn();
    await act(async () =>
      root.render(<VariantPicker variants={variants} value={1} onChange={onChange} />),
    );

    expect(host.querySelector('legend')?.textContent).toBe('Lựa chọn');
    const radios = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios).toHaveLength(3);
    expect(radios[0].checked).toBe(true);
    expect(radios[2].disabled).toBe(true);
    expect(radios[2].closest('label')?.textContent).toContain('Hết hàng');

    await act(async () => {
      radios[1].click();
    });
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
