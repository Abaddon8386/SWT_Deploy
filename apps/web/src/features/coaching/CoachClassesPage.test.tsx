import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoachClassesPage } from './CoachClassesPage';
import { AUTH_STORAGE_KEY } from '../../shared/api/client';
import { coachingApi } from './coachingApi';
import { getCoachSchedule } from '../member/coachBookingApi';

vi.mock('../member/coachBookingApi', () => ({ getCoachSchedule: vi.fn().mockResolvedValue([]) }));

function getWeekMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatYmd(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const currentMondayStr = formatYmd(getWeekMonday(new Date()));

describe('CoachClassesPage (SCRUM-121: UI Coach Danh sách Lớp & Học viên Phụ trách)', () => {
  let host: HTMLDivElement;
  let root: Root;

  const mockSessions = [
    {
      id: 201,
      classId: 1,
      className: 'High-Intensity Strength & Conditioning',
      disciplineId: 1,
      disciplineName: 'Strength Training',
      coachId: 1,
      coachName: 'Coach Marcus Vance',
      roomId: 101,
      roomName: 'Studio 01 (Tầng 2)',
      sessionDate: currentMondayStr,
      startTime: '07:00',
      endTime: '08:15',
      status: 'scheduled',
      capacity: 15,
      bookedCount: 12,
      level: 'Trung cấp - Nâng cao',
    },
    {
      id: 202,
      classId: 2,
      className: 'Olympic Weightlifting Fundamentals',
      disciplineId: 1,
      disciplineName: 'Weightlifting',
      coachId: 1,
      coachName: 'Coach Marcus Vance',
      roomId: 102,
      roomName: 'Phòng Cử Tạ (Tầng 1)',
      sessionDate: currentMondayStr,
      startTime: '10:00',
      endTime: '11:30',
      status: 'scheduled',
      capacity: 10,
      bookedCount: 8,
      level: 'Cơ bản',
    },
  ];

  const mockStudents = [
    {
      id: 101,
      memberId: 1,
      membershipCode: 'MB-2026-001',
      fullName: 'Lê Hoàng Long',
      email: 'long.le@solfitness.vn',
      phone: '0903 112 233',
      fitnessGoal: 'Tăng khối lượng cơ nạc (Hypertrophy), giảm mỡ vùng bụng dưới.',
      healthNotes: 'Tiền sử thoát vị đĩa đệm nhẹ L4-L5.',
      fitnessLevel: 'intermediate',
      emergencyContactName: 'Lê Thu Hương (Vợ)',
      emergencyContactPhone: '0903 998 877',
      enrolledAt: '2026-10-18T09:30:00Z',
      status: 'booked',
    },
    {
      id: 102,
      memberId: 2,
      membershipCode: 'MB-2026-014',
      fullName: 'Trần Thị Thu Thảo',
      email: 'thao.tran@solfitness.vn',
      phone: '0918 456 789',
      fitnessGoal: 'Săn chắc cơ mông đùi, cải thiện tư thế đứng.',
      healthNotes: 'Khớp cổ tay phải yếu do hội chứng ống cổ tay văn phòng.',
      fitnessLevel: 'beginner',
      emergencyContactName: 'Trần Văn Hùng (Bố)',
      emergencyContactPhone: '0912 345 678',
      enrolledAt: '2026-10-18T10:15:00Z',
      status: 'booked',
    },
  ];

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    if (typeof HTMLDialogElement !== 'undefined') {
      if (!HTMLDialogElement.prototype.showModal) {
        Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
          value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); },
          writable: true,
          configurable: true,
        });
      } else {
        vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) {
          this.setAttribute('open', '');
        });
      }
      if (!HTMLDialogElement.prototype.close) {
        Object.defineProperty(HTMLDialogElement.prototype, 'close', {
          value: function (this: HTMLDialogElement) { this.removeAttribute('open'); },
          writable: true,
          configurable: true,
        });
      } else {
        vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) {
          this.removeAttribute('open');
        });
      }
    }

    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        id: 1,
        fullName: 'Marcus Vance',
        role: 'COACH',
      })
    );

    vi.spyOn(coachingApi, 'getCoachWeeklySchedule').mockResolvedValue(mockSessions);
    vi.spyOn(coachingApi, 'getSessionStudents').mockResolvedValue(mockStudents);
    vi.spyOn(coachingApi, 'getAllAssignedStudents').mockResolvedValue(mockStudents);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the coach weekly timetable from 06:00 to 22:00 with only their own sessions', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <CoachClassesPage />
        </MemoryRouter>
      );
    });

    expect(host.textContent).toContain('Thời khóa biểu & học viên phụ trách');
    expect(host.textContent).toContain('Thời khóa biểu');
    expect(host.textContent).toContain('Học viên phụ trách');
    expect(host.querySelector('[aria-label="Tuần trước"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Tuần sau"]')).not.toBeNull();
    expect(host.querySelectorAll('.mcal__col')).toHaveLength(7);
    // Bảng chỉ xem thu gọn theo lịch tuần; bấm "Hiện đủ" để xem 06:00–22:00.
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Cả ngày')?.click(); });
    expect(host.querySelectorAll('.mcal__gutter span')).toHaveLength(16);
    expect(host.querySelector('.tt__mark')).toBeNull();
    expect(host.textContent).toContain('Thứ 2');
    expect(host.textContent).toContain('Chủ nhật');
    const titles = [...host.querySelectorAll('.mcal__event-title')].map((node) => node.textContent);
    expect(titles).toEqual(expect.arrayContaining(['High-Intensity Strength & Conditioning', 'Olympic Weightlifting Fundamentals']));
    expect(host.querySelector('.mcal__slot')).toBeNull();

    // Ensure raw emojis are removed
    expect(host.textContent).not.toContain('⏰');
    expect(host.textContent).not.toContain('📍');
    expect(host.textContent).not.toContain('👥');
    expect(host.textContent).not.toContain('🎯');
  });

  it('allows switching weeks and triggers schedule reload', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <CoachClassesPage />
        </MemoryRouter>
      );
    });

    const nextWeekBtn = host.querySelector('[aria-label="Tuần sau"]') as HTMLButtonElement;
    expect(nextWeekBtn).not.toBeNull();

    await act(async () => {
      nextWeekBtn.click();
    });

    expect(coachingApi.getCoachWeeklySchedule).toHaveBeenCalled();
  });

  it('switches to dedicated "Học viên phụ trách" tab and displays assigned students without icons', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <CoachClassesPage />
        </MemoryRouter>
      );
    });

    const tabButtons = Array.from(host.querySelectorAll('.coach-tab-btn'));
    const studentsTabBtn = tabButtons.find((btn) => btn.textContent?.includes('Học viên phụ trách'));
    expect(studentsTabBtn).toBeDefined();

    await act(async () => {
      studentsTabBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(host.textContent).toContain('Danh sách học viên phụ trách');
    expect(host.textContent).toContain('Lê Hoàng Long');
    expect(host.textContent).toContain('Trần Thị Thu Thảo');
    expect(host.textContent).toContain('Mục tiêu thể lực');
    expect(host.textContent).toContain('Lưu ý sức khỏe & Chấn thương');

    // Ensure emojis are not present in the students tab
    expect(host.textContent).not.toContain('📧');
    expect(host.textContent).not.toContain('📞');
    expect(host.textContent).not.toContain('⚠️');
  });

  it('opens modal to view enrolled students, and allows switching to attendance and evaluation history', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <CoachClassesPage />
        </MemoryRouter>
      );
    });

    const viewStudentsBtn = host.querySelector('.mcal__event') as HTMLButtonElement;
    expect(viewStudentsBtn).not.toBeNull();

    await act(async () => {
      viewStudentsBtn.click();
    });

    expect(coachingApi.getSessionStudents).toHaveBeenCalled();
    expect(host.textContent).toContain('Mục tiêu thể lực (fitness_goal)');
    expect(host.textContent).toContain('Lưu ý sức khỏe & Chấn thương (health_notes)');
    expect(host.textContent).toContain('Lê Hoàng Long');
    expect(host.textContent).toContain('thoát vị đĩa đệm');

    const filterSelect = host.querySelector('.students-modal-filter-bar select') as HTMLSelectElement;
    expect(filterSelect).not.toBeNull();

    // Chuyển sang "Lịch sử điểm danh"
    await act(async () => {
      filterSelect.value = 'attendance';
      filterSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(host.querySelectorAll('.history-record-card')).toHaveLength(0);

    // Chuyển sang "Đánh giá học viên"
    await act(async () => {
      filterSelect.value = 'evaluation';
      filterSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(host.querySelectorAll('.history-record-card')).toHaveLength(0);
  });

  it('shows confirmed 1:1 bookings on the same timetable and opens their detail', async () => {
    vi.mocked(getCoachSchedule).mockResolvedValueOnce([
      { id: 9, memberName: 'Phạm Quốc Bảo', bookingDate: currentMondayStr, startTime: '18:00:00', endTime: '19:00:00',
        status: 'confirmed', paymentMethod: 'package_quota', disciplineName: 'Gym', notes: 'Đau vai trái' },
      { id: 10, memberName: 'Đã hủy', bookingDate: currentMondayStr, startTime: '20:00:00', endTime: '21:00:00', status: 'cancelled' },
    ] as never);
    await act(async () => { root.render(<MemoryRouter><CoachClassesPage /></MemoryRouter>); });
    const events = [...host.querySelectorAll<HTMLButtonElement>('.mcal__event--mine')];
    expect(events).toHaveLength(1);
    expect(events[0].textContent).toContain('PT 1:1 · Phạm Quốc Bảo');
    await act(async () => events[0].click());
    const dialog = host.querySelector('dialog')!;
    expect(dialog.textContent).toContain('Đau vai trái');
    expect(dialog.textContent).toContain('Quyền lợi gói tập');
    expect(coachingApi.getSessionStudents).not.toHaveBeenCalled();
  });
});
