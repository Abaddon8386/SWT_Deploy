import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getCurrentUser } from '../../shared/api/client';
import { LuxuryLoginForm } from './LuxuryLoginForm';

let host: HTMLDivElement;
let root: Root;
let oauthCallback: ((response: { access_token?: string }) => void) | undefined;
const requestAccessToken = vi.fn();

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  sessionStorage.clear();
  oauthCallback = undefined;
  requestAccessToken.mockReset();
  window.history.replaceState({}, '', '/login');
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client.apps.googleusercontent.com');
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: vi.fn((config) => {
          oauthCallback = config.callback;
          return { requestAccessToken };
        }),
      },
    },
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete window.google;
  window.history.replaceState({}, '', '/');
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});

function CurrentLocation() {
  const { pathname, search } = useLocation();
  return <output data-testid="auth-location">{pathname}{search}</output>;
}

async function renderForm() {
  await act(async () => root.render(<MemoryRouter initialEntries={['/login']}><LuxuryLoginForm /><CurrentLocation /></MemoryRouter>));
}

it.each([
  ['MEMBER', '/member/dashboard'], ['RECEPTIONIST', '/staff/reception'],
  ['COACH', '/staff/attendance'], ['CENTER_MANAGER', '/manager/reports'],
])('navigates %s immediately after password authentication without advancing timers', async (role, destination) => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true,
    data: { token: 'test-jwt', username: 'staff', role },
  }))));
  await renderForm();
  for (const [id, value] of [['login-identifier', 'staff'], ['login-password', 'Password123!']]) {
    const input = host.querySelector<HTMLInputElement>(`#${id}`)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(host.querySelector('[data-testid="auth-location"]')?.textContent).toBe(destination);
});

it('shows exactly one Google sign-in button with the requested label', async () => {
  await renderForm();
  const buttons = [...host.querySelectorAll('button')].filter((button) => /google|gmail/i.test(button.textContent || ''));
  expect(buttons).toHaveLength(1);
  expect(buttons[0].textContent?.trim()).toBe('Đăng nhập bằng Google');
  expect(host.querySelector('#google-official-btn')).toBeNull();
  await act(async () => buttons[0].click());
  expect(requestAccessToken).toHaveBeenCalledWith({ prompt: 'select_account' });
});

it('transitions to email OTP verification screen when the single Google button returns an access token', async () => {
  const mockFetch = vi.fn().mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: {
        requiresOtp: true,
        email: 'oauthuser@gmail.com',
        message: 'Đã gửi mã xác nhận đến gmail oauthuser@gmail.com. Hãy nhập mã xác nhận để kích hoạt tài khoản.',
        expiresInMinutes: 5,
        debugOtp: '654321',
      },
    }),
  });
  vi.stubGlobal('fetch', mockFetch);

  await renderForm();
  await act(async () => host.querySelector<HTMLButtonElement>('#google-oauth-btn')!.click());
  expect(oauthCallback).toBeDefined();
  await act(async () => {
    oauthCallback!({ access_token: 'mock-google-access-token' });
  });

  expect(mockFetch).toHaveBeenCalledWith(
    '/api/v1/auth/google/oauth-callback',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ accessToken: 'mock-google-access-token' }),
    }),
  );

  const otpInput = host.querySelector<HTMLInputElement>('#google-otp-code');
  expect(otpInput).not.toBeNull();
  expect(otpInput?.value).toBe('654321');
  expect(host.textContent).toContain('Xác thực tài khoản');
  expect(host.textContent).toContain('oauthuser@gmail.com');
});

it('opens email OTP verification screen automatically when redirected back from Google OAuth 2.0 callback URL', async () => {
  window.history.replaceState(
    {},
    '',
    '/login?google_oauth=callback&email=redirected%40gmail.com&message=Da+gui+OTP&debug_otp=998877',
  );

  await renderForm();

  const otpInput = host.querySelector<HTMLInputElement>('#google-otp-code');
  expect(otpInput).not.toBeNull();
  expect(otpInput?.value).toBe('998877');
  expect(host.textContent).toContain('Xác thực tài khoản');
  expect(host.textContent).toContain('redirected@gmail.com');
  expect(window.location.search).toBe('');
});


