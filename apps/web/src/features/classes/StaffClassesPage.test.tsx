import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffClassesPage } from './StaffClassesPage';
import type { Discipline } from '../manager/catalogApi';
import * as clientModule from '../../shared/api/client';
import { classesApi, type ClassItem, type ClassSessionDto } from './classesApi';

describe('StaffClassesPage (SCRUM-131 & SCRUM-132)', () => {
  let host: HTMLDivElement;
  let root: Root;

  const sampleClasses: ClassItem[] = [
    {
      id: 101,
      name: 'Morning Yoga Flow',
      disciplineId: 1,
      disciplineName: 'Mindful Yoga',
      coachId: 10,
      coachName: 'HLV Nguyễn Minh Quân',
      roomId: 2,
      roomName: 'Studio A',
      capacity: 15,
      level: 'all',
      status: 'ACTIVE',
    },
  ];

  const sampleSessions: ClassSessionDto[] = [
    {
      id: 501,
      classId: 101,
      sessionDate: '2026-11-10',
      startTime: '08:00:00',
      endTime: '09:30:00',
      status: 'scheduled',
    },
  ];

  async function openListView() {
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="view-list"]')!.click();
    });
  }

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    vi.spyOn(classesApi, 'getClasses').mockResolvedValue(sampleClasses);
    vi.spyOn(classesApi, 'getSessions').mockResolvedValue(sampleSessions);
    vi.spyOn(classesApi, 'getDisciplines').mockResolvedValue([
      { id: 1, name: 'Mindful Yoga', description: 'Yoga tĩnh tâm' },
    ]);
    vi.spyOn(classesApi, 'getAvailableRooms').mockResolvedValue([
      { id: 2, name: 'Studio A', capacity: 20, location: 'Tầng 2', status: 'available' },
    ]);
    vi.spyOn(classesApi, 'getActiveCoaches').mockResolvedValue([
      { id: 10, fullName: 'HLV Nguyễn Minh Quân', email: 'coach@scms.local', status: 'active' },
    ]);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('hides create, edit, reschedule, and delete buttons for Receptionist (STAFF role)', async () => {
    vi.spyOn(clientModule, 'getCurrentUser').mockReturnValue({
      id: '2',
      name: 'Lễ tân Lan',
      identifier: 'reception@scms.local',
      role: 'STAFF',
    });

    await act(async () => {
      root.render(<StaffClassesPage />);
    });
    await openListView();

    expect(host.textContent).toContain('Morning Yoga Flow');
    expect(host.querySelector('[data-testid="read-only-schedule-badge"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="create-class-button"]')).toBeNull();
    expect(host.querySelector('[data-testid="edit-class-101"]')).toBeNull();
    expect(host.querySelector('[data-testid="reschedule-class-101"]')).toBeNull();
    expect(host.querySelector('[data-testid="delete-class-101"]')).toBeNull();
    expect(host.querySelector('[data-testid="view-class-101"]')).not.toBeNull();
  });

  it('shows edit, reschedule, and 2-step double confirm delete for Manager (MANAGER role)', async () => {
    vi.spyOn(clientModule, 'getCurrentUser').mockReturnValue({
      id: '1',
      name: 'Quản lý Trung tâm',
      identifier: 'manager@scms.local',
      role: 'MANAGER',
    });
    const apiFetchSpy = vi.spyOn(clientModule, 'apiFetch').mockResolvedValue(undefined);

    await act(async () => {
      root.render(<StaffClassesPage />);
    });
    await openListView();

    expect(host.textContent).toContain('Morning Yoga Flow');
    expect(host.querySelector('[data-testid="create-class-button"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="edit-class-101"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="reschedule-class-101"]')).not.toBeNull();

    const deleteBtn = host.querySelector('[data-testid="delete-class-101"]') as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();

    // Click Delete -> opens Step 1 of Double Confirm (in document.body via Modal portal or host)
    await act(async () => {
      deleteBtn.click();
    });
    expect(document.body.querySelector('[data-testid="delete-step-1-box"]')).not.toBeNull();
    expect(apiFetchSpy).not.toHaveBeenCalled();

    // Click Step 1 confirm -> transitions to Step 2
    const step1Btn = document.body.querySelector('[data-testid="delete-confirm-step1-btn"]') as HTMLButtonElement;
    expect(step1Btn).not.toBeNull();
    await act(async () => {
      step1Btn.click();
    });
    expect(document.body.querySelector('[data-testid="delete-step-2-box"]')).not.toBeNull();
    expect(apiFetchSpy).not.toHaveBeenCalled();

    // Click Step 2 confirm -> calls DELETE /classes/101
    const step2Btn = document.body.querySelector('[data-testid="delete-confirm-step2-btn"]') as HTMLButtonElement;
    expect(step2Btn).not.toBeNull();
    await act(async () => {
      step2Btn.click();
    });
    expect(apiFetchSpy).toHaveBeenCalledWith('/classes/101', { method: 'DELETE' });
  });

  it('SCRUM-132: blocks and warns Manager on form when room or coach has overlapping schedule', async () => {
    vi.spyOn(clientModule, 'getCurrentUser').mockReturnValue({
      id: '1',
      name: 'Quản lý Trung tâm',
      identifier: 'manager@scms.local',
      role: 'MANAGER',
    });

    vi.spyOn(classesApi, 'getClasses').mockResolvedValue([
      ...sampleClasses,
      {
        id: 102,
        name: 'Power Boxing',
        disciplineId: 1,
        disciplineName: 'Mindful Yoga',
        coachId: 10,
        coachName: 'HLV Nguyễn Minh Quân',
        roomId: 2,
        roomName: 'Studio A',
        capacity: 15,
        level: 'all',
        status: 'ACTIVE',
      },
    ]);

    vi.spyOn(classesApi, 'getSessions').mockResolvedValue([
      ...sampleSessions,
      {
        id: 502,
        classId: 102,
        sessionDate: '2026-11-10',
        startTime: '08:30:00',
        endTime: '10:00:00',
        status: 'scheduled',
      },
    ]);

    await act(async () => {
      root.render(<StaffClassesPage />);
    });
    await openListView();

    const rescheduleBtn = host.querySelector('[data-testid="reschedule-class-102"]') as HTMLButtonElement;
    expect(rescheduleBtn).not.toBeNull();

    await act(async () => {
      rescheduleBtn.click();
    });

    const warningBanner = document.body.querySelector('[data-testid="reschedule-conflict-warning"]');
    expect(warningBanner).not.toBeNull();
    expect(warningBanner?.textContent).toContain('Trùng lịch phòng tập');
    expect(warningBanner?.textContent).toContain('Morning Yoga Flow');

    const submitRescheduleBtn = document.body.querySelector('[data-testid="submit-reschedule-button"]') as HTMLButtonElement;
    expect(submitRescheduleBtn.disabled).toBe(true);
  });
});

