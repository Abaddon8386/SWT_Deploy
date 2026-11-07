import { setLanguage } from '../../shared/i18n';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RegisterPage } from './RegisterPage';

const api = vi.hoisted(() => ({ register: vi.fn(), sendOtp: vi.fn(), verifyOtp: vi.fn() }));
vi.mock('./authApi', () => api);
vi.mock('../landing/components/PublicLayout', () => ({ AuthLayout: ({ children }: { children: React.ReactNode }) => children }));
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  sessionStorage.clear();
  setLanguage('vi');
  Object.values(api).forEach(fn => fn.mockReset());
  api.register.mockResolvedValue({}); api.sendOtp.mockResolvedValue({}); api.verifyOtp.mockResolvedValue({});
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function CurrentLocation() {
  const { pathname, search } = useLocation();
  return <output data-testid="auth-location">{pathname}{search}</output>;
}
async function render(path = '/register') {
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}><RegisterPage /><CurrentLocation /></MemoryRouter>));
}
async function fill(id: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`#${id}`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function validForm(phone = '') {
  await fill('reg-username', ' buyer '); await fill('reg-email', 'buyer@example.test');
  await fill('reg-phone', phone); await fill('reg-password', 'Buyer123!');
}
async function submit() { await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); }

it('returns to login immediately after OTP confirmation and keeps the selected package', async () => {
  vi.useFakeTimers();
  await render('/register?returnTo=%2Fmember%2Fpackages%3FpackageId%3D2');
  await validForm(); await submit();
  await fill('otp-code', '123456'); await submit();
  expect(host.querySelector('[data-testid="auth-location"]')?.textContent)
    .toBe('/login?returnTo=%2Fmember%2Fpackages%3FpackageId%3D2');
});

it('normalizes the phone example before sending the validated registration', async () => {
  await render(); await validForm('0912 345 678'); await submit();
  expect(api.register).toHaveBeenCalledWith({ username: 'buyer', email: 'buyer@example.test', phone: '0912345678', password: 'Buyer123!' });
  expect(host.querySelector('#otp-code')).not.toBeNull();
});

it('links validation errors to their inputs and focuses the first invalid field', async () => {
  await render(); await validForm('1234'); await submit();
  const phone = host.querySelector<HTMLInputElement>('#reg-phone')!;
  expect(phone.getAttribute('aria-invalid')).toBe('true');
  expect(host.querySelector(`#${phone.getAttribute('aria-describedby')}`)?.textContent).toContain('Số điện thoại');
  expect(document.activeElement).toBe(phone);
  expect(api.register).not.toHaveBeenCalled();
});

it('keeps the registered account at OTP when delivery fails and retries only delivery', async () => {
  api.sendOtp.mockRejectedValueOnce(new Error('Mail unavailable')).mockResolvedValue({});
  await render(); await validForm(); await submit();
  expect(host.querySelector('#otp-code')).not.toBeNull();
  expect(host.textContent).toContain('Mail unavailable');
  const resend = [...host.querySelectorAll('button')].find(b => b.textContent === 'Gửi lại mã OTP')!;
  await act(async () => resend.click());
  expect(api.register).toHaveBeenCalledTimes(1);
  expect(api.sendOtp).toHaveBeenCalledTimes(2);
});

it('restores only the pending account identity after remount without storing credentials', async () => {
  await render(); await validForm(); await submit();
  expect(JSON.stringify(sessionStorage)).not.toContain('Buyer123!');
  await act(async () => root.unmount()); root = createRoot(host); await render();
  expect(host.querySelector('#otp-code')).not.toBeNull();
  expect(host.textContent).toContain('buyer@example.test');
  expect(api.register).toHaveBeenCalledTimes(1);
});

it('lets the buyer explicitly start another account when the pending mailbox is inaccessible', async () => {
  await render(); await validForm(); await submit();
  const restart = [...host.querySelectorAll('button')].find(b => b.textContent === 'Đăng ký tài khoản khác')!;
  await act(async () => restart.click());
  expect(host.querySelector('#reg-email')).not.toBeNull();
  expect(host.querySelector<HTMLInputElement>('#reg-email')?.value).toBe('');
  expect(sessionStorage.getItem('scms_pending_registration')).toBeNull();
  expect(api.register).toHaveBeenCalledTimes(1);
});


it('switches registration and existing client validation VI → EN → VI', async () => {
  await render(); await validForm('1234'); await submit();
  expect(host.querySelector('#reg-phone-error')?.textContent).toContain('Số điện thoại');
  await act(async () => setLanguage('en'));
  expect(host.querySelector('label[for="reg-username"]')?.textContent).toContain('Username');
  expect(host.querySelector('#reg-phone-error')?.textContent).toContain('Invalid phone number');
  expect(host.querySelector<HTMLInputElement>('#reg-password')?.placeholder).toBe('At least 6 characters');
  expect(api.register).not.toHaveBeenCalled();
  await act(async () => setLanguage('vi'));
  expect(host.querySelector('#reg-phone-error')?.textContent).toContain('Số điện thoại');
  expect(host.querySelector<HTMLInputElement>('#reg-password')?.placeholder).toBe('Tối thiểu 6 ký tự');
});
