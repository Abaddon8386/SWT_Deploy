import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ManagerEquipmentPage } from './ManagerEquipmentPage';
import { catalogApi, type Room } from './catalogApi';
import { equipmentApi, type Equipment } from './equipmentApi';
import { clearNotices, getNotices } from '../../shared/lib/portalNotices';

vi.mock('./catalogApi', () => ({ catalogApi: { rooms: vi.fn(), saveRoom: vi.fn() } }));
vi.mock('./equipmentApi', () => ({ equipmentApi: { list: vi.fn(), save: vi.fn(), updateStatus: vi.fn(), delete: vi.fn() } }));

const studio: Room = { id: 9, name: 'Yoga Studio', location: null, capacity: 20, status: 'available', tier: 'STANDARD' };
const standard: Room = { ...studio, id: 10, name: 'Phòng Gym Tiêu chuẩn' };
const vip: Room = { ...studio, id: 11, name: 'Phòng Gym VIP', tier: 'PLATINUM' };
const equipment: Equipment = {
  id: 1, name: 'Thảm tập', code: 'YOGA-01', category: 'Khác', roomId: 10, roomName: standard.name,
  quantity: 2, status: 'active', purchaseDate: null, maintenanceDate: null, note: null,
  createdAt: '2026-01-01T00:00:00', updatedAt: '2026-01-01T00:00:00',
};
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.resetAllMocks();
  clearNotices();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  vi.mocked(catalogApi.rooms).mockResolvedValue([studio, standard, vip]);
  vi.mocked(catalogApi.saveRoom).mockImplementation(async (_id, body) => ({ ...studio, ...body, id: 100 }));
  vi.mocked(equipmentApi.list).mockResolvedValue([equipment]);
  vi.mocked(equipmentApi.save).mockResolvedValue(equipment);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = async () => { await act(async () => root.render(<ManagerEquipmentPage />)); };
const click = async (text: string) => {
  const button = [...host.querySelectorAll('button')].find(node => node.textContent?.trim() === text);
  expect(button, `button ${text}`).toBeTruthy();
  await act(async () => button!.click());
};
const submit = async () => {
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
};

it('loads an empty inventory without creating rooms or exposing browser demo writes', async () => {
  vi.mocked(catalogApi.rooms).mockResolvedValue([studio]);
  vi.mocked(equipmentApi.list).mockResolvedValue([]);
  await render();
  expect(catalogApi.saveRoom).not.toHaveBeenCalled();
  expect(equipmentApi.save).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Không tìm thấy thiết bị nào');
  expect(host.textContent).not.toContain('Nạp 12 máy móc mẫu');
});

it.each([null, 9, 10, 11])('preserves existing room assignment %s when editing unrelated fields', async roomId => {
  vi.mocked(equipmentApi.list).mockResolvedValue([{ ...equipment, roomId, roomName: [studio, standard, vip].find(room => room.id === roomId)?.name ?? null }]);
  await render();
  await click('Sửa');
  await submit();
  expect(equipmentApi.save).toHaveBeenCalledWith(1, expect.objectContaining({ roomId }));
  expect(catalogApi.saveRoom).not.toHaveBeenCalled();
  expect(getNotices()).toEqual([]);
});

it('allows selection of gym rooms in editor modal', async () => {
  vi.mocked(equipmentApi.save).mockImplementation(async (_id, input) => {
    const saved = { ...equipment, roomId: input.roomId ?? null, roomName: [standard, vip].find(room => room.id === input.roomId)?.name ?? null };
    vi.mocked(equipmentApi.list).mockResolvedValue([saved]);
    return saved;
  });
  await render();
  await click('Sửa');
  const trigger = host.querySelector<HTMLButtonElement>('#eq-room');
  expect(trigger).toBeTruthy();
  await act(async () => trigger!.click());
  const options = [...host.querySelectorAll<HTMLElement>('[role="option"]')];
  expect(options.map(node => node.textContent)).toEqual(expect.arrayContaining(['Gym Tiêu chuẩn (Phòng Gym Tiêu chuẩn)', 'Gym VIP Platinum (Phòng Gym VIP)']));
  await act(async () => options.find(node => node.textContent?.includes('Phòng Gym Tiêu chuẩn'))!.click());
  await submit();
  expect(equipmentApi.save).toHaveBeenLastCalledWith(1, expect.objectContaining({ roomId: 10 }));
});

