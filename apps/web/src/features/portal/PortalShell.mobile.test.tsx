import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_STORAGE_KEY, type UserSession } from '../../shared/api/client';
import { PortalShell } from './PortalShell';
import { MemberNotificationsPage } from '../member/MemberNotificationsPage';

vi.mock('../member/notificationsApi', () => ({ getUnreadCount: vi.fn().mockResolvedValue(0), getNotifications: vi.fn().mockResolvedValue({ content: [], number: 0, totalPages: 1 }) }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

async function renderPortal(role: UserSession['role'], path: string) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ id: '1', name: 'Nguyễn An', identifier: 'an', role }));
  const router = createMemoryRouter([
    { element: <PortalShell />, children: [{ path: '/member/notifications', element: <MemberNotificationsPage /> }, { path: '*', element: <h1>Nội dung portal</h1> }] },
    { path: '/login', element: <h1>Đăng nhập</h1> },
  ], { initialEntries: [path] });
  await act(async () => root.render(<RouterProvider router={router} />));
  return router;
}

describe('mobile portal navigation', () => {
  it('opens legacy notification URLs as a panel over the dashboard', async () => {
    const router = await renderPortal('MEMBER', '/member/notifications');
    expect(router.state.location.pathname).toBe('/member/dashboard');
    expect(host.querySelector('.notification-popover')).not.toBeNull();
  });

  it('opens notifications from More without navigating and closes its navigation modal', async () => {
    const router = await renderPortal('MEMBER', '/member/dashboard');
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Thêm màn hình"]')!.click());
    const notifications = [...host.querySelectorAll<HTMLButtonElement>('.portal-screen-results button')].find(button => button.textContent === 'Thông báo');
    expect(notifications).toBeDefined();
    await act(async () => notifications!.click());
    expect(router.state.location.pathname).toBe('/member/dashboard');
    expect(host.querySelector('dialog')).toBeNull();
    expect(host.querySelector('.notification-popover')).not.toBeNull();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Đóng thông báo');
  });

  it('opens notifications in a corner panel without navigating and restores focus on Escape', async () => {
    const router = await renderPortal('MEMBER', '/member/dashboard');
    const bell = host.querySelector<HTMLButtonElement>('button.member-notification-bell');
    expect(bell).not.toBeNull();
    await act(async () => bell!.click());
    expect(router.state.location.pathname).toBe('/member/dashboard');
    expect(host.querySelector('[role="dialog"][aria-label="Thông báo"]')?.textContent).toContain('Chưa có thông báo');
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('.notification-popover')).toBeNull();
    expect(document.activeElement).toBe(bell);
  });

  it('opens the same panel from the rail and closes on outside pointerdown', async () => {
    const router = await renderPortal('MEMBER', '/member/dashboard');
    const trigger = host.querySelector<HTMLButtonElement>('.portal-rail-nav button[aria-label="Thông báo"]');
    expect(trigger).not.toBeNull();
    await act(async () => trigger!.click());
    expect(host.querySelector('.notification-popover')).not.toBeNull();
    expect(router.state.location.pathname).toBe('/member/dashboard');
    await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(host.querySelector('.notification-popover')).toBeNull();
  });

  it.each([
    ['MEMBER', '/member/dashboard', ['/member/dashboard', '/member/classes', '/member/check-in']],
    ['STAFF', '/staff/reception', ['/staff/reception', '/staff/classes', '/staff/check-in']],
    ['COACH', '/coach/classes', ['/coach/classes', '/staff/attendance', '/coach/training-plans']],
    ['MANAGER', '/manager/reports', ['/manager/reports', '/manager/catalogs', '/staff/classes']],
  ] as const)('shows only the three primary actions for %s and marks the current screen', async (role, path, expected) => {
    await renderPortal(role, path);
    const nav = host.querySelector('nav[aria-label="Điều hướng nhanh"]');
    expect(nav).not.toBeNull();
    expect([...nav!.querySelectorAll('a')].map(link => link.getAttribute('href'))).toEqual(expected);
    expect(nav!.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe(path);
    expect(nav!.querySelector('button[aria-label="Thêm màn hình"]')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the complete member menu, navigates to QR and closes the menu', async () => {
    const router = await renderPortal('MEMBER', '/member/dashboard');
    const more = host.querySelector<HTMLButtonElement>('button[aria-label="Thêm màn hình"]');
    expect(more).not.toBeNull();
    await act(async () => more!.click());
    expect(more!.getAttribute('aria-expanded')).toBe('true');
    const dialog = host.querySelector('dialog')!;
    expect(dialog.querySelector('a[href="/member/profile"]')).not.toBeNull();
    expect(dialog.querySelector('a[href^="/manager/"]')).toBeNull();
    const qr = dialog.querySelector<HTMLAnchorElement>('a[href="/member/check-in"]');
    expect(qr).not.toBeNull();
    await act(async () => qr!.click());
    expect(router.state.location.pathname).toBe('/member/check-in');
    expect(host.querySelector('dialog')).toBeNull();
  });

  it('marks More on secondary screens and logs out through confirmation', async () => {
    const router = await renderPortal('STAFF', '/messages');
    const more = host.querySelector<HTMLButtonElement>('button[aria-label="Thêm màn hình"]');
    expect(more).not.toBeNull();
    expect(more!.getAttribute('aria-current')).toBe('true');
    await act(async () => more!.click());
    const logout = host.querySelector<HTMLButtonElement>('dialog button[aria-label="Đăng xuất"]');
    expect(logout).not.toBeNull();
    await act(async () => logout!.click());
    const confirm = [...host.querySelectorAll<HTMLButtonElement>('dialog button')].find(button => button.textContent === 'Đăng xuất')!;
    await act(async () => confirm.click());
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('offers floating direct messages and AI assistant for members, and hides both during scanning', async () => {
    const router = await renderPortal('MEMBER', '/member/dashboard');
    expect(host.querySelector('.chat-widget')).not.toBeNull();
    expect(host.querySelector('.member-ai-chat')).not.toBeNull();
    expect(host.querySelector('.app-sidebar a[href="/messages"]')).toBeNull();
    await act(async () => router.navigate('/member/check-in'));
    expect(host.querySelector('.chat-widget')).toBeNull();
    expect(host.querySelector('.member-ai-chat')).toBeNull();
  });

  it('closes install help before closing its parent navigation menu', async () => {
    await renderPortal('MEMBER', '/member/dashboard');
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Thêm màn hình"]')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('.pwa-install-button')!.click());
    const dialogs = host.querySelectorAll('dialog');
    expect(dialogs).toHaveLength(2);
    await act(async () => dialogs[1].dispatchEvent(new Event('cancel', { cancelable: true })));
    expect(host.querySelectorAll('dialog')).toHaveLength(1);
    expect(host.querySelector('dialog .portal-screen-results')).not.toBeNull();
  });
});
