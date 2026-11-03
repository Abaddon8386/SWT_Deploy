import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemberProgressPage } from './MemberProgressPage';
import * as api from './memberProgressApi';

vi.mock('./memberProgressApi', () => ({ getMyEvaluations: vi.fn().mockResolvedValue([]), getMyProgressMetrics: vi.fn(), getMyTrainingPlans: vi.fn(), getMyCompletedItemIds: vi.fn(), setTrainingItemCompleted: vi.fn() }));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.mocked(api.getMyProgressMetrics).mockResolvedValue([
    { id: 1, metricName: 'weight', metricValue: 70, unit: 'kg', recordedAt: '2026-10-19T08:00:00' },
    { id: 2, metricName: 'bmi', metricValue: 23, unit: null, recordedAt: '2026-10-19T08:00:00' },
  ]);
  vi.mocked(api.getMyTrainingPlans).mockResolvedValue([]);
  vi.mocked(api.getMyCompletedItemIds).mockResolvedValue([]);
  vi.mocked(api.setTrainingItemCompleted).mockResolvedValue({ itemId: 5, exerciseDate: '2026-10-25', completed: true });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(<MemoryRouter><MemberProgressPage /></MemoryRouter>)); }

it('renders persisted weekly measurements without derived BMI', async () => {
  await render();
  expect(host.firstElementChild?.classList.contains('portal-container')).toBe(true);
  expect(host.firstElementChild?.classList.contains('member-progress')).toBe(true);
  expect(host.querySelectorAll('svg.member-progress-chart').length).toBe(2);
  expect(host.textContent).toContain('70 kg');
  expect(host.textContent).toContain('BMI 23');
});

it('shows an honest homework blocker without a fake completion checkbox', async () => {
  await render();
  expect(host.textContent).toContain('Chưa có bài tập trong hôm nay');
  expect(host.querySelector('input[type="checkbox"]')).toBeNull();
});

it('shows independent API errors and retry controls', async () => {
  vi.mocked(api.getMyProgressMetrics).mockRejectedValueOnce(new Error('offline'));
  vi.mocked(api.getMyTrainingPlans).mockRejectedValueOnce(new Error('offline'));
  await render();
  expect(host.querySelectorAll('[role="alert"]').length).toBe(2);
  expect(host.textContent).toContain('Thử lại');
});

function todayPlan() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const date = `${value('year')}-${value('month')}-${value('day')}`;
  return { date, plan: { id: 1, status: 'active', startDate: date, endDate: date, goal: null, coachName: 'HLV', items: [
    { id: 5, dayOfWeek: new Date(`${date}T12:00:00Z`).getUTCDay() || 7, exerciseName: 'Squat', description: null, sets: 3, reps: 10, durationMinutes: null, orderIndex: 1 },
  ] } as api.TrainingPlan };
}

it('loads persisted completion and only changes checkbox after server confirms', async () => {
  const { date, plan } = todayPlan();
  vi.mocked(api.getMyTrainingPlans).mockResolvedValue([plan]);
  vi.mocked(api.getMyCompletedItemIds).mockResolvedValue([5]);
  await render();
  const checkbox = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
  expect(checkbox.checked).toBe(true);
  await act(async () => checkbox.click());
  expect(api.setTrainingItemCompleted).toHaveBeenCalledWith(5, date, false);
  expect(checkbox.checked).toBe(false);
});

it('keeps prior completion state and reports API failure', async () => {
  const { plan } = todayPlan();
  vi.mocked(api.getMyTrainingPlans).mockResolvedValue([plan]);
  vi.mocked(api.setTrainingItemCompleted).mockRejectedValue(new Error('offline'));
  await render();
  const checkbox = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
  await act(async () => checkbox.click());
  expect(checkbox.checked).toBe(false);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Không thể lưu');
});

it('does not confirm completion while the API is pending', async () => {
  const { plan } = todayPlan();
  vi.mocked(api.getMyTrainingPlans).mockResolvedValue([plan]);
  let resolveSave!: (value: api.TrainingCompletion) => void;
  vi.mocked(api.setTrainingItemCompleted).mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
  await render();
  const checkbox = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
  await act(async () => checkbox.click());
  expect(checkbox.disabled).toBe(true);
  expect(checkbox.checked).toBe(false);
  expect(host.textContent).toContain('Đang lưu');
  await act(async () => resolveSave({ itemId: 5, exerciseDate: todayPlan().date, completed: true }));
  expect(checkbox.checked).toBe(true);
});

it('hides checkboxes if completion loading fails and retries from the backend', async () => {
  const { plan } = todayPlan();
  vi.mocked(api.getMyTrainingPlans).mockResolvedValue([plan]);
  vi.mocked(api.getMyCompletedItemIds).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([5]);
  await render();
  expect(host.querySelector('input[type="checkbox"]')).toBeNull();
  const retry = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Thử lại');
  expect(retry).toBeDefined();
  await act(async () => retry?.click());
  expect((host.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
});

it('shows the measurements empty state when only other health metrics exist', async () => {
  vi.mocked(api.getMyProgressMetrics).mockResolvedValue([
    { id: 1, metricName: 'height', metricValue: 170, unit: 'cm', recordedAt: '2026-10-19T08:00:00' },
  ]);
  await render();
  expect(host.textContent).toContain('Chưa có số đo cân nặng hoặc BMI.');
  expect(host.querySelector('.member-progress-values')).toBeNull();
  expect(host.querySelector('svg.member-progress-chart')).toBeNull();
});

it('shows persisted coach score and feedback, and retries evaluation failures', async () => {
  vi.mocked(api.getMyEvaluations).mockRejectedValueOnce(new Error('offline'));
  await render();
  expect(host.querySelector('#coach-evaluations')?.textContent).toContain('Không thể tải đánh giá');
  vi.mocked(api.getMyEvaluations).mockResolvedValueOnce([{ id: 8, sessionId: 4, coachId: 2, progressScore: 92, performanceNotes: 'Giữ đúng tư thế', feedback: 'Tiếp tục phát huy', evaluatedAt: '2026-11-03T10:00:00' }]);
  await act(async () => (host.querySelector('#coach-evaluations button') as HTMLButtonElement).click());
  expect(host.querySelector('#coach-evaluations')?.textContent).toContain('92/100');
  expect(host.querySelector('#coach-evaluations')?.textContent).toContain('Giữ đúng tư thế');
  expect(host.querySelector('#coach-evaluations')?.textContent).toContain('Tiếp tục phát huy');
});
