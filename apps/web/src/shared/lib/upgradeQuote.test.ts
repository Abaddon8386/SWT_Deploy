import { describe, expect, it } from 'vitest';
import { upgradeQuote } from './upgradeQuote';

const silver = { startDate: '2026-11-01', endDate: '2026-11-30' };

describe('upgradeQuote', () => {
  it('charges only the difference within the first half of the period', () => {
    expect(upgradeQuote(silver, 500_000, 1_500_000, '2026-11-01')).toMatchObject({ amount: 1_000_000, mode: 'difference' });
    expect(upgradeQuote(silver, 500_000, 1_500_000, '2026-11-16')).toMatchObject({ amount: 1_000_000, mode: 'difference', usedDays: 15, totalDays: 30 });
  });

  it('charges the full new price once more than half is used', () => {
    expect(upgradeQuote(silver, 500_000, 1_500_000, '2026-11-17')).toMatchObject({ amount: 1_500_000, mode: 'full' });
  });

  it('never quotes a zero payment', () => {
    expect(upgradeQuote(silver, 500_000, 500_000, '2026-11-02')).toMatchObject({ amount: 500_000, mode: 'full' });
  });
});
