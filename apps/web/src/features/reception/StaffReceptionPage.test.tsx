import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { StaffReceptionPage } from './StaffReceptionPage';
import { getCurrentUser } from '../../shared/api/client';
import { checkinApi } from './checkinApi';

const api = vi.hoisted(() => ({
  lookupMembers: vi.fn(), getPendingSubscriptions: vi.fn(), getPendingHoldRequests: vi.fn(),
  getActivePackages: vi.fn(), getRenewalCandidates: vi.fn(), createRenewal: vi.fn(), processPayment: vi.fn(), getPendingReceipt: vi.fn(),
  getUnpaidCoachBookings: vi.fn(), confirmCoachBookingPayment: vi.fn(),
}));
vi.mock('./receptionApi', () => ({ receptionApi: api, maskCitizenId: () => '—' }));
vi.mock('../../shared/api/client', () => ({ getCurrentUser: vi.fn() }));
vi.mock('./checkinApi', () => ({ checkinApi: { gateQr: vi.fn() } }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,gate-qr') } }));
vi.mock('../../shared/ui/toast', () => ({ toast: vi.fn() }));
vi.mock('./PaymentInvoice', () => ({ PaymentInvoice: () => <div>Hóa đơn thực</div> }));

let root: Root;
let host: HTMLDivElement;
const member = { userId: 10, membershipCode: 'MB-10', fullName: 'An', email: 'an@example.test', phone: '1234', status: 'ACTIVE' };
const pkg = { id: 2, name: 'Gold', price: 200, durationDays: 30, status: 'active' };
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetAllMocks();
  vi.mocked(getCurrentUser).mockReturnValue({ id: 'staff', name: 'Lễ tân', identifier: 'staff', role: 'STAFF' });
  vi.mocked(checkinApi.gateQr).mockResolvedValue({ qrCode: 'SOL:GATE:1:A1:signed', gateId: 'A1', gate: 'Turnstile A1 - Sảnh Chính',
    generatedAt: '2026-10-29T00:00:00Z', expiresAt: '2026-10-29T00:01:00Z', expiresInSeconds: 60 });
  api.lookupMembers.mockResolvedValue([member]);
  api.getPendingSubscriptions.mockResolvedValue([]);
  api.getPendingHoldRequests.mockResolvedValue([]);
  api.getUnpaidCoachBookings.mockResolvedValue([]);
  api.getActivePackages.mockResolvedValue([pkg]);
  api.getRenewalCandidates.mockResolvedValue([]);
  api.getPendingReceipt.mockResolvedValue(null);
  api.processPayment.mockResolvedValue({ id: 42, memberId: 10, amount: 200, method: 'pos', status: 'success', paidAt: '2026-10-01T10:00:00', invoiceNumber: 'INV-42' });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it.each(['STAFF', 'MANAGER'] as const)('shows a scannable gate QR on reception before member lookup for %s', async (role) => {
  vi.mocked(getCurrentUser).mockReturnValue({ id: 'staff', name: 'Lễ tân', identifier: 'staff', role });
  await act(async () => root.render(<StaffReceptionPage />));
  const image = host.querySelector<HTMLImageElement>('img[alt="Mã QR cổng check-in"]');
  expect(image?.src).toBe('data:image/png;base64,gate-qr');
  expect(image!.compareDocumentPosition(host.querySelector('form')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('keeps the gate QR hidden from members on reception', async () => {
  vi.mocked(getCurrentUser).mockReturnValue({ id: 'member', name: 'Hội viên', identifier: 'member', role: 'MEMBER' });
  await act(async () => root.render(<MemoryRouter><StaffReceptionPage /></MemoryRouter>));
  expect(host.querySelector('[data-testid="reception-forbidden-guard"]')).not.toBeNull();
  expect(host.querySelector('img[alt="Mã QR cổng check-in"]')).toBeNull();
  expect(checkinApi.gateQr).not.toHaveBeenCalled();
});

async function selectMember() {
  await act(async () => root.render(<StaffReceptionPage />));
  const input = host.querySelector('input[placeholder^="Nhập Số điện thoại"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '1234');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.lookupMembers).toHaveBeenCalledWith('1234');
}

async function chooseAndPay(value: string) {
  const select = host.querySelector('#pos-package')!.parentElement!.querySelector('select') as HTMLSelectElement;
  expect(Array.from(select.options).map((option) => option.value)).toContain(value);
  await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => select.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}

it('sells an active package at the counter for a member without a pending order', async () => {
  await selectMember();
  await chooseAndPay('buy:2');
  expect(api.processPayment).toHaveBeenCalledWith(expect.objectContaining({ memberId: 10, packageId: 2, amount: 200 }));
  expect(api.createRenewal).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Hóa đơn thực');
});

it('blocks payment for the previous member while another member lookup is pending', async () => {
  await selectMember();
  const packageSelect = host.querySelector('#pos-package')!.parentElement!.querySelector('select') as HTMLSelectElement;
  await act(async () => { packageSelect.value = 'buy:2'; packageSelect.dispatchEvent(new Event('change', { bubbles: true })); });
  const paymentForm = packageSelect.closest('form')!;
  let finishSearch!: (members: (typeof member)[]) => void;
  api.lookupMembers.mockReturnValueOnce(new Promise(resolve => { finishSearch = resolve; }));
  const search = host.querySelector('input[placeholder^="Nhập Số điện thoại"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, '5678');
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => search.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

  await act(async () => paymentForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.processPayment).not.toHaveBeenCalled();
  expect(api.createRenewal).not.toHaveBeenCalled();
  expect(paymentForm.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);

  await act(async () => finishSearch([{ ...member, userId: 20, fullName: 'Bình', phone: '5678' }]));
  await chooseAndPay('buy:2');
  expect(api.processPayment).toHaveBeenCalledTimes(1);
  expect(api.processPayment).toHaveBeenCalledWith(expect.objectContaining({ memberId: 20 }));
});

it('creates a linked renewal before collecting payment', async () => {
  const previous = { id: 5, memberId: 10, packageId: 2, packageName: 'Gold', startDate: '2026-09-01', endDate: '2026-09-30', status: 'expired', createdAt: '2026-09-01' };
  api.getRenewalCandidates.mockResolvedValue([previous]);
  api.createRenewal.mockResolvedValue({ ...previous, id: 6, status: 'pending_payment' });
  await selectMember();
  await chooseAndPay('renew:5');
  expect(api.createRenewal).toHaveBeenCalledWith(10, 5);
  expect(api.processPayment).toHaveBeenCalledWith(expect.objectContaining({ memberId: 10, subscriptionId: 6, packageId: 2, amount: 200 }));
});

it('keeps an existing pending order fixed to its selected package', async () => {
  api.getPendingSubscriptions.mockResolvedValue([{ id: 9, memberId: 10, membershipCode: 'MB-10', memberName: 'An',
    memberEmail: 'an@example.test', memberPhone: '1234', packageId: 2, packageName: 'Gold', durationDays: 30,
    packagePrice: 200, startDate: '2026-10-01', endDate: '2026-10-30', status: 'pending_payment', createdAt: '2026-10-01' }]);
  await selectMember();
  const field = host.querySelector('#pos-package') as HTMLInputElement;
  expect(field.tagName).toBe('INPUT');
  expect(field.disabled).toBe(true);
  expect(field.value).toContain('Gold');
  await act(async () => field.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.processPayment).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: 9, packageId: 2, amount: 200 }));
});

it('keeps the created renewal pending when payment fails', async () => {
  const previous = { id: 5, memberId: 10, packageId: 2, packageName: 'Gold', startDate: '2026-09-01', endDate: '2026-09-30', status: 'expired', createdAt: '2026-09-01' };
  api.getRenewalCandidates.mockResolvedValue([previous]);
  api.createRenewal.mockResolvedValue({ ...previous, id: 6, status: 'pending_payment' });
  api.processPayment.mockRejectedValue(new Error('payment failed'));
  api.getPendingSubscriptions.mockResolvedValueOnce([]).mockResolvedValue([{ id: 6, memberId: 10, membershipCode: 'MB-10', memberName: 'An',
    memberEmail: 'an@example.test', memberPhone: '1234', packageId: 2, packageName: 'Gold', durationDays: 30,
    packagePrice: 200, startDate: '2026-10-01', endDate: '2026-10-30', status: 'pending_payment', createdAt: '2026-10-01' }]);
  await selectMember();
  await chooseAndPay('renew:5');
  expect((host.querySelector('#pos-package') as HTMLInputElement).value).toContain('Yêu cầu #6');
  expect(host.textContent).not.toContain('Hóa đơn thực');
});

it('lets the desk record payment for an unpaid hourly 1:1 session', async () => {
  const booking = { id: 90, memberId: 10, memberName: 'An', coachId: 20, coachName: 'Hùng', coachSpecialization: 'Gym',
    coachAvatarUrl: null, disciplineId: null, disciplineName: null, bookingDate: '2026-11-02', startTime: '14:00:00',
    endTime: '15:00:00', hourlyRate: 200000, paymentMethod: 'bank_transfer', paymentStatus: 'pending', status: 'confirmed',
    notes: null, createdAt: '2026-10-30T10:00:00', cancelledAt: null, cancelReason: null };
  api.getUnpaidCoachBookings.mockResolvedValueOnce([booking]).mockResolvedValue([]);
  api.confirmCoachBookingPayment.mockResolvedValue({ ...booking, paymentStatus: 'paid' });
  await act(async () => root.render(<StaffReceptionPage />));
  expect(host.textContent).toContain('Buổi PT chưa thanh toán (1)');
  const confirm = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Đã nhận chuyển khoản')!;
  await act(async () => confirm.click());
  expect(api.confirmCoachBookingPayment).toHaveBeenCalledWith(90, 'bank_transfer');
  expect(host.textContent).toContain('Không có buổi PT nào chờ thu tiền.');
});

it('shows a retry when unpaid 1:1 sessions fail to load', async () => {
  api.getUnpaidCoachBookings.mockRejectedValueOnce(new Error('Mất kết nối')).mockResolvedValue([]);
  await act(async () => root.render(<StaffReceptionPage />));
  expect(host.textContent).toContain('Mất kết nối');
  const retry = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Thử lại')!;
  await act(async () => retry.click());
  expect(host.textContent).toContain('Không có buổi PT nào chờ thu tiền.');
});
