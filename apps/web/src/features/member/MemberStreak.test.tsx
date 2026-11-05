import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemberStreak } from './MemberStreak';
import { memberCheckinApi } from './memberCheckinApi';

vi.mock('./memberCheckinApi', () => ({ memberCheckinApi: { streak: vi.fn() } }));
const fixture = {
  currentStreak: 3, longestStreak: 8, workoutDays: 5,
  startDate: '2026-08-10', endDate: '2026-11-05',
  activeDates: ['2026-08-10', '2026-09-01', '2026-11-03', '2026-11-04', '2026-11-05'],
};
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(memberCheckinApi.streak).mockResolvedValue(fixture);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

it('shows real streak counts and 13 complete weeks without filling future days', async () => {
  await act(async () => root.render(<MemberStreak />));
  expect(host.textContent).toContain('3');
  expect(host.textContent).toContain('ngày liên tiếp');
  expect(host.textContent).toContain('8 ngày');
  expect(host.textContent).toContain('5 ngày tập');
  expect(host.querySelectorAll('.member-streak__day')).toHaveLength(91);
  expect(host.querySelectorAll('.member-streak__day.is-active')).toHaveLength(5);
  expect(host.querySelectorAll('.member-streak__day.is-future')).toHaveLength(3);
  expect(host.querySelector('[data-date="2026-11-05"] title')?.textContent).toContain('05/11/2026');
  expect(host.querySelectorAll('.member-streak__snake rect')).toHaveLength(5);
});

it('shows an honest empty state without a decorative activity snake', async () => {
  vi.mocked(memberCheckinApi.streak).mockResolvedValue({ ...fixture, currentStreak: 0, longestStreak: 0, workoutDays: 0, activeDates: [] });
  await act(async () => root.render(<MemberStreak />));
  expect(host.textContent).toContain('Check-in để bắt đầu chuỗi ngày tập.');
  expect(host.querySelectorAll('.is-active')).toHaveLength(0);
  expect(host.querySelector('.member-streak__snake')).toBeNull();
});

it('keeps loading distinct from zero and supports retry after a failed request', async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(memberCheckinApi.streak).mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  await act(async () => root.render(<MemberStreak />));
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Đang tải streak');
  expect(host.querySelector('.member-streak__count')).toBeNull();
  await act(async () => reject(new TypeError('private implementation detail')));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Chưa tải được streak');
  expect(host.textContent).not.toContain('private implementation detail');
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.querySelectorAll('.member-streak__day.is-active')).toHaveLength(5);
});
