import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StaffClassesPage } from './StaffClassesPage';
import { classesApi } from './classesApi';
import type { Discipline } from '../manager/catalogApi';

vi.mock('../../shared/api/client', () => ({ getCurrentUser: () => ({ id: '1', role: 'MANAGER' }) }));
vi.mock('./classesApi', () => ({ classesApi: {
  getClasses: vi.fn(), getSessions: vi.fn(), getDisciplines: vi.fn(),
  getAvailableRooms: vi.fn(), getActiveCoaches: vi.fn(),
} }));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } });
  vi.mocked(classesApi.getClasses).mockResolvedValue([]);
  vi.mocked(classesApi.getSessions).mockResolvedValue([]);
  vi.mocked(classesApi.getDisciplines).mockResolvedValue([{ id: 1, name: 'Gym', description: '' }]);
  vi.mocked(classesApi.getAvailableRooms).mockResolvedValue([]);
  vi.mocked(classesApi.getActiveCoaches).mockResolvedValue([]);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals();
});
const openForm = async () => {
  await act(async () => root.render(<StaffClassesPage />));
  await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="create-class-button"]')!.click());
};

it('keeps catalog fields pending until their request resolves and then reveals the form immediately', async () => {
  let resolveDisciplines!: (value: Discipline[]) => void;
  vi.mocked(classesApi.getDisciplines).mockReturnValue(new Promise(resolve => { resolveDisciplines = resolve; }));
  await openForm();
  expect(host.querySelector('dialog [aria-busy="true"]')).not.toBeNull();
  expect(host.querySelector('#class-discipline')).toBeNull();

  await act(async () => resolveDisciplines([{ id: 7, name: 'Yoga đã tải', description: '' }]));
  expect(host.querySelector('dialog [aria-busy="true"]')).toBeNull();
  expect(host.querySelector('#class-discipline')?.parentElement?.querySelector('select')?.textContent).toContain('Yoga đã tải');
});

it('shows catalog failure with retry instead of an apparently empty creation form', async () => {
  vi.mocked(classesApi.getDisciplines).mockRejectedValueOnce(new Error('Mất kết nối danh mục'));
  await openForm();
  expect(host.querySelector('dialog [role="alert"]')?.textContent).toContain('Mất kết nối danh mục');
  expect(host.querySelector('#class-discipline')).toBeNull();

  const retry = [...host.querySelectorAll<HTMLButtonElement>('dialog button')].find(button => button.textContent === 'Thử lại')!;
  await act(async () => retry.click());
  expect(host.querySelector('#class-discipline')?.parentElement?.querySelector('select')?.textContent).toContain('Gym');
});
