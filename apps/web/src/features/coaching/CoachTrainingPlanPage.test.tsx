import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoachTrainingPlanPage } from './CoachTrainingPlanPage';
import { AUTH_STORAGE_KEY } from '../../shared/api/client';
import { aiApi, SAMPLE_MEMBERS, type MemberOption } from './aiApi';

describe('CoachTrainingPlanPage (SCRUM-122: UI Coach Soạn Giáo án Bài tập Tích hợp AI Gợi ý)', () => {
  let host: HTMLDivElement;
  let root: Root;

  const mockAiResponse = {
    id: 999,
    memberId: 1,
    memberCode: 'MB-2026-001',
    memberName: 'Lê Hoàng Long',
    modelName: 'OpenAI GPT-4o / SÖL AI Intelligence',
    goal: 'Tăng cơ nạc và phục hồi cơ lưng',
    analysis: 'Hội viên có tiền sử thoát vị đĩa đệm nhẹ, cần bài tập an toàn cho lưng dưới.',
    items: [
      {
        id: 'ai-1',
        dayOfWeek: 1, // Thứ 2
        exerciseName: 'Assisted Pull-up & Face Pull',
        description: 'Tập trung cơ lưng xô và bả vai sau',
        sets: 4,
        reps: 12,
        durationMinutes: 15,
        restSeconds: 60,
      },
      {
        id: 'ai-2',
        dayOfWeek: 2, // Thứ 3
        exerciseName: 'Goblet Box Squat',
        description: 'Bảo vệ cột sống và khớp gối',
        sets: 4,
        reps: 10,
        durationMinutes: 15,
        restSeconds: 75,
      },
    ],
  };

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
        id: '3',
        name: 'HLV Marcus Vance',
        identifier: 'COACH-003',
        role: 'COACH',
      })
    );

    vi.spyOn(aiApi, 'generateWorkoutPlan').mockResolvedValue(mockAiResponse);
    vi.spyOn(aiApi, 'saveTrainingPlan').mockResolvedValue({ id: 101, status: 'active' });
    vi.spyOn(aiApi, 'getCoachMembers').mockResolvedValue(SAMPLE_MEMBERS);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function renderComponent() {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <CoachTrainingPlanPage />
        </MemoryRouter>
      );
    });
  }

  it('denies access when user role is not COACH or MANAGER', async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        id: '1',
        name: 'Member User',
        identifier: 'MB-001',
        role: 'MEMBER',
      })
    );

    await renderComponent();
    expect(host.textContent).toContain('Truy cập bị từ chối (403 Forbidden)');
  });

  it('waits for member data before showing the editor and renders immediately when it arrives', async () => {
    let finishMembers!: (members: MemberOption[]) => void;
    vi.mocked(aiApi.getCoachMembers).mockReturnValue(new Promise(resolve => { finishMembers = resolve; }));

    await renderComponent();
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(host.textContent).not.toContain(SAMPLE_MEMBERS[0].fullName);
    expect(host.querySelector('#plan-member')).toBeNull();

    await act(async () => finishMembers([{ ...SAMPLE_MEMBERS[0], id: 42, fullName: 'Học viên đã tải' }]));
    expect(host.querySelector('[aria-busy="true"]')).toBeNull();
    expect(host.textContent).toContain('Học viên đã tải');
    expect(host.textContent).toContain('Lưu & Kích hoạt giáo án');
  });

  it('renders plan editor workspace with day tabs (Thứ 2 -> Chủ Nhật)', async () => {
    await renderComponent();

    expect(host.textContent).toContain('Bàn làm việc: Soạn giáo án bài tập');
    expect(host.textContent).toContain('Gợi ý giáo án bằng AI');
    expect(host.textContent).toContain('Lưu & Kích hoạt giáo án');

    // Verify all 7 day tabs render
    expect(host.textContent).toContain('Thứ 2');
    expect(host.textContent).toContain('Thứ 3');
    expect(host.textContent).toContain('Thứ 4');
    expect(host.textContent).toContain('Thứ 5');
    expect(host.textContent).toContain('Thứ 6');
    expect(host.textContent).toContain('Thứ 7');
    expect(host.textContent).toContain('Chủ Nhật');
  });

  it('allows adding manual exercise to the selected day', async () => {
    await renderComponent();

    // Fill exercise form
    const nameInput = host.querySelector('#exercise-name-input') as HTMLInputElement;
    expect(nameInput).toBeDefined();

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(nameInput, 'Dumbbell Hammer Curl');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const submitBtn = host.querySelector('form.exercise-form-card button[type="submit"]') as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });

    expect(host.textContent).toContain('Dumbbell Hammer Curl');
  });

  it('opens AI Assistant modal, generates recommendation, and applies it to the plan', async () => {
    await renderComponent();

    // 1. Click AI Sparkle Button
    const aiBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Gợi ý giáo án bằng AI')
    );
    expect(aiBtn).toBeDefined();

    await act(async () => {
      aiBtn?.click();
    });

    // Check modal opened
    expect(host.textContent).toContain('Trợ Lý AI: Gợi Ý Giáo Án Huấn Luyện Cá Nhân Hóa');
    expect(host.textContent).toContain('Phân tích & Sinh giáo án bằng AI');

    // 2. Click Generate AI Plan
    const generateBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Phân tích & Sinh giáo án bằng AI')
    );

    await act(async () => {
      generateBtn?.click();
    });

    // Verify AI analysis result appears
    expect(host.textContent).toContain('Assisted Pull-up & Face Pull');
    expect(host.textContent).toContain('Goblet Box Squat');

    // 3. Click "Áp dụng vào giáo án"
    const applyBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Áp dụng vào giáo án')
    );
    expect(applyBtn).toBeDefined();

    await act(async () => {
      applyBtn?.click();
    });

    // 4. Verify AI exercises are populated directly into the Coach's workspace
    expect(host.textContent).toContain('Assisted Pull-up & Face Pull');
  });

  it('saves and activates plan when clicking "Lưu & Kích hoạt giáo án"', async () => {
    await renderComponent();

    const saveBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Lưu & Kích hoạt giáo án')
    );
    expect(saveBtn).toBeDefined();

    await act(async () => {
      saveBtn?.click();
    });

    expect(aiApi.saveTrainingPlan).toHaveBeenCalled();
    expect(host.querySelector('.center-toast-card')).not.toBeNull();
    expect(host.textContent).toContain('Đã lưu & kích hoạt giáo án');
    expect(host.querySelector('.plan-saved-badge')).not.toBeNull();
  });

  it('enforces that endDate min constraint is set to startDate', async () => {
    await renderComponent();

    const startInput = host.querySelector('input[name="plan-start-date"]') as HTMLInputElement;
    const endInput = host.querySelector('input[name="plan-end-date"]') as HTMLInputElement;

    expect(startInput).not.toBeNull();
    expect(endInput).not.toBeNull();
    expect(endInput.getAttribute('min')).toBe(startInput.value);
  });
});
