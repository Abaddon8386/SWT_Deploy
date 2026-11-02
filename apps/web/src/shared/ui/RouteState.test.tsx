import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { RouteLoading } from './RouteState';

afterEach(() => vi.unstubAllGlobals());

it('shows an accessible skeleton while the initial route is loading', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<RouteLoading />));
    const status = host.querySelector('[role="status"]');
    expect(status?.getAttribute('aria-busy')).toBe('true');
    expect(status?.textContent).toContain('Đang tải trang');
    expect(status?.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(host.querySelector('.loading-skeleton')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});
