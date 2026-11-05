import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagerCoachAssignmentsPage } from './ManagerCoachAssignmentsPage';
import { coachAssignmentsApi, type CoachAssignmentData } from './coachAssignmentsApi';

vi.mock('./coachAssignmentsApi', () => ({
  coachAssignmentsApi: {
    getOverview: vi.fn(),
    assignStudent: vi.fn(),
    reassignStudent: vi.fn(),
    removeAssignment: vi.fn(),
  },
}));

vi.mock('../../shared/api/client', () => ({
  apiFetch: vi.fn(),
}));

describe('ManagerCoachAssignmentsPage', () => {
  let host: HTMLDivElement;
  let root: Root;

  const mockData: CoachAssignmentData = {
    stats: {
      totalCoaches: 2,
      activeCoaches: 2,
      totalAssignedStudents: 3,
      totalPtStudents: 1,
      totalPlanStudents: 1,
      totalClassStudents: 1,
    },
    coaches: [
      {
        coachId: 10,
        coachName: 'HLV Trần Văn A',
        coachEmail: 'coach.a@solfitness.vn',
        coachPhone: '0901234567',
        specialization: 'Fitness & Bulking',
        bio: '10 năm kinh nghiệm',
        employmentStatus: 'ACTIVE',
        totalStudentsCount: 2,
        ptStudentsCount: 1,
        planStudentsCount: 1,
        classStudentsCount: 0,
        students: [
          {
            memberId: 101,
            membershipCode: 'MEM-001',
            fullName: 'Nguyễn Văn Member',
            phone: '0912345678',
            email: 'member1@test.com',
            avatarUrl: null,
            fitnessGoal: 'Tăng cơ giảm mỡ',
            fitnessLevel: 'INTERMEDIATE',
            healthNotes: 'Không có chấn thương',
            assignmentType: 'PT_1_1',
            assignmentTypeLabel: 'Kèm riêng 1:1',
            detail: 'Buổi PT Fitness cá nhân',
            startDate: '2026-11-01',
            endDate: '2026-11-30',
            nextSession: '2026-11-10 09:00',
            status: 'confirmed',
            referenceId: 501,
          },
          {
            memberId: 102,
            membershipCode: 'MEM-002',
            fullName: 'Lê Thị Hoa',
            phone: '0933333333',
            email: 'hoa.le@test.com',
            avatarUrl: null,
            fitnessGoal: 'Giảm 3kg mỡ',
            fitnessLevel: 'BEGINNER',
            healthNotes: 'Đau khớp gối nhẹ',
            assignmentType: 'TRAINING_PLAN',
            assignmentTypeLabel: 'Giáo án riêng',
            detail: 'Kế hoạch siết cơ 4 tuần',
            startDate: '2026-11-05',
            endDate: '2026-12-05',
            nextSession: null,
            status: 'active',
            referenceId: 601,
          },
        ],
      },
      {
        coachId: 11,
        coachName: 'HLV Nguyễn Thị B',
        coachEmail: 'coach.b@solfitness.vn',
        coachPhone: '0909999999',
        specialization: 'Pilates & Yoga',
        bio: 'Chứng chỉ quốc tế',
        employmentStatus: 'ACTIVE',
        totalStudentsCount: 1,
        ptStudentsCount: 0,
        planStudentsCount: 0,
        classStudentsCount: 1,
        students: [
          {
            memberId: 103,
            membershipCode: 'MEM-003',
            fullName: 'Phạm Minh Tuấn',
            phone: '0988888888',
            email: 'tuan.pm@test.com',
            avatarUrl: null,
            fitnessGoal: 'Dẻo dai',
            fitnessLevel: 'ALL',
            healthNotes: null,
            assignmentType: 'CLASS',
            assignmentTypeLabel: 'Lớp học nhóm',
            detail: 'Lớp Pilates Sáng Thứ 7',
            startDate: '2026-11-08',
            endDate: '2026-11-08',
            nextSession: '2026-11-08 07:00',
            status: 'confirmed',
            referenceId: 701,
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.mocked(coachAssignmentsApi.getOverview).mockImplementation(async (params) => {
      if (params?.search === 'Lê Thị Hoa') {
        return {
          stats: mockData.stats,
          coaches: [
            {
              ...mockData.coaches[0],
              students: [mockData.coaches[0].students[1]],
              totalStudentsCount: 1,
            },
          ],
        };
      }
      return mockData;
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  async function renderComponent() {
    await act(async () => {
      root.render(<ManagerCoachAssignmentsPage />);
    });
    // Wait for the 200ms debounce timer + load promise resolution
    await act(async () => {
      await new Promise((r) => setTimeout(r, 260));
    });
  }

  it('renders the header and summary stats correctly', async () => {
    await renderComponent();

    expect(host.textContent).toContain('Quản lý HLV & Học viên phụ trách');
    expect(host.textContent).toContain('Tổng số Huấn luyện viên');
    expect(host.textContent).toContain('Tổng học viên đang theo kèm');
    expect(host.textContent).toContain('Học viên tập 1:1 (PT)');
    expect(host.textContent).toContain('Theo giáo án riêng');
    expect(host.textContent).toContain('HLV Trần Văn A');
    expect(host.textContent).toContain('HLV Nguyễn Thị B');
    expect(host.textContent).toContain('Nguyễn Văn Member');
    expect(host.textContent).toContain('Lê Thị Hoa');
    expect(host.textContent).toContain('Phạm Minh Tuấn');
  });

  it('filters students based on search input', async () => {
    await renderComponent();

    const searchInput = host.querySelector('input[type="search"]') as HTMLInputElement;
    expect(searchInput).toBeTruthy();

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeInputValueSetter?.call(searchInput, 'Lê Thị Hoa');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 260));
    });

    expect(host.textContent).toContain('Lê Thị Hoa');
    expect(host.textContent).not.toContain('Nguyễn Văn Member');
  });

  it('switches between cards and table view mode', async () => {
    await renderComponent();

    const tableModeBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Bảng danh sách')
    );
    expect(tableModeBtn).toBeTruthy();

    await act(async () => {
      tableModeBtn?.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(host.querySelector('.coach-table-container')).toBeTruthy();
    expect(host.textContent).toContain('MEM-001');
    expect(host.textContent).toContain('MEM-002');
  });

  it('opens assign student modal when clicking Phân công học viên mới', async () => {
    await renderComponent();

    const assignBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('+ Phân công học viên mới')
    );
    expect(assignBtn).toBeTruthy();

    await act(async () => {
      assignBtn?.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(host.textContent).toContain('Phân công học viên mới cho Huấn luyện viên');
    expect(host.textContent).toContain('Chọn Huấn luyện viên phụ trách');
  });
});
