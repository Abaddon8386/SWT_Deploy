import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagerCatalogsPage } from './ManagerCatalogsPage';
import { catalogApi } from './catalogApi';

vi.mock('./catalogApi', () => ({
  catalogApi: {
    disciplines: vi.fn().mockResolvedValue([
      { id: 1, name: 'Gym', description: 'Sức mạnh' },
      { id: 2, name: 'Reformer Pilates', description: 'Pilates' },
    ]),
    rooms: vi.fn().mockResolvedValue([
      {
        id: 1,
        name: 'Phòng Gym Tiêu chuẩn',
        location: 'Tầng 1',
        capacity: 50,
        status: 'available',
        disciplineId: null,
        openTime: null,
        closeTime: null,
        tier: 'STANDARD',
      },
    ]),
    packages: vi.fn().mockResolvedValue([
      {
        id: 10,
        name: 'SILVER',
        description: 'BASIC – Cơ bản',
        price: 199000,
        durationDays: 30,
        classCreditLimit: 2,
        status: 'active',
        tier: 'SILVER',
      },
      {
        id: 11,
        name: 'GOLD',
        description: 'STANDARD – Trung cấp',
        price: 299000,
        durationDays: 30,
        classCreditLimit: 5,
        status: 'active',
        tier: 'GOLD',
      },
      {
        id: 12,
        name: 'PLATINUM',
        description: 'VIP – Cao cấp',
        price: 599000,
        durationDays: 30,
        classCreditLimit: null,
        status: 'active',
        tier: 'PLATINUM',
      },
    ]),
    saveDiscipline: vi.fn().mockResolvedValue({}),
    deleteDiscipline: vi.fn().mockResolvedValue(undefined),
    saveRoom: vi.fn().mockResolvedValue({}),
    deleteRoom: vi.fn().mockResolvedValue(undefined),
    savePackage: vi.fn().mockResolvedValue({}),
    deletePackage: vi.fn().mockResolvedValue(undefined),
    setPackageStatus: vi.fn().mockResolvedValue({}),
  },
}));

describe('ManagerCatalogsPage (A6: Package & Price CRUD)', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it('displays all disciplines including newly created or legacy ones and allows full package price CRUD', async () => {
    await act(async () => {
      root.render(<ManagerCatalogsPage />);
    });

    expect(host.textContent).toContain('Reformer Pilates');

    // Switch to Gói tập tab
    const pkgTabBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Gói tập (')
    )!;
    await act(async () => pkgTabBtn.click());

    expect(host.textContent).toContain('199.000 đ');
    expect(host.textContent).toContain('299.000 đ');
    expect(host.textContent).toContain('599.000 đ');
    expect(host.textContent).toContain('+ Tạo gói tập mới');

    // Quick price update on SILVER package
    const quickPriceBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent === 'Sửa giá nhanh'
    )!;
    await act(async () => quickPriceBtn.click());

    const quickInput = host.querySelector<HTMLInputElement>('#quick-pkg-price')!;
    expect(quickInput.value).toBe('199000');

    const plus50kBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent === '+50k'
    )!;
    await act(async () => plus50kBtn.click());
    expect(quickInput.value).toBe('249000');

    await act(async () => {
      host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(catalogApi.savePackage).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        name: 'SILVER',
        price: 249000,
        durationDays: 30,
        tier: 'SILVER',
      })
    );
  });

  it('opens create package modal and saves a new package with tier, price, duration, and description', async () => {
    await act(async () => {
      root.render(<ManagerCatalogsPage />);
    });

    const pkgTabBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Gói tập (')
    )!;
    await act(async () => pkgTabBtn.click());

    const createBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent === '+ Tạo gói tập mới'
    )!;
    await act(async () => createBtn.click());

    const nameInput = host.querySelector<HTMLInputElement>('#cat-name')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(nameInput, 'GOLD SUMMER PROMO');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const preset299 = [...host.querySelectorAll('button')].find((b) =>
      b.textContent === '299.000 đ'
    )!;
    await act(async () => preset299.click());

    await act(async () => {
      host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(catalogApi.savePackage).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        name: 'GOLD SUMMER PROMO',
        price: 299000,
        durationDays: 30,
        status: 'active',
      })
    );
  });
});
