import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, AUTH_STORAGE_KEY } from '../api/client';
import { AppLayout } from '../ui/AppLayout';
import { PublicLayout } from '../../features/landing/components/PublicLayout';
import { getLanguage, LANGUAGE_STORAGE_KEY, setLanguage } from './index';

describe('Multi-language settings (Avatar dropdown & Footer)', () => {
  beforeEach(() => {
    localStorage.clear();
    setLanguage('vi');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    setLanguage('vi');
    document.body.innerHTML = '';
  });

  it('defaults to vi and sends dynamic Accept-Language header in apiFetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ success: true, data: { ok: true } }), { status: 200 })
    );

    expect(getLanguage()).toBe('vi');
    await apiFetch('/profile');
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/profile',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Accept-Language': 'vi' }),
      })
    );

    setLanguage('en');
    expect(getLanguage()).toBe('en');
    expect(document.documentElement.lang).toBe('en');

    await apiFetch('/profile');
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/v1/profile',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Accept-Language': 'en' }),
      })
    );
  });

  it('switches language from user avatar dropdown settings and portal workspace footer', async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ id: '1', name: 'Nguyen Van A', identifier: 'member1', role: 'MEMBER' })
    );

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <AppLayout />,
          children: [{ path: 'member/dashboard', element: <div>Bảng điều khiển</div> }],
        },
      ],
      { initialEntries: ['/member/dashboard'] }
    );

    await act(async () => {
      root.render(<RouterProvider router={router} />);
    });

    // Verify footer language setting is rendered in portal workspace footer
    const footerSetting = host.querySelector('[data-testid="footer-language-setting"]');
    expect(footerSetting).not.toBeNull();
    expect(host.querySelector('.portal-workspace-footer')?.textContent).toContain('SÖL Fitness · Không gian của bạn');

    // Open user avatar menu
    const avatarTrigger = host.querySelector<HTMLButtonElement>('[data-testid="portal-avatar-trigger"]');
    expect(avatarTrigger).not.toBeNull();
    await act(async () => {
      avatarTrigger!.click();
    });

    const avatarSetting = host.querySelector('[data-testid="avatar-language-setting"]');
    expect(avatarSetting).not.toBeNull();
    expect(avatarSetting?.textContent).toContain('Cài đặt · Ngôn ngữ');

    const enAvatarBtn = host.querySelector<HTMLButtonElement>('[data-testid="avatar-lang-en"]');
    expect(enAvatarBtn).not.toBeNull();

    // Switch to English via avatar settings menu
    await act(async () => {
      enAvatarBtn!.click();
    });

    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(host.querySelector('[data-testid="avatar-language-setting"]')?.textContent).toContain('Settings · Language');
    expect(host.querySelector('[data-testid="avatar-menu-wallet"]')?.textContent).toContain('My Wallet');
    expect(host.querySelector('[data-testid="avatar-menu-profile"]')?.textContent).toContain('Personal Profile');
    expect(host.querySelector('[data-testid="avatar-menu-logout"]')?.textContent).toContain('Sign out');
    expect(host.querySelector('.portal-workspace-footer')?.textContent).toContain('SÖL Fitness · Your Workspace');

    // Switch back to Vietnamese via footer language setting
    const viFooterBtn = host.querySelector<HTMLButtonElement>('[data-testid="footer-lang-vi"]');
    expect(viFooterBtn).not.toBeNull();
    await act(async () => {
      viFooterBtn!.click();
    });

    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('vi');
    expect(document.documentElement.lang).toBe('vi');
    expect(host.querySelector('.portal-workspace-footer')?.textContent).toContain('SÖL Fitness · Không gian của bạn');

    await act(async () => {
      root.unmount();
    });
  });

  it('switches language from the public footer in PublicLayout', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <PublicLayout>
              <main id="public-main">Nội dung trang chủ</main>
            </PublicLayout>
          ),
        },
      ],
      { initialEntries: ['/'] }
    );

    await act(async () => {
      root.render(<RouterProvider router={router} />);
    });

    const footerSetting = host.querySelector('.fit-footer [data-testid="footer-language-setting"]');
    expect(footerSetting).not.toBeNull();
    expect(host.querySelector('.fit-header')?.textContent).toContain('Về SÖL');

    const enFooterBtn = host.querySelector<HTMLButtonElement>('.fit-footer [data-testid="footer-lang-en"]');
    expect(enFooterBtn).not.toBeNull();

    await act(async () => {
      enFooterBtn!.click();
    });

    expect(getLanguage()).toBe('en');
    expect(host.querySelector('.fit-header')?.textContent).toContain('About SÖL');
    expect(host.querySelector('.fit-footer')?.textContent).toContain('06:00 — 22:00 daily');

    await act(async () => {
      root.unmount();
    });
  });
});
