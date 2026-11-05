import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_STORAGE_KEY, type UserSession } from '../api/client';
import { AppLayout } from './AppLayout';

describe('portal navigation', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: [] }))));
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
      id: '1', name: 'Nguyễn An', identifier: 'an', role: 'MEMBER',
    }));
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function renderPortal(role: UserSession['role'] = 'MEMBER') {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
      id: '1', name: 'Nguyễn An', identifier: 'an', role,
    }));
    const router = createMemoryRouter([
      { element: <AppLayout />, children: [
        { path: '/member/dashboard', element: <h1>Tổng quan</h1> },
        { path: '/member/classes', element: <h1>Lịch học</h1> },
        { path: '/member/profile', element: <h1>Hồ sơ cá nhân</h1> },
        { path: '/member/streak', element: <h1>Streak tập luyện</h1> },
      ] },
      { path: '/login', element: <h1>Đăng nhập</h1> },
    ], { initialEntries: ['/member/dashboard'] });
    await act(async () => root.render(<RouterProvider router={router} />));
    return router;
  }

  it('finds an authorized screen using Vietnamese without accents and navigates', async () => {
    const router = await renderPortal();
    const search = host.querySelector<HTMLButtonElement>('button[aria-label="Tìm màn hình"]');
    expect(search).not.toBeNull();
    await act(async () => search!.click());
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(input).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'lich hoc');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const links = host.querySelectorAll<HTMLAnchorElement>('dialog a');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/member/classes');
    await act(async () => links[0].click());
    expect(router.state.location.pathname).toBe('/member/classes');
    expect(host.querySelector('dialog')).toBeNull();
    expect(document.activeElement?.id).toBe('portal-main');
  });

  it('offers a labeled mobile menu with only member screens', async () => {
    await renderPortal();
    const menu = host.querySelector<HTMLButtonElement>('button[aria-label="Mở điều hướng"]');
    expect(menu).not.toBeNull();
    await act(async () => menu!.click());
    const dialog = host.querySelector('dialog')!;
    expect(dialog.querySelector('a[href="/member/card"]')).not.toBeNull();
    expect(dialog.querySelector('a[href^="/manager/"]')).toBeNull();
    expect(dialog.querySelector('a[href^="/staff/"]')).toBeNull();
  });

  it('keeps the session when logout confirmation is dismissed', async () => {
    await renderPortal();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="portal-avatar-trigger"]')!.click());
    const logout = host.querySelector<HTMLButtonElement>('[data-testid="avatar-menu-logout"]');
    expect(logout).not.toBeNull();
    await act(async () => logout!.click());
    const cancel = [...host.querySelectorAll('dialog button')].find((button) => button.textContent === 'Ở lại');
    expect(cancel).toBeDefined();
    await act(async () => (cancel as HTMLButtonElement).click());
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).not.toBeNull();
    expect(host.querySelector('dialog')).toBeNull();
  });

  it.each(['MEMBER', 'STAFF', 'COACH', 'MANAGER', 'ADMIN'] as const)(
    'keeps only landing in the rail footer and account actions in the avatar menu for %s', async role => {
      const router = await renderPortal(role);
      const footer = host.querySelector('.portal-rail-footer')!;
      expect(footer.querySelectorAll('a, button')).toHaveLength(1);
      expect(footer.querySelector('a')?.getAttribute('href')).toBe('/');
      const avatar = host.querySelector<HTMLButtonElement>('[data-testid="portal-avatar-trigger"]')!;
      expect(host.querySelector('[role="menu"]')).toBeNull();
      await act(async () => avatar.click());
      const menu = host.querySelector('[role="menu"]')!;
      expect(menu.querySelector('[data-testid="avatar-menu-profile"]')?.getAttribute('href')).toBe('/member/profile');
      expect(Boolean(menu.querySelector('[data-testid="avatar-menu-wallet"]'))).toBe(role === 'MEMBER');
      const streakLink = menu.querySelector<HTMLAnchorElement>('[data-testid="avatar-menu-streak"]');
      expect(Boolean(streakLink)).toBe(role === 'MEMBER');
      expect(menu.querySelector('.member-streak')).toBeNull();
      if (streakLink) {
        expect(streakLink.getAttribute('href')).toBe('/member/streak');
        await act(async () => streakLink.click());
        expect(router.state.location.pathname).toBe('/member/streak');
        expect(host.querySelector('[role="menu"]')).toBeNull();
        await act(async () => avatar.click());
      }
      await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      expect(host.querySelector('[role="menu"]')).toBeNull();
      expect(document.activeElement).toBe(avatar);
      await act(async () => avatar.click());
      await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="avatar-menu-logout"]')!.click());
      expect(host.querySelector('[role="menu"]')).toBeNull();
      const confirm = [...host.querySelectorAll<HTMLButtonElement>('dialog button')].find(button => button.textContent === 'Đăng xuất')!;
      await act(async () => confirm.click());
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(router.state.location.pathname).toBe('/login');
    },
  );

  it('opens avatar dropdown menu with wallet balance, profile link, and logout option', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/wallet/my')) {
        return Promise.resolve(new Response(JSON.stringify({
          success: true,
          data: { balance: 250000, transactions: [{ id: 1, type: 'REFUND_CREDIT', amount: 250000, description: 'Hoàn tiền gói Silver' }] },
        })));
      }
      return Promise.resolve(new Response(JSON.stringify({
        success: true,
        data: { fullName: 'Nguyễn An', email: 'an@sol.vn', avatarUrl: null },
      })));
    }));
    const router = await renderPortal();
    const avatarBtn = host.querySelector<HTMLButtonElement>('[data-testid="portal-avatar-trigger"]');
    expect(avatarBtn).not.toBeNull();
    await act(async () => avatarBtn!.click());

    const menu = host.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu?.textContent).toContain('Ví của tôi');
    expect(menu?.textContent).toContain('250.000');

    // Open wallet modal from dropdown
    const walletItem = host.querySelector<HTMLButtonElement>('[data-testid="avatar-menu-wallet"]')!;
    await act(async () => walletItem.click());
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(host.querySelector('dialog')?.textContent).toContain('Ví điện tử SÖL');
    expect(host.querySelector('dialog')?.textContent).toContain('Hoàn tiền gói Silver');

    // Close wallet modal and navigate to profile via dropdown
    const closeBtn = [...host.querySelectorAll<HTMLButtonElement>('dialog button')].find(b => b.textContent === 'Đóng')!;
    await act(async () => closeBtn.click());
    await act(async () => avatarBtn!.click());
    const profileLink = host.querySelector<HTMLAnchorElement>('[data-testid="avatar-menu-profile"]')!;
    await act(async () => profileLink.click());
    expect(router.state.location.pathname).toBe('/member/profile');
  });
});
