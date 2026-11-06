import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ManagerCatalogsPage } from './ManagerCatalogsPage';
import { catalogApi } from './catalogApi';
vi.mock('./catalogApi', () => ({ catalogApi: {
  disciplines: vi.fn().mockResolvedValue([{ id: 2, name: 'Tennis' }, { id: 3, name: 'Gym' }]),
  rooms: vi.fn().mockResolvedValue([{ id: 5, name: 'Phòng cũ', location: null, capacity: 10, status: 'available', disciplineId: null, openTime: null, closeTime: null }]),
  packages: vi.fn().mockResolvedValue([]), saveRoom: vi.fn().mockResolvedValue({}),
} }));
let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it('assigns court discipline and operating hours without converting old rooms on read', async () => {
  await act(async () => root.render(<ManagerCatalogsPage />));
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Phòng tập ('))!.click());
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Chỉnh sửa')!.click());
  const discipline = host.querySelector<HTMLButtonElement>('#cat-discipline')!;
  expect(discipline).toBeTruthy(); expect(discipline.textContent).toContain('Không mở đặt sân');
  await act(async () => discipline.click());
  expect([...host.querySelectorAll('[role="option"]')].map(option => option.textContent)).not.toContain('Gym');
  await act(async () => ([...host.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent?.includes('Tennis'))!).click());
  expect(host.querySelector<HTMLButtonElement>('#cat-open')?.textContent).toBe('06:00');
  expect(host.querySelector<HTMLButtonElement>('#cat-close')?.textContent).toBe('22:00');
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(catalogApi.saveRoom).toHaveBeenCalledWith(5, expect.objectContaining({ disciplineId: 2, openTime: '06:00', closeTime: '22:00' }));
});
