import { setLanguage } from '../../shared/i18n/language';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberCardPage } from './MemberCardPage';
import { getProfile } from './profileApi';
import { getMembershipHistory, getMySubscription, getDynamicQr } from './memberCardApi';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';

vi.mock('./profileApi', () => ({ getProfile: vi.fn() }));
vi.mock('./memberCardApi', () => ({ getMySubscription: vi.fn(), getMembershipHistory: vi.fn(), getDynamicQr: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn() } }));
vi.mock('html2canvas', () => ({ default: vi.fn() }));

const profile = { fullName: 'Nguyễn Minh', membershipCode: 'MB-01' };
const subscription = { id: 1, packageName: 'SÖL Gold', startDate: '2026-01-01', endDate: '2099-12-31', status: 'active', qrCode: 'backend-qr' };
let host: HTMLDivElement;
let root: Root;
let clipboardDescriptor: PropertyDescriptor | undefined;

async function renderPage() {
  await act(async () => { root.render(<MemoryRouter><MemberCardPage /></MemoryRouter>); });
}

async function finishQrLoading() {
  const image = host.querySelector('img[alt="Mã QR check-in của hội viên"]');
  expect(image).not.toBeNull();
  await act(async () => { image?.dispatchEvent(new Event('load')); });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  document.querySelectorAll('.sol-toast').forEach((node) => node.remove());
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(getProfile).mockResolvedValue(profile as never);
  vi.mocked(getMySubscription).mockResolvedValue(subscription as never);
  vi.mocked(getMembershipHistory).mockResolvedValue([]);
  vi.mocked(getDynamicQr).mockRejectedValue(new Error('no dynamic qr'));
  vi.mocked(QRCode.toDataURL).mockResolvedValue('data:image/png;base64,AA' as never);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); setLanguage('vi');
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
  document.querySelectorAll('.sol-toast').forEach((node) => node.remove());
  vi.clearAllMocks();
});

