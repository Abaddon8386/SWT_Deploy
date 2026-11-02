import { AUTH_STORAGE_KEY } from '../../shared/api/client';
import { coachHistoryStorageKey } from './coachHistoryStorage';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoachAttendancePage } from './CoachAttendancePage';
import { attendanceApi, type AttendanceStudent, type CoachClassSession } from './attendanceApi';
import { toast } from '../../shared/ui/toast';

describe('CoachAttendancePage (SCRUM-123: HLV Điểm danh, Đánh giá & Lịch sử sửa trực tiếp bằng Modal)', () => {
  let host: HTMLDivElement;
  let root: Root;

  const mockSessions: CoachClassSession[] = [
    {
      id: 101,
      className: 'Reformer Core & Spinal Alignment',
      disciplineName: 'Pilates Reformer',
      roomName: 'Studio 01 (Tầng 2)',
      sessionDate: '2026-10-25',
      startTime: '17:30',
      endTime: '18:30',
      bookedCount: 2,
      capacity: 6,
    },
  ];

  const mockStudents: AttendanceStudent[] = [
    {
      id: 1,
      memberId: 101,
      fullName: 'Nguyễn Văn An',
      membershipCode: 'MB-2026-089',
      status: 'present',
      progressScore: 85,
      notes: 'Kiểm soát cơ lõi tốt.',
    },
    {
      id: 2,
      memberId: 102,
      fullName: 'Trần Thị Mai',
      membershipCode: 'MB-2026-054',
      status: 'absent',
      progressScore: 70,
      notes: 'Vắng có lý do cá nhân.',
    },
  ];

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function () {
        this.setAttribute('open', '');
      };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function () {
        this.removeAttribute('open');
      };
    }

    vi.stubGlobal('confirm', vi.fn(() => true));
    localStorage.clear();
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ id: 'coach-a', name: 'Coach A', role: 'COACH' }));
    const record = { ...mockSessions[0], id: 'saved-101', sessionId: 101, savedAt: '27/10/2026', presentCount: 1, absentCount: 1, totalStudents: 2, averageScore: 78, students: mockStudents };
    localStorage.setItem(coachHistoryStorageKey('attendance'), JSON.stringify([record]));
    localStorage.setItem(coachHistoryStorageKey('evaluation'), JSON.stringify([record]));

    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    vi.spyOn(attendanceApi, 'getCoachSessions').mockResolvedValue(mockSessions);
    vi.spyOn(attendanceApi, 'getSessionStudents').mockResolvedValue(mockStudents);
    vi.spyOn(attendanceApi, 'saveBatchAttendance').mockResolvedValue({
      success: true,
      updatedCount: 2,
      message: 'Đã lưu điểm danh & đánh giá thành công cho 2 học viên.',
    });
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders 4 tabs: Điểm danh buổi học, Đánh giá học viên, Lịch sử điểm danh, Lịch sử đánh giá', async () => {
    await act(async () => {
      root.render(<CoachAttendancePage />);
    });

    const tabBtns = host.querySelectorAll('.attendance-tab-btn');
    expect(tabBtns.length).toBe(4);
    expect(tabBtns[0].textContent).toContain('Điểm danh buổi học');
    expect(tabBtns[1].textContent).toContain('Đánh giá học viên');
    expect(tabBtns[2].textContent).toContain('Lịch sử điểm danh');
    expect(tabBtns[3].textContent).toContain('Lịch sử đánh giá');
  });

  it('tab Điểm danh buổi học is pure attendance (no evaluation sliders or buttons on rows)', async () => {
    await act(async () => {
      root.render(<CoachAttendancePage />);
    });

    expect(host.textContent).toContain('Có mặt');
    expect(host.textContent).toContain('Vắng mặt');
    expect(host.textContent).not.toContain('Đi muộn');
    expect(host.textContent).not.toContain('Có phép');

    const slidersInAttendance = host.querySelectorAll('input[type="range"]');
    expect(slidersInAttendance.length).toBe(0);

    const saveBtn = host.querySelector('.btn-batch-save') as HTMLButtonElement;
    expect(saveBtn).not.toBeNull();
    expect(saveBtn.textContent).toMatch(/Lưu điểm danh|Cập nhật điểm danh/);
  });

  it('tab Đánh giá học viên allows rating and saves into evaluation history', async () => {
    await act(async () => {
      root.render(<CoachAttendancePage />);
    });

    const tabBtns = host.querySelectorAll('.attendance-tab-btn');

    // Switch to tab "Đánh giá học viên"
    await act(async () => {
      (tabBtns[1] as HTMLButtonElement).click();
    });

    expect(host.textContent).toContain('Đánh Giá Tiến Bộ Học Viên');

    const saveEvalBtn = host.querySelector('.btn-batch-save') as HTMLButtonElement;
    expect(saveEvalBtn.textContent).toContain('Lưu tất cả đánh giá');

    vi.useFakeTimers();
    await act(async () => {
      saveEvalBtn.click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(host.querySelector('.center-toast-card')).not.toBeNull();
  });

  it('clicking Sửa điểm danh in History opens Modal directly in center without switching tabs', async () => {
    await act(async () => {
      root.render(<CoachAttendancePage />);
    });

    const tabBtns = host.querySelectorAll('.attendance-tab-btn');

    // Switch to tab "Lịch sử điểm danh"
    await act(async () => {
      (tabBtns[2] as HTMLButtonElement).click();
    });

    expect(host.textContent).toContain('Lịch sử các buổi đã điểm danh');

    const editBtns = host.querySelectorAll('.btn-history-edit');
    expect(editBtns.length).toBeGreaterThan(0);

    // Click "Sửa điểm danh"
    await act(async () => {
      (editBtns[0] as HTMLButtonElement).click();
    });

    // Stays in History section, does NOT jump to attendance tab
    expect(host.textContent).toContain('Sửa điểm danh: Reformer Core & Spinal Alignment');
    expect(host.querySelector('.modal-edit-container')).not.toBeNull();

    // Students are inside the modal
    const modalItems = host.querySelectorAll('.modal-student-edit-item');
    expect(modalItems.length).toBeGreaterThan(0);

    // Save in modal
    const modalSaveBtn = host.querySelector('.modal-footer-actions .btn-modal-save') as HTMLButtonElement;
    expect(modalSaveBtn).not.toBeNull();

    vi.useFakeTimers();
    await act(async () => {
      modalSaveBtn.click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    // Không hiện toast dưới góc
    expect(toast.success).not.toHaveBeenCalled();
    // Thông báo chính giữa màn hình chỉ hiển thị "Cập nhật thành công"
    expect(host.querySelector('.center-toast-title')?.textContent).toBe('Cập nhật thành công');
    expect(attendanceApi.saveBatchAttendance).toHaveBeenCalledWith(101, expect.arrayContaining([expect.objectContaining({ memberId: 101 })]));
    // Modal is closed
    expect(host.querySelector('.modal-edit-container')).toBeNull();
  });

  it('tab Lịch sử đánh giá allows opening modal to edit progress evaluation directly', async () => {
    await act(async () => {
      root.render(<CoachAttendancePage />);
    });

    const tabBtns = host.querySelectorAll('.attendance-tab-btn');

    // Switch to tab "Lịch sử đánh giá"
    await act(async () => {
      (tabBtns[3] as HTMLButtonElement).click();
    });

    expect(host.textContent).toContain('Lịch sử đánh giá tiến bộ học viên');

    const editBtns = host.querySelectorAll('.btn-history-edit');
    expect(editBtns.length).toBeGreaterThan(0);

    // Click "Sửa đánh giá"
    await act(async () => {
      (editBtns[0] as HTMLButtonElement).click();
    });

    expect(host.textContent).toContain('Sửa đánh giá tiến bộ: Reformer Core & Spinal Alignment');
    expect(host.querySelector('.modal-eval-student-item')).not.toBeNull();

    // Save modal
    const modalSaveBtn = host.querySelector('.modal-footer-actions .btn-modal-save') as HTMLButtonElement;
    vi.useFakeTimers();
    await act(async () => {
      modalSaveBtn.click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    // Không hiện toast dưới góc
    expect(toast.success).not.toHaveBeenCalled();
    // Thông báo chính giữa màn hình chỉ hiển thị "Cập nhật thành công"
    expect(host.querySelector('.center-toast-title')?.textContent).toBe('Cập nhật thành công');
    expect(attendanceApi.saveBatchAttendance).toHaveBeenCalledWith(101, expect.arrayContaining([expect.objectContaining({ progressScore: 85 })]));
  });
  it('keeps a failed history edit open and does not overwrite its stored record', async () => {
    vi.mocked(attendanceApi.saveBatchAttendance).mockRejectedValueOnce(new Error('Rejected'));
    const original = localStorage.getItem(coachHistoryStorageKey('attendance'));
    await act(async () => { root.render(<CoachAttendancePage />); });
    await act(async () => { (host.querySelectorAll('.attendance-tab-btn')[2] as HTMLButtonElement).click(); });
    await act(async () => { (host.querySelector('.btn-history-edit') as HTMLButtonElement).click(); });
    await act(async () => { (host.querySelector('.btn-modal-save') as HTMLButtonElement).click(); });
    expect(host.querySelector('.modal-edit-container')).not.toBeNull();
    expect(localStorage.getItem(coachHistoryStorageKey('attendance'))).toBe(original);
    expect(toast.error).toHaveBeenCalled();
  });

  it('does not fabricate history for a fresh browser', async () => {
    localStorage.clear();
    await act(async () => { root.render(<CoachAttendancePage />); });
    await act(async () => { (host.querySelectorAll('.attendance-tab-btn')[2] as HTMLButtonElement).click(); });
    expect(host.querySelectorAll('.btn-history-edit')).toHaveLength(0);
    await act(async () => { (host.querySelectorAll('.attendance-tab-btn')[3] as HTMLButtonElement).click(); });
    expect(host.querySelectorAll('.btn-history-edit')).toHaveLength(0);
  });

  it('keeps a failed evaluation edit open without changing stored history', async () => {
    vi.mocked(attendanceApi.saveBatchAttendance).mockRejectedValueOnce(new Error('Rejected'));
    const original = localStorage.getItem(coachHistoryStorageKey('evaluation'));
    await act(async () => { root.render(<CoachAttendancePage />); });
    await act(async () => { (host.querySelectorAll('.attendance-tab-btn')[3] as HTMLButtonElement).click(); });
    await act(async () => { (host.querySelector('.btn-history-edit') as HTMLButtonElement).click(); });
    await act(async () => { (host.querySelector('.btn-modal-save') as HTMLButtonElement).click(); });
    expect(host.querySelector('.modal-edit-container')).not.toBeNull();
    expect(localStorage.getItem(coachHistoryStorageKey('evaluation'))).toBe(original);
    expect(toast.error).toHaveBeenCalled();
  });

  it('preserves the latest attendance when updating an older evaluation snapshot', async () => {
    await act(async () => { root.render(<CoachAttendancePage />); });
    vi.mocked(attendanceApi.getSessionStudents).mockResolvedValueOnce(mockStudents.map(student => ({ ...student, status: 'absent' })));
    await act(async () => { (host.querySelectorAll('.attendance-tab-btn')[3] as HTMLButtonElement).click(); });
    await act(async () => { (host.querySelector('.btn-history-edit') as HTMLButtonElement).click(); });
    await act(async () => { (host.querySelector('.btn-modal-save') as HTMLButtonElement).click(); });
    expect(attendanceApi.saveBatchAttendance).toHaveBeenCalledWith(101, expect.arrayContaining([expect.objectContaining({ memberId: 101, status: 'absent', progressScore: 85 })]));
  });

  it('isolates cached histories between coaches sharing a browser', async () => {
    const coachAHistory = localStorage.getItem(coachHistoryStorageKey('attendance'));
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ id: 'coach-b', name: 'Coach B', role: 'COACH' }));
    localStorage.setItem('sol_coach_attendance_history', coachAHistory!);
    await act(async () => { root.render(<CoachAttendancePage />); });
    await act(async () => { (host.querySelectorAll('.attendance-tab-btn')[2] as HTMLButtonElement).click(); });
    expect(host.querySelectorAll('.btn-history-edit')).toHaveLength(0);
    await act(async () => { (host.querySelectorAll('.attendance-tab-btn')[3] as HTMLButtonElement).click(); });
    expect(host.querySelectorAll('.btn-history-edit')).toHaveLength(0);
  });

  it('clears the previous roster and blocks both saves when another session fails to load', async () => {
    vi.mocked(attendanceApi.getCoachSessions).mockResolvedValueOnce([mockSessions[0], { ...mockSessions[0], id: 202, className: 'Session B' }]);
    await act(async () => { root.render(<CoachAttendancePage />); });
    vi.mocked(attendanceApi.getSessionStudents).mockRejectedValueOnce(new Error('Session B unavailable'));
    await act(async () => {
      const select = host.querySelector('.attendance-session-selector select') as HTMLSelectElement;
      select.value = '202';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.textContent).not.toContain(mockStudents[0].fullName);
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect((host.querySelector('.btn-batch-save') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { (host.querySelectorAll('.attendance-tab-btn')[1] as HTMLButtonElement).click(); });
    expect((host.querySelector('.btn-batch-save') as HTMLButtonElement).disabled).toBe(true);
    expect(attendanceApi.saveBatchAttendance).not.toHaveBeenCalled();
  });

  it('prevents switching sessions while an attendance write is pending', async () => {
    let complete!: (value: { success: boolean; updatedCount: number; message: string }) => void;
    vi.mocked(attendanceApi.saveBatchAttendance).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    await act(async () => { root.render(<CoachAttendancePage />); });
    await act(async () => { (host.querySelector('.btn-batch-save') as HTMLButtonElement).click(); });
    expect((host.querySelector('.attendance-session-selector select') as HTMLSelectElement).disabled).toBe(true);
    await act(async () => { complete({ success: true, updatedCount: 2, message: 'Saved' }); });
    expect((host.querySelector('.attendance-session-selector select') as HTMLSelectElement).disabled).toBe(false);
    expect(JSON.parse(localStorage.getItem(coachHistoryStorageKey('attendance'))!)[0].sessionId).toBe(101);
  });

});
