import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberInvoicesPage } from './MemberInvoicesPage';
import { ApiError } from '../../shared/api/client';
import { PortalIcon } from '../portal/PortalIcon';
import { PORTAL_NAV } from '../portal/portalNavigation';

const mocks = vi.hoisted(() => ({ payments: vi.fn(), invoice: vi.fn(), pdf: vi.fn() }));
vi.mock('./membershipApi', async (original) => ({ ...await original<typeof import('./membershipApi')>(), getMyPayments: mocks.payments }));
vi.mock('./memberInvoicesApi', async (original) => ({ ...await original<typeof import('./memberInvoicesApi')>(), getMyInvoiceByPayment: mocks.invoice, getMyInvoicePdf: mocks.pdf }));

const paid = { id: 12, amount: 250000, paidAt: '2026-10-25T10:00:00', status: 'success' };

describe('MemberInvoicesPage', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div'); document.body.append(host);
    root = createRoot(host);
    mocks.payments.mockReset(); mocks.invoice.mockReset(); mocks.pdf.mockReset();
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  async function render() { await act(async () => root.render(<MemberInvoicesPage />)); }

  it('separates pending VNPay checkout from successful invoice history', async () => {
    let resolve!: (value: unknown[]) => void;
    mocks.payments.mockReturnValue(new Promise((done) => { resolve = done; }));
    await render();
    expect(host.textContent).toContain('Đang tải giao dịch');
    expect(host.querySelector('[role="status"] [aria-hidden="true"]')).not.toBeNull();
    expect(host.querySelector('.portal-container.member-invoices')).not.toBeNull();
    await act(async () => resolve([paid, { ...paid, id: 13, status: 'pending' }]));
    expect(host.textContent).toContain('#12');
    expect(host.querySelector('.member-invoices__table')?.textContent).not.toContain('#13');
    expect(host.querySelector('[aria-label="Khoản chờ thanh toán"]')?.textContent).toContain('#13');
    expect(host.textContent).toContain('Thanh toán VNPay Sandbox');
  });

  it('shows an invoice skeleton until the detail request settles without a display delay', async () => {
    mocks.payments.mockResolvedValue([paid]);
    let finish!: (value: unknown) => void;
    mocks.invoice.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await render();
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Xem hóa đơn giao dịch #12"]')?.click());
    expect(host.querySelector('.member-invoices__invoice [role="status"] [aria-hidden="true"]')).not.toBeNull();
    expect(host.querySelector('.member-invoices__download')).toBeNull();
    await act(async () => finish({ paymentId: 12, invoiceNumber: 'INV-12', issuedAt: '2026-10-25T10:00:00', subtotalAmount: 200000, taxAmount: 20000, totalAmount: 220000 }));
    expect(host.querySelector('.member-invoices__invoice [role="status"]')).toBeNull();
    expect(host.textContent).toContain('INV-12');
  });

  it('opens owned invoice, shows persisted total and downloads its PDF', async () => {
    mocks.payments.mockResolvedValue([paid]);
    mocks.invoice.mockResolvedValue({ paymentId: 12, invoiceNumber: 'INV-12', issuedAt: '2026-10-25T10:00:00', subtotalAmount: 200000, taxAmount: 20000, totalAmount: 219000 });
    await render();
    await act(async () => host.querySelector('button[aria-label="Xem hóa đơn giao dịch #12"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(mocks.invoice).toHaveBeenCalledWith(12);
    expect(host.textContent).toContain('INV-12');
    expect(host.textContent).toContain('219.000');
    // Both the list and the invoice show the time of day, not only the date.
    expect(host.textContent).toContain('10:00 25/10/2026');
    expect(host.textContent).toContain('Phát hành lúc 10:00 25/10/2026');
    expect(host.textContent).toContain('Thanh toán lúc10:00 25/10/2026');
    expect(host.querySelector('.member-invoices__download')?.classList.contains('btn-primary')).toBe(true);
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    mocks.pdf.mockResolvedValue(blob);
    const createUrl = vi.fn().mockReturnValue('blob:test');
    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.useFakeTimers();
    await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Tải hóa đơn'))?.click());
    expect(mocks.pdf).toHaveBeenCalledWith(12);
    expect(createUrl).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalled();
    expect(revokeUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeUrl).toHaveBeenCalledWith('blob:test');
    click.mockRestore();
  });

  it('shows PDF download error and allows retry', async () => {
    mocks.payments.mockResolvedValue([paid]);
    mocks.invoice.mockResolvedValue({ paymentId: 12, invoiceNumber: 'INV-12', issuedAt: '2026-10-25T10:00:00', subtotalAmount: 200000, taxAmount: 20000, totalAmount: 220000 });
    mocks.pdf.mockRejectedValueOnce(new Error('offline'));
    await render();
    await act(async () => host.querySelector('button[aria-label="Xem hóa đơn giao dịch #12"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Tải hóa đơn'))?.click());
    expect(host.textContent).toContain('Không tải được file hóa đơn');
  });

  it('disables download while the PDF request is pending', async () => {
    mocks.payments.mockResolvedValue([paid]);
    mocks.invoice.mockResolvedValue({ paymentId: 12, invoiceNumber: 'INV-12', issuedAt: '2026-10-25T10:00:00', subtotalAmount: 200000, taxAmount: 20000, totalAmount: 220000 });
    mocks.pdf.mockReturnValue(new Promise(() => {}));
    await render();
    await act(async () => host.querySelector('button[aria-label="Xem hóa đơn giao dịch #12"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Tải hóa đơn'))?.click());
    const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('Đang tải file'));
    expect(button?.disabled).toBe(true);
  });

  it('shows empty, list error, and missing-invoice states', async () => {
    mocks.payments.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([paid]);
    mocks.invoice.mockRejectedValue(new ApiError('missing', 404));
    await render();
    expect(host.textContent).toContain('Chưa có giao dịch');
    // Remount to exercise the request failure independently.
    await act(async () => root.unmount());
    root = createRoot(host);
    await render();
    expect(host.textContent).toContain('Không tải được giao dịch');
    await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent === 'Thử lại')?.click());
    await act(async () => host.querySelector('button[aria-label="Xem hóa đơn giao dịch #12"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(host.textContent).toContain('chưa có hóa đơn điện tử');
  });

  it('uses a receipt icon for invoices while preserving the membership card icon', async () => {
    expect(PORTAL_NAV.find((item) => item.to === '/member/invoices')?.icon).toBe('receipt');
    expect(PORTAL_NAV.find((item) => item.to === '/member/card')?.icon).toBe('card');
    await act(async () => root.render(<><PortalIcon name="receipt" /><PortalIcon name="card" /></>));
    const icons = host.querySelectorAll('svg');
    expect(icons[0].getAttribute('viewBox')).toBe('0 0 24 24');
    expect(icons[0].getAttribute('stroke-width')).toBe(icons[1].getAttribute('stroke-width'));
    expect(icons[0].querySelector('path')?.getAttribute('d')).not.toBe(icons[1].querySelector('path')?.getAttribute('d'));
  });
});