describe('MemberCardPage', () => {
  it('shows paid renewal expiry instead of the current period expiry', async () => {
    vi.mocked(getMySubscription).mockResolvedValue({ ...subscription, paidThroughDate: '2100-03-01' } as never);
    await renderPage();
    expect(host.textContent).toContain('Ngày hết hạn: 01/03/2100');
    expect(vi.mocked(QRCode.toDataURL).mock.calls[0][0]).toBe('backend-qr');
  });

  it('avoids an expiry warning when a contiguous renewal has been paid', async () => {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    vi.mocked(getMySubscription).mockResolvedValue({ ...subscription, endDate: key, paidThroughDate: '2099-12-31' } as never);
    await renderPage();
    expect(host.textContent).toContain('Gói tập đang hoạt động');
    expect(host.textContent).not.toContain('Gói tập sắp hết hạn');
    expect(host.querySelector('img[alt="Mã QR check-in của hội viên"]')).not.toBeNull();
  });

  it('never enables an expired period QR merely because paidThroughDate is later', async () => {
    vi.mocked(getMySubscription).mockResolvedValue({ ...subscription, endDate: '2020-01-01', paidThroughDate: '2099-12-31' } as never);
    await renderPage();
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
    expect(host.querySelector('button')?.disabled).toBe(true);
  });

  it('shows a real active card and renders the backend QR value', async () => {
    vi.mocked(QRCode.toDataURL).mockResolvedValue('https://example.invalid/qr.png' as never);
    await renderPage();
    expect(host.textContent).toContain('Nguyễn Minh');
    expect(host.textContent).toContain('SÖL Gold');
    expect(host.textContent).toContain('Ngày bắt đầu: 01/01/2026');
    expect(vi.mocked(QRCode.toDataURL).mock.calls[0][0]).toBe('backend-qr');
    expect(getMembershipHistory).not.toHaveBeenCalled();
    expect(host.querySelector('img[alt="Mã QR check-in của hội viên"]')).not.toBeNull();
    expect(host.querySelector('button')?.disabled).toBe(true);
    await finishQrLoading();
    expect(host.querySelector('button')?.disabled).toBe(false);
  });

  it.each([
    [{ ...subscription, status: 'pending_payment' }, 'Gói tập chưa hoạt động'],
    [{ ...subscription, endDate: '2020-01-01' }, 'Gói tập đã hết hạn'],
    [{ ...subscription, qrCode: null }, 'Chưa có mã QR hợp lệ'],
  ])('hides QR and download for invalid subscription', async (value, message) => {
    vi.mocked(getMySubscription).mockResolvedValue(value as never);
    await renderPage();
    expect(host.textContent).toContain(message);
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('button')?.disabled).toBe(true);
  });

  it.each([0, -1])('allows QR when the start date is today or earlier (%i)', async (offset) => {
    const start = new Date();
    start.setDate(start.getDate() + offset);
    const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    vi.mocked(getMySubscription).mockResolvedValue({ ...subscription, startDate } as never);
    await renderPage();
    expect(QRCode.toDataURL).toHaveBeenCalledWith('backend-qr', expect.anything());
    expect(host.querySelector('img')).not.toBeNull();
  });

  it('hides QR, copy and download when an active subscription starts tomorrow', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    vi.mocked(getMySubscription).mockResolvedValue({ ...subscription, startDate } as never);
    await renderPage();
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('button')?.disabled).toBe(true);
    expect(host.textContent).not.toContain('Sao chép mã QR Check-in');
  });

  it.each(['inactive', 'cancelled', 'pending_payment', 'expired'])('hides QR for %s status', async (status) => {
    vi.mocked(getMySubscription).mockResolvedValue({ ...subscription, status } as never);
    await renderPage();
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('button')?.disabled).toBe(true);
  });

  it.each(['2026-02-30', 'not-a-date'])('hides QR for invalid start date %s', async (startDate) => {
    vi.mocked(getMySubscription).mockResolvedValue({ ...subscription, startDate } as never);
    await renderPage();
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('button')?.disabled).toBe(true);
  });

  it.each(['backend-qr', 'DYN:9:1:123:signed'])('copies the displayed QR %s and waits for clipboard completion', async (qrCode) => {
    let resolveWrite!: () => void;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { resolveWrite = resolve; }));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    if (qrCode.startsWith('DYN:')) {
      vi.mocked(getDynamicQr).mockResolvedValue({ qrCode, expiresInSeconds: 60, generatedAt: '2026-10-21T12:00:00' });
    }
    await renderPage();
    await act(async () => { host.querySelector<HTMLButtonElement>('button.btn-secondary')?.click(); });
    expect(writeText).toHaveBeenCalledWith(qrCode);
    expect(document.querySelector('.sol-toast--success')).toBeNull();
    await act(async () => { resolveWrite(); });
    expect(document.querySelector('.sol-toast--success')?.textContent).toContain('Đã sao chép');
  });

  it('reports an error when the clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await renderPage();
    await act(async () => { host.querySelector<HTMLButtonElement>('button.btn-secondary')?.click(); });
    expect(writeText).toHaveBeenCalledWith('backend-qr');
    expect(document.querySelector('.sol-toast--error')?.textContent).toContain('Không thể sao chép');
    expect(document.querySelector('.sol-toast--success')).toBeNull();
  });

  it('reports an error when the Clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    await renderPage();
    await act(async () => { host.querySelector<HTMLButtonElement>('button.btn-secondary')?.click(); });
    expect(document.querySelector('.sol-toast--error')?.textContent).toContain('Không thể sao chép');
    expect(document.querySelector('.sol-toast--success')).toBeNull();
  });
  it('shows an empty state only for a successful null response', async () => {
    vi.mocked(getMySubscription).mockResolvedValue(null);
    await renderPage();
    expect(host.textContent).toContain('Chưa có gói tập');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/member/packages');
    expect(host.querySelector('a')?.textContent).toBe('Xem gói tập');
    expect(getMembershipHistory).toHaveBeenCalledTimes(1);
  });

  it('shows an expired card from history without rendering its old QR or enabling download', async () => {
    vi.mocked(getMySubscription).mockResolvedValue(null);
    vi.mocked(getMembershipHistory).mockResolvedValue([{ ...subscription, id: 2, packageName: 'Gói cũ', status: 'expired', endDate: '2020-01-01', qrCode: 'old-qr' }] as never);
    await renderPage();
    expect(host.textContent).toContain('Gói cũ');
    expect(host.textContent).toContain('Gói tập đã hết hạn');
    expect(host.textContent).toContain('Nguyễn Minh');
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('button')?.disabled).toBe(true);
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/member/packages');
  });

  it('treats a historical active record with a past end date as expired', async () => {
    vi.mocked(getMySubscription).mockResolvedValue(null);
    vi.mocked(getMembershipHistory).mockResolvedValue([{ ...subscription, status: 'active', endDate: '2020-01-01' }] as never);
    await renderPage();
    expect(host.textContent).toContain('Gói tập đã hết hạn');
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/member/packages');
  });

  it('shows pending payment instead of never purchased', async () => {
    vi.mocked(getMySubscription).mockResolvedValue(null);
    vi.mocked(getMembershipHistory).mockResolvedValue([{ ...subscription, status: 'pending_payment' }] as never);
    await renderPage();
    expect(host.textContent).toContain('Đang chờ thanh toán');
    expect(host.textContent).not.toContain('Chưa có gói tập');
    expect(host.querySelector('img')).toBeNull();
  });

  it('shows the most recently expired activated package and a newer payment request', async () => {
    vi.mocked(getMySubscription).mockResolvedValue(null);
    vi.mocked(getMembershipHistory).mockResolvedValue([
      { ...subscription, id: 3, packageName: 'Gói đang chờ', status: 'pending_payment', createdAt: '2026-10-10T10:00:00' },
      { ...subscription, id: 1, packageName: 'Gói cũ hơn', status: 'expired', endDate: '2024-12-31', createdAt: '2024-01-01T10:00:00' },
      { ...subscription, id: 2, packageName: 'Gói hết hạn gần nhất', status: 'expired', endDate: '2025-12-31', createdAt: '2023-01-01T10:00:00' },
    ] as never);
    await renderPage();
    expect(host.textContent).toContain('Gói hết hạn gần nhất');
    expect(host.textContent).not.toContain('Gói cũ hơn');
    expect(host.textContent).toContain('Đang chờ thanh toán');
    expect(host.textContent).toContain('Gói đang chờ');
  });

  it('shows a cancelled-only state without QR', async () => {
    vi.mocked(getMySubscription).mockResolvedValue(null);
    vi.mocked(getMembershipHistory).mockResolvedValue([{ ...subscription, status: 'cancelled' }] as never);
    await renderPage();
    expect(host.textContent).toContain('không còn gói tập hiệu lực');
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/member/packages');
  });

  it('shows history errors and retries instead of claiming no membership', async () => {
    vi.mocked(getMySubscription).mockResolvedValue(null);
    vi.mocked(getMembershipHistory).mockRejectedValueOnce(new Error('history offline')).mockResolvedValueOnce([]);
    await renderPage();
    expect(host.textContent).toContain('Không thể tải');
    expect(host.textContent).not.toContain('Chưa có gói tập');
    await act(async () => { host.querySelector('button')?.click(); });
    expect(getMembershipHistory).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('Chưa có gói tập');
  });

  it('shows API errors and retries the request', async () => {
    vi.mocked(getMySubscription).mockRejectedValueOnce(new Error('server down')).mockResolvedValueOnce(subscription as never);
    await renderPage();
    expect(host.textContent).toContain('Không thể tải');
    await act(async () => { host.querySelector('button')?.click(); });
    expect(getMySubscription).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('SÖL Gold');
  });

  it('downloads only after QR generation succeeds', async () => {
    vi.mocked(QRCode.toDataURL).mockResolvedValue('https://example.invalid/qr.png' as never);
    vi.mocked(html2canvas).mockResolvedValue({ toDataURL: () => 'data:image/png;base64,AA' } as never);
    await renderPage();
    await act(async () => { host.querySelector('button')?.click(); });
    expect(html2canvas).not.toHaveBeenCalled();
    await finishQrLoading();
    await act(async () => { host.querySelector('button')?.click(); });
    expect(html2canvas).toHaveBeenCalledTimes(1);
  });

  it('reports a download failure and allows another attempt', async () => {
    vi.mocked(html2canvas).mockRejectedValueOnce(new Error('canvas failure'));
    await renderPage();
    await finishQrLoading();
    await act(async () => { host.querySelector('button')?.click(); });
    expect(document.querySelector('.sol-toast--error')?.textContent).toContain('Không thể tải thẻ');
    expect(host.querySelector('button')?.disabled).toBe(false);
  });

  it('shows a warning when fewer than seven days remain', async () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 6);
    const date = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`;
    vi.mocked(getMySubscription).mockResolvedValue({ ...subscription, endDate: date } as never);
    await renderPage();
    expect(host.textContent).toContain('Gói tập sắp hết hạn');
    expect(host.querySelector('img')).not.toBeNull();
  });

  it('shows a QR error and keeps download disabled if image generation fails', async () => {
    vi.mocked(QRCode.toDataURL).mockRejectedValueOnce(new Error('QR failure'));
    await renderPage();
    expect(host.textContent).toContain('Không thể hiển thị mã QR');
    expect(host.querySelector('button')?.disabled).toBe(true);
  });

  it('keeps download disabled when the QR image itself fails to load', async () => {
    await renderPage();
    const image = host.querySelector('img[alt="Mã QR check-in của hội viên"]');
    await act(async () => { image?.dispatchEvent(new Event('error')); });
    expect(host.textContent).toContain('Không thể hiển thị mã QR');
    expect(host.querySelector('button')?.disabled).toBe(true);
  });

  it('renders dynamic QR code when available', async () => {
    vi.mocked(getDynamicQr).mockResolvedValue({
      qrCode: 'DYN:1:1:1234567890:abcd',
      expiresInSeconds: 60,
      generatedAt: '2026-10-21T02:00:00Z',
    });
    await renderPage();
    expect(host.textContent).toContain('Dynamic QR');
    expect(vi.mocked(QRCode.toDataURL)).toHaveBeenCalledWith('DYN:1:1:1234567890:abcd', expect.anything());
  });
});

it('switches the mounted card, accessibility labels, and local load error without translating member data', async () => {
  await renderPage();
  await act(async () => setLanguage('en'));
  expect(host.textContent).toContain('DIGITAL MEMBERSHIP CARD');
  expect(host.textContent).toContain('Nguyễn Minh');
  expect(host.textContent).toContain('SÖL Gold');
  expect(host.querySelector('img')?.getAttribute('alt')).toBe('Member check-in QR code');
  await act(async () => setLanguage('vi'));
  expect(host.textContent).toContain('THẺ HỘI VIÊN ĐIỆN TỬ');
});
it('keeps a local card error bilingual while it remains displayed', async () => {
  vi.mocked(getProfile).mockRejectedValueOnce(new Error('network'));
  await renderPage();
  expect(host.textContent).toContain('Không thể tải thông tin thẻ hội viên.');
  await act(async () => setLanguage('en'));
  expect(host.textContent).toContain('Unable to load membership card. Please try again.');
  await act(async () => setLanguage('vi'));
});
