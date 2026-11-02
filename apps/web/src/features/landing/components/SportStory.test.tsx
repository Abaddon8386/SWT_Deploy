import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SportStack } from './SportStack';

let host: HTMLDivElement;
let root: Root;
let intersect: IntersectionObserverCallback;
let preference: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
const disconnect = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  preference = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', () => preference);
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe() {}
    disconnect = disconnect;
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.clearAllMocks();
});
const render = () => act(async () => root.render(<MemoryRouter><SportStack classPath="/login" /></MemoryRouter>));
const activate = async (index: number) => act(async () => {
  const target = host.querySelectorAll('.fit-sport-story-step')[index];
  intersect([{ target, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
});
const advance = () => act(async () => vi.advanceTimersByTime(500));
const shown = () => host.querySelector<HTMLElement>('.fit-sport-story-visual.is-active')?.dataset.sport;

it('keeps every sport and CTA readable in document flow with inline mobile illustrations', async () => {
  await render();
  expect(host.querySelectorAll('.fit-sport-story-step')).toHaveLength(6);
  expect([...host.querySelectorAll('.fit-sport-story-step h3')].map(heading => heading.textContent)).toEqual(['Gym', 'Bơi lội', 'Boxing', 'Tennis', 'Cầu lông', 'Yoga']);
  expect([...host.querySelectorAll('.fit-sport-story-tier')].map(tier => tier.textContent)).toEqual(['Bộ môn chính', ...Array(5).fill('Bộ môn phụ')]);
  expect(host.querySelectorAll('.fit-sport-story-inline img')).toHaveLength(6);
  expect([...host.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual(
    ['/login', '/login', '/swimming', '/login', '/boxing', '/login', '/tennis', '/login', '/badminton', '/login', '/yoga']);
  expect(host.querySelector('[inert], .fit-sport-stack-deck')).toBeNull();
});

it('switches illustrations after the exit, tracks the rail, and reverses when scrolling up', async () => {
  await render();
  expect(shown()).toBe('gym');
  await activate(2);
  expect(host.querySelector('.fit-sport-story-step.is-active')?.getAttribute('data-sport')).toBe('boxing');
  expect(host.querySelector('.fit-sport-story-visual.is-leaving')?.getAttribute('data-sport')).toBe('gym');
  expect(host.querySelector<HTMLElement>('.fit-sport-story-rail i')?.style.top).toBe(`${2 / 5 * 100}%`);
  await advance();
  expect(shown()).toBe('boxing');
  await activate(0); await advance();
  expect(shown()).toBe('gym');
});

it('uses the latest sport on fast jumps and handles keyboard focus', async () => {
  await render();
  await activate(1);
  await act(async () => vi.advanceTimersByTime(450));
  await activate(3);
  await act(async () => vi.advanceTimersByTime(50));
  expect(shown()).toBe('tennis');
  await act(async () => host.querySelector('a')!.focus());
  await advance();
  expect(shown()).toBe('gym');
});

it('cancels a pending transition when reduced motion is enabled live and cleans up observers', async () => {
  await render(); await activate(3);
  preference.matches = true;
  await act(async () => preference.addEventListener.mock.calls[0][1]());
  expect(shown()).toBe('tennis');
  await advance();
  expect(host.querySelector('.is-leaving')).toBeNull();
  expect(host.querySelector('[inert]')).toBeNull();
  await act(async () => root.unmount());
  expect(disconnect).toHaveBeenCalled();
});
