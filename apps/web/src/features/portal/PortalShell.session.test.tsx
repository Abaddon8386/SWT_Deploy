import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AUTH_STORAGE_KEY, TOKEN_STORAGE_KEY } from '../../shared/api/client';
import { RoleGuard } from '../../shared/ui/RoleGuard';
import { PortalShell } from './PortalShell';

const session = (identifier: string, role: string) => JSON.stringify({ id: identifier, name: identifier, identifier, role });

/** Mô phỏng tab khác đổi localStorage: trình duyệt chỉ phát `storage` cho tab còn lại. */
function changeSessionFromAnotherTab(identifier: string, role: string) {
  localStorage.setItem(AUTH_STORAGE_KEY, session(identifier, role));
  window.dispatchEvent(new StorageEvent('storage', { key: AUTH_STORAGE_KEY }));
}

function PageWithDraft() {
  const [draft] = useState(() => Math.random());
  return <h1 data-draft={draft}>Trang có state</h1>;
}

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // Phiên được đối chiếu với server khi vào portal: mặc định server xác nhận đúng phiên đang lưu
  const backendRole: Record<string, string> = { MEMBER: 'MEMBER', COACH: 'COACH', ADMIN: 'ADMIN', MANAGER: 'CENTER_MANAGER', STAFF: 'RECEPTIONIST' };
  vi.stubGlobal('fetch', vi.fn(() => {
    const stored = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? '{}');
    return Promise.resolve(new Response(JSON.stringify({ success: true, data: { username: stored.identifier, role: backendRole[stored.role] } })));
  }));
  localStorage.setItem(TOKEN_STORAGE_KEY, 'token');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('redirects a stale tab to the new account home when another tab signs in as a different role', async () => {
  localStorage.setItem(AUTH_STORAGE_KEY, session('member01', 'MEMBER'));
  const router = createMemoryRouter([
    { element: <RoleGuard allowedRoles={['MEMBER']} />, children: [{ path: '/member/dashboard', element: <h1>Bảng điều khiển hội viên</h1> }] },
    { path: '/admin/users', element: <h1>Quản trị tài khoản</h1> },
    { path: '/login', element: <h1>Đăng nhập</h1> },
  ], { initialEntries: ['/member/dashboard'] });
  try {
    await act(async () => root.render(<RouterProvider router={router} />));
    expect(host.textContent).toContain('Bảng điều khiển hội viên');

    await act(async () => changeSessionFromAnotherTab('admin01', 'ADMIN'));
    expect(router.state.location.pathname).toBe('/admin/users');
    expect(host.textContent).toContain('Quản trị tài khoản');
    expect(host.textContent).not.toContain('Bảng điều khiển hội viên');
  } finally {
    router.dispose();
  }
});

it('sends a stale tab to login when another tab signs out', async () => {
  localStorage.setItem(AUTH_STORAGE_KEY, session('member01', 'MEMBER'));
  const router = createMemoryRouter([
    { element: <RoleGuard allowedRoles={['MEMBER']} />, children: [{ path: '/member/dashboard', element: <h1>Bảng điều khiển hội viên</h1> }] },
    { path: '/login', element: <h1>Đăng nhập</h1> },
  ], { initialEntries: ['/member/dashboard'] });
  try {
    await act(async () => root.render(<RouterProvider router={router} />));
    await act(async () => {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      window.dispatchEvent(new StorageEvent('storage', { key: AUTH_STORAGE_KEY }));
    });
    expect(router.state.location.pathname).toBe('/login');
  } finally {
    router.dispose();
  }
});

it('remounts the portal for a new identity so the previous account never leaks into the new one', async () => {
  localStorage.setItem(AUTH_STORAGE_KEY, session('member01', 'MEMBER'));
  const router = createMemoryRouter([{ element: <PortalShell />, children: [
    { path: '/member/dashboard', element: <PageWithDraft /> },
  ] }], { initialEntries: ['/member/dashboard'] });
  try {
    await act(async () => root.render(<RouterProvider router={router} />));
    const before = host.querySelector('h1')?.getAttribute('data-draft');
    // Vai trò chỉ hiện trong menu avatar, không còn ở thanh trên cùng.
    expect(host.querySelector('.portal-workspace-role')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="portal-avatar-trigger"]')!.click());
    expect(host.querySelector('.portal-avatar-dropdown .portal-workspace-role')?.textContent).toContain('Hội viên');

    await act(async () => changeSessionFromAnotherTab('member02', 'MEMBER'));
    expect(host.querySelector('.portal-account-name')?.textContent).toContain('member02');
    expect(host.querySelector('h1')?.getAttribute('data-draft')).not.toBe(before);

    await act(async () => changeSessionFromAnotherTab('coach01', 'COACH'));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="portal-avatar-trigger"]')!.click());
    expect(host.querySelector('.portal-avatar-dropdown .portal-workspace-role')?.textContent).toContain('Huấn luyện viên');
    expect(host.querySelector('.portal-account-name')?.textContent).toContain('coach01');
    expect(host.querySelector('.portal-account-name')?.textContent).not.toContain('member');
  } finally {
    router.dispose();
  }
});

it('adopts the role reported by the server when it differs from the stored one', async () => {
  localStorage.setItem(AUTH_STORAGE_KEY, session('user01', 'MEMBER'));
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ success: true, data: { username: 'user01', role: 'CENTER_MANAGER' } })))));
  const router = createMemoryRouter([
    { element: <RoleGuard allowedRoles={['MEMBER']} />, children: [{ element: <PortalShell />, children: [{ path: '/member/dashboard', element: <h1>Bảng điều khiển hội viên</h1> }] }] },
    { path: '/manager/reports', element: <h1>Báo cáo & Doanh thu</h1> },
  ], { initialEntries: ['/member/dashboard'] });
  try {
    await act(async () => root.render(<RouterProvider router={router} />));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/manager/reports'));
    expect(JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)!).role).toBe('MANAGER');
  } finally {
    router.dispose();
  }
});
