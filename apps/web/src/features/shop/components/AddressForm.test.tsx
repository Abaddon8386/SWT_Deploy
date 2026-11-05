import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shopApi } from '../shopApi';
import { AddressForm } from './AddressForm';

vi.mock('../shopApi', () => ({
  shopApi: {
    listProvinces: vi.fn(),
    listWards: vi.fn(),
  },
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(shopApi.listProvinces).mockResolvedValue([
    { code: '79', name: 'TP. Hồ Chí Minh' },
    { code: '01', name: 'TP. Hà Nội' },
  ]);
  vi.mocked(shopApi.listWards).mockResolvedValue([
    { code: '26734', name: 'Phường Sài Gòn' },
  ]);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('AddressForm', () => {
  it('validates inline, renders role="alert" errors and focuses the first invalid field', async () => {
    const onSubmit = vi.fn();
    await act(async () => root.render(<AddressForm onSubmit={onSubmit} />));

    const form = host.querySelector('form')!;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onSubmit).not.toHaveBeenCalled();
    const alerts = host.querySelectorAll('.form-error[role="alert"]');
    expect(alerts.length).toBeGreaterThanOrEqual(5);

    const nameInput = host.querySelector<HTMLInputElement>('input[name="recipientName"]')!;
    expect(nameInput.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(nameInput);
  });

  it('loads wards when province changes, resets wardCode, and submits valid data', async () => {
    const onSubmit = vi.fn();
    await act(async () =>
      root.render(
        <AddressForm
          initialValue={{
            recipientName: '  Nguyễn An  ',
            phone: '0901234567',
            provinceCode: '79',
            wardCode: '26734',
            streetLine: '12 Lê Lợi, Khu phố 1',
            makeDefault: true,
          }}
          onSubmit={onSubmit}
        />,
      ),
    );

    const provinceSelect = host.querySelector<HTMLSelectElement>('select[name="provinceCode"]')!;
    const wardSelect = host.querySelector<HTMLSelectElement>('select[name="wardCode"]')!;
    expect(shopApi.listProvinces).toHaveBeenCalled();
    expect(shopApi.listWards).toHaveBeenCalledWith('79', expect.any(AbortSignal));

    // Change province -> resets wardCode
    await act(async () => {
      provinceSelect.value = '01';
      provinceSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(wardSelect.value).toBe('');

    // Select ward again
    await act(async () => {
      wardSelect.value = '26734';
      wardSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const form = host.querySelector('form')!;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onSubmit).toHaveBeenCalledWith({
      recipientName: 'Nguyễn An',
      phone: '0901234567',
      provinceCode: '01',
      wardCode: '26734',
      streetLine: '12 Lê Lợi, Khu phố 1',
      note: null,
      makeDefault: true,
    });
  });
});
