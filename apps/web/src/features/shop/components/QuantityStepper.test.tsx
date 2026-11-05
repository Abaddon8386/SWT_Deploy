import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuantityStepper } from './QuantityStepper';

let host: HTMLDivElement;
let root: Root;

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

describe('QuantityStepper', () => {
  it('never goes below 1 or above max', async () => {
    const onChange = vi.fn();
    await act(async () =>
      root.render(<QuantityStepper value={1} max={4} onChange={onChange} />),
    );

    const decBtn = host.querySelector<HTMLButtonElement>('button[aria-label="Giảm số lượng"]')!;
    const incBtn = host.querySelector<HTMLButtonElement>('button[aria-label="Tăng số lượng"]')!;
    expect(decBtn.disabled).toBe(true);
    expect(incBtn.disabled).toBe(false);

    await act(async () => incBtn.click());
    expect(onChange).toHaveBeenCalledWith(2);

    await act(async () =>
      root.render(<QuantityStepper value={4} max={4} onChange={onChange} />),
    );
    const incBtnAtMax = host.querySelector<HTMLButtonElement>('button[aria-label="Tăng số lượng"]')!;
    expect(incBtnAtMax.disabled).toBe(true);

    const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '99');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(4);
  });
});