describe("Staff catalog loading regressions", () => {
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.spyOn(clientModule, 'getCurrentUser').mockReturnValue({ id: '1', name: 'Manager', identifier: 'manager', role: 'MANAGER' });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } });
  vi.spyOn(classesApi, 'getClasses').mockResolvedValue([]);
  vi.spyOn(classesApi, 'getSessions').mockResolvedValue([]);
  vi.spyOn(classesApi, 'getDisciplines').mockResolvedValue([{ id: 1, name: 'Gym', description: '' }]);
  vi.spyOn(classesApi, 'getAvailableRooms').mockResolvedValue([]);
  vi.spyOn(classesApi, 'getActiveCoaches').mockResolvedValue([]);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
const openForm = async () => {
  await act(async () => root.render(<StaffClassesPage />));
  await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="create-class-button"]')!.click());
};

it('keeps catalog fields pending until their request resolves and then reveals the form immediately', async () => {
  let resolveDisciplines!: (value: Discipline[]) => void;
  vi.spyOn(classesApi, 'getDisciplines').mockReturnValue(new Promise(resolve => { resolveDisciplines = resolve; }));
  await openForm();
  expect(host.querySelector('dialog [aria-busy="true"]')).not.toBeNull();
  expect(host.querySelector('#class-discipline')).toBeNull();

  await act(async () => resolveDisciplines([{ id: 7, name: 'Yoga đã tải', description: '' }]));
  expect(host.querySelector('dialog [aria-busy="true"]')).toBeNull();
  expect(host.querySelector('#class-discipline')?.parentElement?.querySelector('select')?.textContent).toContain('Yoga đã tải');
});

