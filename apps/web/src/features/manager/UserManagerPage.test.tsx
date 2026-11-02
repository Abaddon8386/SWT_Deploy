import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserManagerPage } from './UserManagerPage';
import { userApi, UserAccount } from './userApi';

vi.mock('./userApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./userApi')>();
  return {
    ...actual,
    userApi: {
      getUsers: vi.fn(),
      getRolePermissions: vi.fn(),
      getPermissions: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      toggleLockUser: vi.fn(),
      deleteUser: vi.fn(),
      cleanupInactiveUsers: vi.fn(),
      toggleRolePermission: vi.fn(),
    },
  };
});

describe('UserManagerPage', () => {
  let host: HTMLDivElement;
  let root: Root;

  const sampleUsers: UserAccount[] = [
    {
      id: '1',
      name: 'Manager User',
      email: 'manager@scms.local',
      phone: '0901000001',
      role: 'CENTER_MANAGER',
      gender: 'male',
      status: 'ACTIVE',
      deleted_at: null,
      created_at: '2026-01-01',
      last_login_at: '2026-10-20T10:00:00',
      is_frozen: false,
    },
    {
      id: '2',
      name: 'Frozen Member',
      email: 'frozen@scms.local',
      phone: '0901000002',
      role: 'MEMBER',
      gender: 'female',
      status: 'ACTIVE',
      deleted_at: null,
      created_at: '2026-01-02',
      last_login_at: '2026-02-01T10:00:00',
      is_frozen: true,
    },
    {
      id: '3',
      name: 'Inactive Coach',
      email: 'coach@scms.local',
      phone: '0901000003',
      role: 'COACH',
      gender: 'male',
      status: 'ACTIVE',
      deleted_at: null,
      created_at: '2026-01-03',
      last_login_at: '2026-02-01T10:00:00',
      is_frozen: false,
    },
  ];

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    vi.mocked(userApi.getUsers).mockResolvedValue(sampleUsers);
    vi.mocked(userApi.getRolePermissions).mockResolvedValue({
      ADMIN: [],
      CENTER_MANAGER: [],
      COACH: [],
      RECEPTIONIST: [],
      MEMBER: [],
    });
    vi.mocked(userApi.getPermissions).mockResolvedValue([]);
    vi.mocked(userApi.deleteUser).mockResolvedValue(undefined as unknown as void);
    vi.mocked(userApi.cleanupInactiveUsers).mockResolvedValue({
      deletedCount: 1,
      message: 'Đã dọn dẹp 1 tài khoản không hoạt động.',
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const button = (container: HTMLElement, label: string) =>
    [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);

  it('renders user list with the cleanup option in a menu and frozen status badge', async () => {
    await act(async () => {
      root.render(<UserManagerPage />);
    });

    expect(host.textContent).not.toContain('Chính sách tự động dọn dẹp tài khoản');
    expect(host.querySelector('.action-menu')?.textContent).toContain('Quét & Dọn dẹp ngay');
    expect(host.textContent).toContain('Frozen Member');
    expect(host.textContent).toContain('Đang bảo lưu tập');
    expect(host.textContent).toContain('Inactive Coach');
  });

  it('opens confirmation modal and soft deletes a user', async () => {
    await act(async () => {
      root.render(<UserManagerPage />);
    });

    // Find delete buttons in table
    const deleteButtons = [...host.querySelectorAll('button')].filter(
      (b) => b.textContent?.trim() === 'Xóa'
    );
    expect(deleteButtons.length).toBe(3);

    // First button is for CENTER_MANAGER, should be disabled
    expect((deleteButtons[0] as HTMLButtonElement).disabled).toBe(true);

    // Click delete on Inactive Coach (3rd delete button)
    await act(async () => {
      deleteButtons[2].click();
    });

    // Confirm dialog should be open
    expect(host.textContent).toContain('Xác nhận xóa tài khoản');
    expect(host.textContent).toContain('Inactive Coach');

    // Click confirm delete
    const confirmBtn = button(host, 'Xác nhận xóa');
    expect(confirmBtn).toBeTruthy();

    await act(async () => {
      confirmBtn?.click();
    });

    expect(userApi.deleteUser).toHaveBeenCalledWith('3');
  });

  it('triggers manual cleanup modal and calls cleanupInactiveUsers', async () => {
    await act(async () => {
      root.render(<UserManagerPage />);
    });

    const cleanupTriggerBtn = button(host, 'Quét & Dọn dẹp ngay');
    expect(cleanupTriggerBtn).toBeTruthy();

    await act(async () => {
      cleanupTriggerBtn?.click();
    });

    expect(host.textContent).toContain('Quét & dọn dẹp tài khoản quá 6 tháng');
    expect(host.textContent).toContain('bảo lưu tập (frozen)');

    const startBtn = button(host, 'Bắt đầu quét & dọn dẹp');
    expect(startBtn).toBeTruthy();

    await act(async () => {
      startBtn?.click();
    });

    expect(userApi.cleanupInactiveUsers).toHaveBeenCalledTimes(1);
  });
});
