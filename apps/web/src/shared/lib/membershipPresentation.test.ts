import { describe, expect, it } from 'vitest';
import { isTrialPackage } from './membershipPresentation';

describe('isTrialPackage', () => {
  it.each([
    { name: 'Vé tập một ngày', price: 100000, durationDays: 1 },
    { name: 'Vé cuối tuần', price: 250000, durationDays: 3 },
    { name: 'Gói ưu đãi một tháng', price: 0, durationDays: 30 },
    { name: 'Essential', price: 500000, durationDays: 30 },
  ])('keeps regular package $name available', (pkg) => {
    expect(isTrialPackage(pkg)).toBe(false);
  });

  it.each([
    { name: 'Gói Trải Nghiệm 3 Ngày', price: 0, durationDays: 3 },
    { name: 'Gold Trial', price: 0, durationDays: 3 },
    { name: 'Gói dành cho hội viên mới', price: 0, durationDays: 3 },
  ])('recognizes trial package $name', (pkg) => {
    expect(isTrialPackage(pkg)).toBe(true);
  });
});