it('shows catalog failure with retry instead of an apparently empty creation form', async () => {
  vi.spyOn(classesApi, 'getDisciplines').mockRejectedValueOnce(new Error('Mất kết nối danh mục'));
  await openForm();
  expect(host.querySelector('dialog [role="alert"]')?.textContent).toContain('Mất kết nối danh mục');
  expect(host.querySelector('#class-discipline')).toBeNull();

  const retry = [...host.querySelectorAll<HTMLButtonElement>('dialog button')].find(button => button.textContent === 'Thử lại')!;
  await act(async () => retry.click());
  expect(host.querySelector('#class-discipline')?.parentElement?.querySelector('select')?.textContent).toContain('Gym');
});

});

describe('StaffClassesPage weekly timetable', () => {
  let host: HTMLDivElement;
  let root: Root;
  const cls: ClassItem = {
    id: 101, name: 'Morning Yoga Flow', disciplineId: 1, disciplineName: 'Yoga', coachId: 10, coachName: 'HLV Quân',
    roomId: 2, roomName: 'Studio A', capacity: 15, level: 'all', status: 'ACTIVE',
  };
  const monday: ClassSessionDto = {
    id: 501, classId: 101, sessionDate: '2099-01-05', startTime: '08:00:00', endTime: '09:30:00', status: 'scheduled',
    capacity: 15, bookedCount: 4,
  };
  const as = (role: 'MANAGER' | 'STAFF') =>
    vi.spyOn(clientModule, 'getCurrentUser').mockReturnValue({ id: '1', name: 'U', identifier: 'u', role });
  const render = () => act(async () => root.render(<StaffClassesPage />));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2099, 0, 5, 6, 0) });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } });
    vi.spyOn(classesApi, 'getClasses').mockResolvedValue([cls]);
    vi.spyOn(classesApi, 'getSessions').mockResolvedValue([monday]);
    vi.spyOn(classesApi, 'getDisciplines').mockResolvedValue([{ id: 1, name: 'Yoga', description: '' }]);
    vi.spyOn(classesApi, 'getAvailableRooms').mockResolvedValue([{ id: 2, name: 'Studio A', capacity: 20, location: 'T1', status: 'available' }]);
    vi.spyOn(classesApi, 'getActiveCoaches').mockResolvedValue([{ id: 10, fullName: 'HLV Quân', email: 'c@x.test', status: 'active' }]);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals();
  });

  it('opens on the timetable and shows scheduled sessions', async () => {
    as('MANAGER');
    await render();
    expect(host.querySelector('[data-testid="view-timetable"]')!.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('.mcal__event')!.textContent).toContain('Morning Yoga Flow');
    expect(host.querySelector('.mcal__event')!.textContent).toContain('4/15');
  });

  it('lets a manager click an empty slot to prefill the create form', async () => {
    as('MANAGER');
    await render();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-slot="2099-01-06|10"]')!.click());
    const dialog = host.querySelector('dialog[open]')!;
    expect(dialog.textContent).toContain('Tạo lớp học');
    expect(dialog.querySelector('#session-date')!.textContent).toContain('06/01/2099');
    expect(dialog.querySelector('#session-start')!.textContent).toContain('10:00');
    expect(dialog.querySelector('#session-end')!.textContent).toContain('11:00');
  });

  it('adds a session for an existing class from the empty slot', async () => {
    as('MANAGER');
    const createSession = vi.spyOn(classesApi, 'createSession').mockResolvedValue({ ...monday, id: 502 });
    await render();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-slot="2099-01-07|15"]')!.click());
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('dialog button')].find((b) => b.textContent === 'Thêm buổi cho lớp có sẵn')!.click());
    const select = host.querySelector<HTMLSelectElement>('select#existing-class, #existing-class select, .ui-select select')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, '101');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="submit-add-session-button"]')!.click());
    expect(createSession).toHaveBeenCalledWith({ classId: 101, sessionDate: '2099-01-07', startTime: '15:00', endTime: '16:00' });
  });

  it('keeps the timetable read-only for receptionists', async () => {
    as('STAFF');
    await render();
    expect(host.querySelector('.mcal__event')).not.toBeNull();
    expect(host.querySelectorAll('button.mcal__slot')).toHaveLength(0);
  });
});