it('selects existing gym rooms synchronously and disables missing gym shortcuts', async () => {
  vi.mocked(catalogApi.rooms).mockResolvedValue([studio, standard]);
  await render();
  await click('Sửa');
  const dialog = host.querySelector('dialog')!;
  const vipButton = [...dialog.querySelectorAll('button')].find(node => node.textContent?.trim() === 'Gym VIP Platinum')!;
  expect(vipButton.disabled).toBe(true);
  await click('Gym Tiêu chuẩn');
  await submit();
  expect(equipmentApi.save).toHaveBeenCalledWith(1, expect.objectContaining({ roomId: 10 }));
  expect(catalogApi.saveRoom).not.toHaveBeenCalled();
});

it('recovers from a failed load through a read-only retry', async () => {
  vi.mocked(equipmentApi.list).mockRejectedValueOnce(new Error('Connection lost'));
  vi.mocked(catalogApi.rooms).mockResolvedValue([studio]);
  await render();
  expect(host.querySelector('[role="alert"]')).toBeTruthy();
  await click('Thử lại');
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.textContent).toContain('Thảm tập');
  expect(catalogApi.saveRoom).not.toHaveBeenCalled();
});

it('filters equipment items by gym room classification (STANDARD vs VIP)', async () => {
  vi.mocked(equipmentApi.list).mockResolvedValue([
    { ...equipment, id: 1, name: 'Máy chạy Tiêu chuẩn', roomId: 10, roomName: standard.name },
    { ...equipment, id: 2, name: 'Máy Technogym VIP', roomId: 11, roomName: vip.name },
  ]);
  await render();
  await act(async () => host.querySelector<HTMLButtonElement>('[role="combobox"]')!.click());
  const options = [...host.querySelectorAll<HTMLElement>('[role="option"]')];
  expect(options.some(node => node.textContent?.includes('Gym Tiêu chuẩn'))).toBe(true);
  expect(options.some(node => node.textContent?.includes('Gym VIP Platinum'))).toBe(true);
  await act(async () => options.find(node => node.textContent?.includes('Gym Tiêu chuẩn'))!.click());
  const rows = [...host.querySelectorAll('tbody tr')];
  expect(rows).toHaveLength(1);
  expect(rows[0].textContent).toContain('Máy chạy Tiêu chuẩn');
});

it('locks dialog dismissal while equipment is saving', async () => {
  let finish!: (value: Equipment) => void;
  vi.mocked(equipmentApi.save).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render();
  await click('Sửa');
  await submit();
  const dialog = host.querySelector('dialog')!;
  expect(dialog.getAttribute('aria-busy')).toBe('true');
  expect(dialog.querySelector<HTMLButtonElement>('[aria-label="Đóng hộp thoại"]')!.disabled).toBe(true);
  await act(async () => finish(equipment));
  expect(host.querySelector('dialog')).toBeNull();
});

it('keeps non-gym rooms and unassigned equipment available in the unified filter and editor', async () => {
  vi.mocked(equipmentApi.list).mockResolvedValue([
    equipment,
    { ...equipment, id: 2, name: 'Bóng yoga', roomId: 9, roomName: studio.name },
  ]);
  await render();
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Lọc theo phòng tập"]')!.click());
  const roomOption = [...host.querySelectorAll<HTMLElement>('[role="option"]')].find(node => node.textContent === studio.name);
  expect(roomOption).toBeTruthy();
  await act(async () => roomOption!.click());
  expect(host.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(host.querySelector('tbody')?.textContent).toContain('Bóng yoga');
  await click('Sửa');
  expect(host.querySelector('#eq-room')?.textContent).toContain(studio.name);
  await act(async () => host.querySelector<HTMLButtonElement>('#eq-room')!.click());
  const unassigned = [...host.querySelectorAll<HTMLElement>('[role="option"]')].find(node => node.textContent === 'Chưa xếp phòng');
  expect(unassigned).toBeTruthy();
  await act(async () => unassigned!.click());
  await submit();
  expect(equipmentApi.save).toHaveBeenLastCalledWith(2, expect.objectContaining({ roomId: null }));
});