it('accepts legacy debugOtp and removes sensitive callback parameters from history', async () => {
  window.history.replaceState({}, '', '/login?google_oauth=callback&email=user%40gmail.com&debugOtp=123456&state=old-state&error=old-error');
  await renderForm();
  expect(host.querySelector<HTMLInputElement>('#google-otp-code')?.value).toBe('123456');
  expect(window.location.search).toBe('');
});


it('returns to the single Google entry point when choosing another account', async () => {
  window.history.replaceState({}, '', '/login?google_oauth=callback&email=user%40gmail.com');
  await renderForm();
  const changeAccount = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Chọn tài khoản Google khác'))!;
  await act(async () => changeAccount.click());
  expect(host.querySelector('#google-otp-code')).toBeNull();
  expect(host.querySelector('input[type="email"]')).toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>('#google-oauth-btn')!.click());
  expect(requestAccessToken).toHaveBeenCalledTimes(1);
});

it('shows a configuration error instead of introducing a separate Gmail flow', async () => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
  await renderForm();
  await act(async () => host.querySelector<HTMLButtonElement>('#google-oauth-btn')!.click());
  expect(host.textContent).toContain('Google chưa được cấu hình');
  expect(host.querySelector('input[type="email"]')).toBeNull();
  expect(requestAccessToken).not.toHaveBeenCalled();
});


it('signs in an existing active Google member immediately without showing OTP', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
    ok: true, status: 200,
    json: async () => ({ success: true, data: {
      requiresOtp: false, email: 'returning@gmail.com',
      authentication: { token: 'returning-jwt', username: 'returning-member', role: 'MEMBER' },
    } }),
  }));
  await renderForm();
  await act(async () => host.querySelector<HTMLButtonElement>('#google-oauth-btn')!.click());
  await act(async () => oauthCallback!({ access_token: 'google-access-token' }));
  expect(getCurrentUser()?.identifier).toBe('returning-member');
  expect(localStorage.getItem('fitcenter_token')).toBe('returning-jwt');
  expect(host.querySelector('[data-testid="auth-location"]')?.textContent).toBe('/member/dashboard');
  expect(host.querySelector('#google-otp-code')).toBeNull();
  vi.clearAllTimers();
  vi.useRealTimers();
});


it('redeems a browser-bound redirect and signs in without showing OTP', async () => {
  vi.useFakeTimers();
  sessionStorage.setItem('scms_google_redirect_verifier', 'v'.repeat(43));
  window.history.replaceState({}, '', '/login?google_oauth=authenticated#google_login_code=ticket-code');
  const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200,
    json: async () => ({ success: true, data: { token: 'redirect-jwt', username: 'redirect-member', role: 'MEMBER' } }),
  });
  vi.stubGlobal('fetch', mockFetch);
  await renderForm();
  expect(getCurrentUser()?.identifier).toBe('redirect-member');
  expect(host.querySelector('#google-otp-code')).toBeNull();
  expect(window.location.search).toBe('');
  expect(window.location.hash).toBe('');
  expect(sessionStorage.getItem('scms_google_redirect_verifier')).toBeNull();
  expect(mockFetch).toHaveBeenCalledWith('/api/v1/auth/google/handoff', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ code: 'ticket-code', verifier: 'v'.repeat(43) }),
  }));
  vi.clearAllTimers();
  vi.useRealTimers();
});

it('refuses a redirect handoff without the initiating browser verifier', async () => {
  window.history.replaceState({}, '', '/login?google_oauth=authenticated#google_login_code=injected-ticket');
  const mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
  await renderForm();
  expect(mockFetch).not.toHaveBeenCalled();
  expect(getCurrentUser()).toBeNull();
  expect(window.location.hash).toBe('');
});
