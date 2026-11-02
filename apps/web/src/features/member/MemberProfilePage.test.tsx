import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberProfilePage } from './MemberProfilePage';
import type { Profile, HealthMetric } from './profileApi';
import { AUTH_STORAGE_KEY } from '../../shared/api/client';

const mockApi = vi.hoisted(() => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  listHealthMetrics: vi.fn(),
  addHealthMetric: vi.fn(),
  updateHealthMetric: vi.fn(),
  deleteHealthMetric: vi.fn(),
}));

vi.mock('./profileApi', () => ({
  getProfile: mockApi.getProfile,
  updateProfile: mockApi.updateProfile,
  listHealthMetrics: mockApi.listHealthMetrics,
  addHealthMetric: mockApi.addHealthMetric,
  updateHealthMetric: mockApi.updateHealthMetric,
  deleteHealthMetric: mockApi.deleteHealthMetric,
}));

const sampleProfile: Profile = {
  userId: 10,
  fullName: 'Nguyen Van Test',
  email: 'test@example.com',
  phone: '0912345678',
  dob: '1990-01-01',
  gender: 'male',
  avatarUrl: null,
  address: '123 Pho Hue, Ha Noi',
  membershipCode: 'MEM12345',
  emergencyContactName: 'Nguyen Thi Me',
  emergencyContactPhone: '0987654321',
  fitnessGoal: 'Tang co',
  healthNotes: 'Khong benh ly',
  fitnessLevel: 'beginner',
};

const sampleMetrics: HealthMetric[] = [
  {
    id: 1,
    metricName: 'weight',
    metricValue: 70,
    unit: 'kg',
    recordedAt: '2026-10-01T08:00:00Z',
  },
];

describe('MemberProfilePage role-based health metrics rendering', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    mockApi.getProfile.mockReset();
    mockApi.updateProfile.mockReset();
    mockApi.listHealthMetrics.mockReset();
    mockApi.addHealthMetric.mockReset();
    mockApi.updateHealthMetric.mockReset();
    mockApi.deleteHealthMetric.mockReset();

    mockApi.getProfile.mockResolvedValue(sampleProfile);
    mockApi.listHealthMetrics.mockResolvedValue(sampleMetrics);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  async function renderPage() {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <MemberProfilePage />
        </MemoryRouter>
      );
    });
  }

  it('renders health metrics section and member fields for MEMBER role', async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ id: '10', name: 'Nguyen Van Test', identifier: 'member1', role: 'MEMBER' })
    );

    await renderPage();

    expect(mockApi.getProfile).toHaveBeenCalled();
    expect(mockApi.listHealthMetrics).toHaveBeenCalledWith(10);

    // Should display health metrics column
    expect(host.textContent).toContain('Chỉ số sức khỏe');
    expect(host.textContent).toContain('Cân nặng (kg)');
    expect(host.textContent).toContain('Mã hội viên');
    expect(host.textContent).toContain('Trình độ thể lực');
    expect(host.textContent).toContain('Mục tiêu thể lực');
    expect(host.textContent).toContain('Ghi chú sức khỏe & chấn thương');
  });

  it('allows editing a health metric and saving update', async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ id: '10', name: 'Nguyen Van Test', identifier: 'member1', role: 'MEMBER' })
    );
    mockApi.updateHealthMetric.mockResolvedValue({
      id: 1,
      metricName: 'weight',
      metricValue: 70,
      unit: 'kg',
      recordedAt: '2026-10-01T08:00:00Z',
    });

    await renderPage();

    const editBtn = host.querySelector('.btn-metric-edit') as HTMLButtonElement | null;
    expect(editBtn).not.toBeNull();
    expect(editBtn?.textContent).toBe('Sửa');

    await act(async () => {
      editBtn?.click();
    });

    // Should display editing state
    expect(host.textContent).toContain('Đang sửa chỉ số');
    expect(host.textContent).toContain('Lưu cập nhật');

    const form = host.querySelector('.profile-metric-form') as HTMLFormElement | null;
    expect(form).not.toBeNull();

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mockApi.updateHealthMetric).toHaveBeenCalledWith(10, 1, {
      metricName: 'weight',
      metricValue: 70,
      unit: 'kg',
    });
  });

  it('allows deleting a health metric when confirmed', async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ id: '10', name: 'Nguyen Van Test', identifier: 'member1', role: 'MEMBER' })
    );
    window.confirm = vi.fn().mockReturnValue(true);
    mockApi.deleteHealthMetric.mockResolvedValue(null);

    await renderPage();

    const deleteBtn = host.querySelector('.btn-metric-delete') as HTMLButtonElement | null;
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn?.textContent).toBe('Xóa');

    await act(async () => {
      deleteBtn?.click();
    });

    expect(window.confirm).toHaveBeenCalled();
    expect(mockApi.deleteHealthMetric).toHaveBeenCalledWith(10, 1);
  });

  it('hides health metrics section and member fitness fields for COACH role', async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ id: '20', name: 'Coach Huấn Luyện', identifier: 'coach1', role: 'COACH' })
    );

    await renderPage();

    expect(mockApi.getProfile).toHaveBeenCalled();
    // listHealthMetrics should NOT be called for coach
    expect(mockApi.listHealthMetrics).not.toHaveBeenCalled();

    // Health metrics card should be hidden
    expect(host.textContent).not.toContain('Chỉ số sức khỏe');
    expect(host.textContent).not.toContain('Mã hội viên');
    expect(host.textContent).not.toContain('Trình độ thể lực');
    expect(host.textContent).not.toContain('Mục tiêu thể lực');
    expect(host.textContent).not.toContain('Ghi chú sức khỏe & chấn thương');

    // Should display Role badge
    expect(host.textContent).toContain('Huấn luyện viên');
  });

  it('hides health metrics section and member fitness fields for STAFF (Receptionist) role', async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ id: '30', name: 'Le Tan Quầy', identifier: 'staff1', role: 'STAFF' })
    );

    await renderPage();

    expect(mockApi.getProfile).toHaveBeenCalled();
    expect(mockApi.listHealthMetrics).not.toHaveBeenCalled();

    expect(host.textContent).not.toContain('Chỉ số sức khỏe');
    expect(host.textContent).not.toContain('Mã hội viên');
    expect(host.textContent).toContain('Lễ tân');
  });

  it.each([['MANAGER', 'Quản lý trung tâm'], ['ADMIN', 'Quản trị hệ thống']])('shows the correct administrative profile without member fields: %s', async (role, label) => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ id: '1', name: 'Admin Manager', identifier: 'admin', role })
    );

    await renderPage();

    expect(mockApi.getProfile).toHaveBeenCalled();
    expect(mockApi.listHealthMetrics).not.toHaveBeenCalled();

    expect(host.textContent).not.toContain('Chỉ số sức khỏe');
    expect(host.textContent).not.toContain('Mã hội viên');
    expect(host.textContent).toContain(label);
  });
});
