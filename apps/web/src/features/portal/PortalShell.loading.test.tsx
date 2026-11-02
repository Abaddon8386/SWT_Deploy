import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { AUTH_STORAGE_KEY } from '../../shared/api/client';
import { PortalShell } from './PortalShell';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('keeps portal navigation and shows a skeleton until a pending route resolves', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ id: 'coach', name: 'Coach', identifier: 'coach', role: 'COACH' }));
  let finishRoute!: (value: { Component: () => React.ReactNode }) => void;
  const pendingRoute = new Promise<{ Component: () => React.ReactNode }>(resolve => { finishRoute = resolve; });
  const router = createMemoryRouter([{ element: <PortalShell />, children: [
    { path: '/coach/classes', element: <h1>Lịch dạy hiện tại</h1> },
    { path: '/coach/training-plans', lazy: () => pendingRoute },
  ] }], { initialEntries: ['/coach/classes'] });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<RouterProvider router={router} />));
    let navigating!: Promise<void>;
    await act(async () => { navigating = router.navigate('/coach/training-plans'); });
    expect(host.querySelector('nav[aria-label="Điều hướng portal"]')).not.toBeNull();
    expect(host.querySelector('#portal-main [role="status"][aria-busy="true"]')).not.toBeNull();
    expect(host.querySelector('#portal-main .route-fade')?.hasAttribute('hidden')).toBe(true);
    await act(async () => {
      finishRoute({ Component: () => <h1>Giáo án đã tải</h1> });
      await navigating;
    });
    expect(host.querySelector('#portal-main')?.textContent).toContain('Giáo án đã tải');
    expect(host.querySelector('#portal-main .loading-skeleton')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    router.dispose();
    host.remove();
  }
});
