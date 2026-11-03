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

  it('shows a single personal profile without loading health metrics for MEMBER role', async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ id: '10', name: 'Nguyen Van Test', identifier: 'member1', role: 'MEMBER' })
    );

    await renderPage();

    expect(mockApi.getProfile).toHaveBeenCalled();
    expect(mockApi.listHealthMetrics).not.toHaveBeenCalled();

    // Should display health metrics column
    expect(host.textContent).not.toContain('Chỉ số sức khỏe');
    expect(host.querySelector('h1')?.textContent).toBe('Hồ sơ cá nhân');
    expect(host.querySelector('.profile-grid--single')).not.toBeNull();
    expect(host.querySelectorAll('.portal-card')).toHaveLength(1);
    expect(host.querySelector('#health-metric-type')).toBeNull();
    expect(host.querySelector('.profile-metric-form')).toBeNull();
    expect(host.textContent).toContain('Mã hội viên');
    expect(host.textContent).toContain('Trình độ thể lực');
    expect(host.textContent).toContain('Mục tiêu thể lực');
    expect(host.textContent).toContain('Ghi chú sức khỏe & chấn thương');
  });

  it('saves the personal profile without mutating health measurements', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ id: '10', name: 'Member', identifier: 'member1', role: 'MEMBER' }));
    mockApi.updateProfile.mockResolvedValue(sampleProfile);
    await renderPage();
    await act(async () => host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(mockApi.updateProfile).toHaveBeenCalledWith(sampleProfile);
    expect(mockApi.addHealthMetric).not.toHaveBeenCalled();
    expect(mockApi.updateHealthMetric).not.toHaveBeenCalled();
    expect(mockApi.deleteHealthMetric).not.toHaveBeenCalled();
  });

  it('retains profile form and reports save failure', async () => {
    mockApi.updateProfile.mockRejectedValue(new Error('Cannot save'));
    await renderPage();
    await act(async () => host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect((host.querySelector('#fullName') as HTMLInputElement).value).toBe(sampleProfile.fullName);
    expect((host.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
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
