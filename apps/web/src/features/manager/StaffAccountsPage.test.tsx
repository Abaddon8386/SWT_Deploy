import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { StaffAccountsPage } from './StaffAccountsPage';
import { createStaffAccount, listStaffAccounts, setStaffAccountLocked } from './staffAccountsApi';

vi.mock('./staffAccountsApi', () => ({ createStaffAccount: vi.fn(), listStaffAccounts: vi.fn(), setStaffAccountLocked: vi.fn() }));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(listStaffAccounts).mockResolvedValue([]);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it('offers only Coach and Receptionist and creates an account using the provisioned email', async () => {
  vi.mocked(createStaffAccount).mockResolvedValue({ id: 4, fullName: 'New Coach', email: 'coach@gmail.com', roleCode: 'COACH', status: 'active' });
  await act(async () => root.render(<StaffAccountsPage />));
  expect(host.textContent).toContain('Chưa có tài khoản nhân sự');
  await act(async () => host.querySelector<HTMLButtonElement>('#staff-role')!.click());
  expect([...host.querySelectorAll('[role="option"]')].map(option => option.textContent?.trim())).toEqual(['Huấn luyện viên', 'Lễ tân']);
  await act(async () => host.querySelector<HTMLButtonElement>('#staff-role')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  const setInput = async (id: string, value: string) => {
    const input = host.querySelector<HTMLInputElement>(`#${id}`)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  await setInput('staff-name', 'New Coach');
  await setInput('staff-email', 'coach@gmail.com');
  await setInput('staff-password', 'Secret123!');
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(createStaffAccount).toHaveBeenCalledWith({ fullName: 'New Coach', email: 'coach@gmail.com', phone: undefined, password: 'Secret123!', gender: 'other', roleCode: 'COACH' });
  expect(host.querySelector('tbody')?.textContent).toContain('coach@gmail.com');
  expect(host.querySelector<HTMLInputElement>('#staff-password')?.value).toBe('');
  expect(host.textContent).not.toContain('Phân quyền');
});

it('shows a load failure with retry and never treats it as an empty list', async () => {
  vi.mocked(listStaffAccounts).mockRejectedValueOnce(new Error('Không thể kết nối'));
  await act(async () => root.render(<StaffAccountsPage />));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Không thể kết nối');
  expect(host.textContent).not.toContain('Chưa có tài khoản nhân sự');
  expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Thử lại')!.click());
  expect(host.textContent).toContain('Chưa có tài khoản nhân sự');
});

it('locks and unlocks a staff account from the list after confirmation and reports a failed change', async () => {
  const coach = { id: 8, fullName: 'Coach A', email: 'a@gmail.com', roleCode: 'COACH' as const, status: 'active' };
  vi.mocked(listStaffAccounts).mockResolvedValue([coach]);
  vi.mocked(setStaffAccountLocked).mockResolvedValueOnce({ ...coach, status: 'locked' });
  await act(async () => root.render(<StaffAccountsPage />));
  const rowButton = () => host.querySelector<HTMLButtonElement>('tbody button')!;
  expect(rowButton().textContent).toBe('Khóa');
  await act(async () => rowButton().click());
  const confirmLock = [...host.querySelectorAll<HTMLButtonElement>('dialog button')].find(btn => btn.textContent === 'Khóa tài khoản')!;
  expect(confirmLock).toBeDefined();
  await act(async () => confirmLock.click());
  expect(setStaffAccountLocked).toHaveBeenLastCalledWith(8, true);
  expect(host.querySelector('tbody')?.textContent).toContain('Đã khóa');
  expect(rowButton().textContent).toBe('Mở khóa');
  vi.mocked(setStaffAccountLocked).mockRejectedValueOnce(new Error('Không thể mở khóa'));
  await act(async () => rowButton().click());
  const confirmUnlock = [...host.querySelectorAll<HTMLButtonElement>('dialog button')].find(btn => btn.textContent === 'Mở khóa')!;
  expect(confirmUnlock).toBeDefined();
  await act(async () => confirmUnlock.click());
  expect(setStaffAccountLocked).toHaveBeenLastCalledWith(8, false);
  expect(host.querySelector('tbody')?.textContent).toContain('Đã khóa');
});
