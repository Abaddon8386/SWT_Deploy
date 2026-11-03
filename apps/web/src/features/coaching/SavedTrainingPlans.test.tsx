import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SavedTrainingPlans } from './SavedTrainingPlans';
import { aiApi, type SavedTrainingPlan } from './aiApi';

const draft: SavedTrainingPlan = {
  id: 1, memberId: 10, memberName: 'Lê Hoàng Long', coachName: 'HLV Quân', goal: 'Tăng cơ',
  startDate: '2026-11-04', endDate: '2026-12-02', status: 'draft', items: [{ id: 1, exerciseName: 'Squat' }],
};
const active: SavedTrainingPlan = { ...draft, id: 2, memberName: 'Trần Thu Thảo', status: 'active', items: [] };
const completed: SavedTrainingPlan = { ...draft, id: 3, memberName: 'Nguyễn Văn Minh', status: 'completed' };

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  if (typeof HTMLDialogElement !== 'undefined') {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const render = () => act(async () => root.render(<SavedTrainingPlans />));
const rows = () => [...host.querySelectorAll('tbody tr')];
const buttonIn = (row: Element, label: string) =>
  [...row.querySelectorAll('button')].find((b) => b.textContent === label);
const click = (el: Element | null | undefined) => act(async () => (el as HTMLElement).click());

it('shows loaded plans with Sửa for draft/active, Xóa for draft only, and nothing for finished plans', async () => {
  vi.spyOn(aiApi, 'listTrainingPlans').mockResolvedValue([draft, active, completed]);
  await render();
  const [r1, r2, r3] = rows();
  expect(r1.textContent).toContain('Lê Hoàng Long');
  expect(r1.textContent).toContain('04/11/2026');
  expect(buttonIn(r1, 'Sửa')).toBeTruthy();
  expect(buttonIn(r1, 'Xóa')).toBeTruthy();
  expect(buttonIn(r2, 'Sửa')).toBeTruthy();
  expect(buttonIn(r2, 'Xóa')).toBeUndefined();
  expect(r3.querySelectorAll('button')).toHaveLength(0);
});

it('shows an empty state and a retryable error instead of an empty list on failure', async () => {
  const list = vi.spyOn(aiApi, 'listTrainingPlans').mockResolvedValueOnce([]);
  await render();
  expect(host.textContent).toContain('Chưa có giáo án nào được lưu');
  list.mockRejectedValueOnce(new Error('Mất kết nối')).mockResolvedValueOnce([draft]);
  await click([...host.querySelectorAll('button')].find((b) => b.textContent === 'Tải lại'));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Mất kết nối');
  expect(host.textContent).not.toContain('Chưa có giáo án nào được lưu');
  await click([...host.querySelectorAll('button')].find((b) => b.textContent === 'Thử lại'));
  expect(rows()).toHaveLength(1);
});

it('edits goal and dates through the API and refreshes the row', async () => {
  vi.spyOn(aiApi, 'listTrainingPlans').mockResolvedValue([draft]);
  const update = vi.spyOn(aiApi, 'updateTrainingPlan').mockResolvedValue({ ...draft, goal: 'Giảm mỡ' });
  await render();
  await click(buttonIn(rows()[0], 'Sửa'));
  const goal = host.ownerDocument.querySelector<HTMLInputElement>('#plan-edit-goal')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(goal, 'Giảm mỡ');
    goal.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => host.ownerDocument.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(update).toHaveBeenCalledWith(1, { goal: 'Giảm mỡ', startDate: '2026-11-04', endDate: '2026-12-02' });
  expect(rows()[0].textContent).toContain('Giảm mỡ');
});

it('deletes a draft only after confirmation and keeps it when the server refuses', async () => {
  vi.spyOn(aiApi, 'listTrainingPlans').mockResolvedValue([draft]);
  const del = vi.spyOn(aiApi, 'deleteTrainingPlan').mockRejectedValueOnce(new Error('Chỉ xóa được bản nháp')).mockResolvedValueOnce(undefined);
  await render();
  await click(buttonIn(rows()[0], 'Xóa'));
  const confirmButton = () => [...host.ownerDocument.querySelectorAll('button')].find((b) => b.textContent === 'Xóa' && b.closest('dialog,[role="dialog"],[role="alertdialog"]'));
  await click(confirmButton());
  expect(del).toHaveBeenCalledWith(1);
  expect(rows()).toHaveLength(1);
  await click(buttonIn(rows()[0], 'Xóa'));
  await click(confirmButton());
  expect(del).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain('Chưa có giáo án nào được lưu');
});
