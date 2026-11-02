import { describe, expect, it } from 'vitest';
import { formatCenterDate, formatCenterDateTime, formatCenterTime, formatCenterTimeSeconds, parseCenterTime } from './centerTime';

describe('centerTime', () => {
  it('reads offset-less server values as center time', () => {
    expect(formatCenterTime('2026-11-02T09:05:00')).toBe('09:05');
    expect(formatCenterTimeSeconds('2026-11-02T09:05:07.123456')).toBe('09:05:07');
    expect(formatCenterDate('2026-11-02T23:59:00')).toBe('02/11/2026');
  });

  it('converts instants to center time', () => {
    expect(formatCenterTime('2026-11-02T03:05:00Z')).toBe('10:05');
    expect(formatCenterDateTime('2026-11-02T17:30:00Z')).toBe('00:30 03/11/2026');
    expect(formatCenterTime('2026-11-02T10:05:00+07:00')).toBe('10:05');
  });

  it('treats a plain date as midnight at the center', () => {
    expect(formatCenterDate('2026-11-02')).toBe('02/11/2026');
    expect(formatCenterTime('2026-11-02')).toBe('00:00');
  });

  it('falls back for empty or invalid values', () => {
    expect(formatCenterDateTime(null)).toBe('—');
    expect(formatCenterDateTime('not-a-date', 'n/a')).toBe('n/a');
    expect(parseCenterTime('')).toBeNull();
  });
});
