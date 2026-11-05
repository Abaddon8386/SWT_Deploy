import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NutritionFacts } from './NutritionFacts';

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

describe('NutritionFacts', () => {
  it('renders a real table with caption, indented sub rows and right-aligned numbers', async () => {
    await act(async () =>
      root.render(
        <NutritionFacts
          servingSize="1 muỗng (33 g)"
          servings={68}
          nutrients={[
            { name: 'Năng lượng', amount: 130, unit: 'kcal', dailyValuePercent: null, subRow: false, highlight: false },
            { name: 'Đạm', amount: 25, unit: 'g', dailyValuePercent: 50, subRow: false, highlight: true },
            { name: 'BCAA', amount: 5.5, unit: 'g', dailyValuePercent: null, subRow: true, highlight: false },
          ]}
        />,
      ),
    );

    const table = host.querySelector('table')!;
    expect(table).not.toBeNull();
    expect(table.querySelector('caption')?.textContent).toContain('Thành phần dinh dưỡng');
    expect([...table.querySelectorAll('tbody tr')].map((r) => r.textContent)).toEqual([
      'Năng lượng130 kcal',
      'Đạm25 g50%',
      'BCAA5,5 g',
    ]);
    expect(table.querySelectorAll('tr.is-sub')).toHaveLength(1);
    expect(host.querySelector('.shop-facts__foot')?.textContent).toContain('*NCKN');
  });

  it('shows nothing but the serving line when there are no nutrient rows', async () => {
    await act(async () =>
      root.render(<NutritionFacts servingSize="2 viên" servings={null} nutrients={[]} />),
    );

    const table = host.querySelector('table')!;
    expect(table.querySelector('.shop-facts__serving')?.textContent).toContain('Khẩu phần: 2 viên');
    expect(table.querySelector('tbody')).toBeNull();
    expect(host.querySelector('.shop-facts__foot')).toBeNull();
  });
});
