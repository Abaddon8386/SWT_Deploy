import { setLanguage } from '../../shared/i18n/language';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberDashboardPage } from './MemberDashboardPage';

const api = vi.hoisted(() => ({
  membership: vi.fn(),
  bookings: vi.fn(),
}));

vi.mock('./memberDashboardApi', () => ({
  getCurrentMembership: api.membership,
  getBookedEnrollments: api.bookings,
}));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

const membership = {
  id: 1, memberId: 1, packageId: 2, packageName: 'Essential',
  previousSubscriptionId: null, startDate: '2026-01-01',
  endDate: '2099-12-31', status: 'active', qrCode: null,
  createdAt: '2026-01-01T00:00:00',
};

describe('SCRUM-85 dashboard', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    api.membership.mockReset();
    api.bookings.mockReset();
    api.membership.mockResolvedValue(membership);
    api.bookings.mockResolvedValue([]);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove(); setLanguage('vi');
    vi.unstubAllGlobals();
  });

  async function renderDashboard() {
    await act(async () => {
      root.render(<MemoryRouter><MemberDashboardPage /><LocationProbe /></MemoryRouter>);
    });
  }

  it('opens Packages from the membership image and card details without repeating the link', async () => {
    await renderDashboard();
    const image = host.querySelector<HTMLImageElement>('.member-card-cover');
    const imageLink = image?.closest('a');
    expect(imageLink?.getAttribute('href')).toBe('/member/packages');
    await act(async () => imageLink?.click());
    expect(host.querySelector('[data-testid="location"]')?.textContent).toBe('/member/packages');

    const detailsLink = host.querySelector<HTMLAnchorElement>('.member-card-details-link');
    expect(detailsLink?.getAttribute('href')).toBe('/member/packages');
    expect(detailsLink?.textContent).toContain('Essential');
    expect(host.querySelector('.member-membership-card .member-text-link')).toBeNull();
    expect(host.querySelector('.member-board-column--orange ~ .member-board-column .member-board-note[href="/member/packages"]')).toBeNull();
  });

  it('shows paid renewal expiry and remaining days across 120 days', async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start); end.setDate(end.getDate() + 29);
    const paid = new Date(start); paid.setDate(paid.getDate() + 119);
    const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    api.membership.mockResolvedValue({ ...membership, startDate: key(start), endDate: key(end), paidThroughDate: key(paid) });
    await renderDashboard();
    expect(host.querySelector('.member-card-details-link')?.textContent).toContain(paid.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }));
    expect(host.querySelector('.member-card-details-link')?.textContent).toContain('Còn 120 ngày');
  });

  it('opens Classes from the class card without a duplicate photo card', async () => {
    await renderDashboard();
    const classLink = host.querySelector<HTMLAnchorElement>('.member-card-overlay-link');
    expect(classLink?.getAttribute('href')).toBe('/member/classes');
    await act(async () => classLink?.click());
    expect(host.querySelector('[data-testid="location"]')?.textContent).toBe('/member/classes');
    expect(host.querySelector('.member-discover-card')).toBeNull();
  });

  it('opens Digital Card from the member cards and supports keyboard focus', async () => {
    await renderDashboard();
    const card = host.querySelector<HTMLAnchorElement>('.member-digital-card');
    expect(card?.getAttribute('href')).toBe('/member/card');
    expect(card?.querySelector('a, button')).toBeNull();
    card?.focus();
    expect(document.activeElement).toBe(card);
    expect(card?.tabIndex).toBe(0);
    await act(async () => card?.click());
    expect(host.querySelector('[data-testid="location"]')?.textContent).toBe('/member/card');
    expect(host.querySelector('.member-board-info')).toBeNull();
  });
  it('shows an empty class list independently of membership', async () => {
    await renderDashboard();
    expect(host.textContent).toContain('Essential');
    expect(host.textContent).toContain('Bạn chưa có lớp học đang đặt.');
  });

  it('keeps membership when enrollment fails and retries only enrollment', async () => {
    api.bookings.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    await renderDashboard();
    expect(host.textContent).toContain('Essential');
    expect(host.textContent).toContain('Chưa thể tải lịch học lúc này.');

    const retry = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Thử lại');
    await act(async () => retry?.click());
    expect(api.bookings).toHaveBeenCalledTimes(2);
    expect(api.membership).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('Bạn chưa có lớp học đang đặt.');
  });

  it('keeps enrollment result when membership fails', async () => {
    api.membership.mockRejectedValue(new Error('offline'));
    api.bookings.mockResolvedValue([{
      id: 9, classId: 2, className: 'Yoga', coachName: 'An', roomName: 'A',
      sessionDate: '2026-10-17', startTime: '08:00:00', endTime: '09:00:00',
      status: 'booked', createdAt: '2026-10-16T10:00:00',
      cancelledAt: null, cancelReason: null,
    }]);
    await renderDashboard();
    expect(host.textContent).toContain('Không thể tải thông tin gói tập');
    expect(host.textContent).toContain('Yoga');
    expect(host.textContent).toContain('Xem lịch lớp để kiểm tra buổi học.');
    expect(host.textContent).toContain('17/10/2026');
    expect(host.textContent).toContain('08:00–09:00');
    expect(host.textContent).toContain('A');
  });

  it('excludes cancelled enrollments and not-yet-started memberships', async () => {
    api.membership.mockResolvedValue({
      ...membership,
      startDate: '2099-01-01',
      endDate: '2099-12-31',
    });
    api.bookings.mockResolvedValue([{
      id: 10, classId: 3, className: 'Pilates Cancelled', coachName: 'Bình', roomName: 'B',
      sessionDate: null, startTime: null, endTime: null,
      status: 'cancelled', createdAt: '2026-10-16T10:00:00',
      cancelledAt: '2026-10-16T11:00:00', cancelReason: 'Cancelled by MEMBER',
    }]);
    await renderDashboard();
    expect(host.textContent).toContain('Chưa có gói tập đang hoạt động');
    expect(host.textContent).not.toContain('Pilates Cancelled');
    expect(host.textContent).toContain('Bạn chưa có lớp học đang đặt.');
  });
  it('switches the mounted dashboard and preserves server membership names', async () => {
    await renderDashboard();
    await act(async () => setLanguage('en'));
    expect(host.textContent).toContain('My overview');
    expect(host.textContent).toContain('My membership');
    expect(host.textContent).toContain('Essential');
    await act(async () => setLanguage('vi'));
    expect(host.textContent).toContain('Tổng quan của tôi');
  });
});
