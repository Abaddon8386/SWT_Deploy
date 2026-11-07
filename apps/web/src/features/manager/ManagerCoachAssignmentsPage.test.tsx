import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagerCoachAssignmentsPage } from './ManagerCoachAssignmentsPage';
import { coachAssignmentsApi, type CoachAssignmentData } from './coachAssignmentsApi';
import { apiFetch } from '../../shared/api/client';
import { notify } from '../../shared/lib/portalNotices';

vi.mock('../../shared/lib/portalNotices', () => ({ notify: vi.fn() }));

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
    availableCoaches: [
      { coachId: 10, coachName: 'HLV Trần Văn A', specialization: 'Fitness & Bulking' },
      { coachId: 11, coachName: 'HLV Nguyễn Thị B', specialization: 'Pilates & Yoga' },
    ],
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
          availableCoaches: mockData.availableCoaches,
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
    vi.useRealTimers();
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

  it('submits the real lookup userId and displays rejected assignment inside the dialog', async () => {
    vi.mocked(apiFetch).mockResolvedValue([{ userId: 305, fullName: 'Hội viên thật', membershipCode: 'SOL305' }]);
    vi.mocked(coachAssignmentsApi.assignStudent).mockRejectedValue(new Error('Gói tập không còn hiệu lực'));
    await renderComponent();
    await act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent?.includes('+ Phân công'))?.click(); });
    const input = host.querySelector('#assign-member-search') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Hội viên');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { await new Promise(r => setTimeout(r, 350)); });
    await act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Hội viên thật'))?.click(); });
    await act(async () => { host.querySelector('dialog form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(coachAssignmentsApi.assignStudent).toHaveBeenCalledWith(expect.objectContaining({ memberId: 305 }));
    expect(host.querySelector('dialog [role="alert"]')?.textContent).toContain('Gói tập không còn hiệu lực');
  });

  it('keeps class assignments read-only', async () => {
    await renderComponent();
    const row = [...host.querySelectorAll('.coach-student-row')].find(r => r.textContent?.includes('Phạm Minh Tuấn'));
    expect(row?.textContent).not.toContain('Điều chuyển HLV');
    expect(row?.textContent).not.toContain('Kết thúc');
  });

  it('uses center dates in the form and formats assignment deadlines and PT times', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T18:05:00Z'));
    await renderComponent();
    expect(host.textContent).toContain('09:00 10/11/2026');
    expect(host.textContent).toContain('Hạn: 05/12/2026');
    await act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent?.includes('+ Phân công'))?.click(); });
    expect(host.querySelector('#assign-start-date')!.textContent).toContain('05/11/2026');
    expect(host.querySelector('#assign-end-date')!.textContent).toContain('05/12/2026');
  });

  it('keeps target coach options after filtering and sends the selected PT relationship only', async () => {
    await renderComponent();
    const filter = host.querySelector('select[aria-label="Lọc theo Huấn luyện viên"]') as HTMLSelectElement;
    vi.mocked(coachAssignmentsApi.getOverview).mockResolvedValue({ ...mockData, coaches: [mockData.coaches[0]] });
    await act(async () => { filter.value = '10'; filter.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { await new Promise(r => setTimeout(r, 260)); });
    await act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent === 'Điều chuyển HLV')?.click(); });
    const target = host.querySelector('#reassign-target-coach')!.closest('.ui-select')!.querySelector('select.ui-select__native') as HTMLSelectElement;
    expect([...target.options].map(o => o.value)).toContain('11');
    await act(async () => { target.value = '11'; target.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { host.querySelector('dialog form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(coachAssignmentsApi.reassignStudent).toHaveBeenCalledWith(expect.objectContaining({ assignmentType: 'PT_1_1', referenceId: 501, memberId: 101, fromCoachId: 10, toCoachId: 11 }));
    expect(notify).toHaveBeenCalledWith('Điều chuyển phân công đã chọn sang HLV mới thành công!', 'success', { translation: { vi: 'Điều chuyển phân công đã chọn sang HLV mới thành công!', en: 'Selected assignment transferred to the new coach successfully!' } });
  });

  it('locks the assignment dialog and fields while submission is pending', async () => {
    vi.mocked(apiFetch).mockResolvedValue([{ userId: 305, fullName: 'Hội viên thật', membershipCode: 'SOL305' }]);
    let finish!: () => void;
    vi.mocked(coachAssignmentsApi.assignStudent).mockImplementation(() => new Promise(resolve => { finish = () => resolve(mockData.coaches[0].students[0]); }));
    await renderComponent();
    await act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent?.includes('+ Phân công'))?.click(); });
    const input = host.querySelector('#assign-member-search') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Hội viên');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { await new Promise(r => setTimeout(r, 350)); });
    await act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Hội viên thật'))?.click(); });
    await act(async () => { host.querySelector('dialog form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    const dialog = host.querySelector('dialog')!;
    expect(dialog.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('dialog fieldset')?.hasAttribute('disabled')).toBe(true);
    await act(async () => { dialog.dispatchEvent(new Event('cancel', { bubbles: false, cancelable: true })); });
    expect(host.querySelector('dialog')).toBe(dialog);
    await act(async () => { finish(); });
    expect(host.querySelector('dialog')).toBeNull();
    expect(notify).toHaveBeenCalledWith('Phân công học viên cho huấn luyện viên thành công!', 'success', { translation: { vi: 'Phân công học viên cho huấn luyện viên thành công!', en: 'Member assigned to coach successfully!' } });
  });
});
