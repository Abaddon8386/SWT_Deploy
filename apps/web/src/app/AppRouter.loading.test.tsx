import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { AppRouter } from './AppRouter';
import { PortalShell } from '../features/portal/PortalShell';
import { AUTH_STORAGE_KEY } from '../shared/api/client';

const fixture = vi.hoisted(() => ({ router: undefined as unknown as ReturnType<typeof createMemoryRouter> }));
vi.mock('./router', () => ({ get router() { return fixture.router; } }));

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('shows public route loading immediately and removes it when the module is ready', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let finishRoute!: (value: { Component: () => React.ReactNode }) => void;
  const pendingRoute = new Promise<{ Component: () => React.ReactNode }>(resolve => { finishRoute = resolve; });
  const router = createMemoryRouter([
    { path: '/', element: <a href="/register">Trang chủ hiện tại</a> },
    { path: '/register', lazy: () => pendingRoute },
  ]);
  fixture.router = router;
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<AppRouter />));
    let navigating!: Promise<void>;
    await act(async () => { navigating = router.navigate('/register'); });
    expect(host.querySelector('[role="status"][aria-busy="true"]')).not.toBeNull();
    expect(host.querySelector('.route-content')?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('.route-content')?.hasAttribute('inert')).toBe(true);
    await act(async () => {
      finishRoute({ Component: () => <h1>Đăng ký đã sẵn sàng</h1> });
      await navigating;
    });
    expect(host.querySelector('[role="status"][aria-busy="true"]')).toBeNull();
    expect(host.querySelector('.route-content')?.hasAttribute('inert')).toBe(false);
    expect(host.querySelector('h1')?.textContent).toBe('Đăng ký đã sẵn sàng');
  } finally {
    await act(async () => root.unmount());
    router.dispose();
  }
});

it('shows a skeleton after logout while the login route module is pending', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ id: 'coach', name: 'Coach', identifier: 'coach', role: 'COACH' }));
  let finishRoute!: (value: { Component: () => React.ReactNode }) => void;
  const pendingRoute = new Promise<{ Component: () => React.ReactNode }>(resolve => { finishRoute = resolve; });
  const router = createMemoryRouter([
    { id: 'portal', element: <PortalShell />, children: [{ path: '/coach/classes', element: <h1>Lịch dạy</h1> }] },
    { path: '/login', lazy: () => pendingRoute },
  ], { initialEntries: ['/coach/classes'] });
  fixture.router = router;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<AppRouter />));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="portal-avatar-trigger"]')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="avatar-menu-logout"]')!.click());
    const confirm = [...host.querySelectorAll<HTMLButtonElement>('dialog button')].find(button => button.textContent === 'Đăng xuất')!;
    await act(async () => confirm.click());
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(host.querySelector('[role="status"][aria-busy="true"]')).not.toBeNull();
    expect(host.querySelector('.route-content')?.getAttribute('aria-hidden')).toBe('true');
    await act(async () => {
      finishRoute({ Component: () => <h1>Đăng nhập đã sẵn sàng</h1> });
      await pendingRoute;
    });
    expect(host.querySelector('h1')?.textContent).toBe('Đăng nhập đã sẵn sàng');
    expect(host.querySelector('.loading-skeleton')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    router.dispose();
    host.remove();
  }
});
