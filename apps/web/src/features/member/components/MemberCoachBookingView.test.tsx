import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberCoachBookingView } from './MemberCoachBookingView';

const api = vi.hoisted(() => ({ quota: vi.fn() }));
vi.mock('../coachBookingApi', () => ({
  getCoaches: vi.fn().mockResolvedValue([]),
  getAvailableSlots: vi.fn().mockResolvedValue([]),
  getMyCoachBookings: vi.fn().mockResolvedValue([]),
  createCoachBooking: vi.fn(),
  cancelCoachBooking: vi.fn(),
  getMemberQuotaStatus: api.quota,
}));
vi.mock('../../coaching/coachReviewApi', () => ({
  createCoachReview: vi.fn(),
  getMyCoachReviews: vi.fn().mockResolvedValue([]),
  getCoachLeaderboard: vi.fn().mockResolvedValue([]),
}));

const NO_PACKAGE_NOTICE = 'Bạn chưa đăng ký gói tập hoặc gói tập chưa được kích hoạt';

describe('MemberCoachBookingView membership notice', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
  const render = () => act(async () => root.render(<MemoryRouter><MemberCoachBookingView /></MemoryRouter>));

  it('tells a member without a package to register one', async () => {
    api.quota.mockResolvedValue({ packageName: null, monthlyQuota: 0, usedThisMonth: 0, remainingQuota: 0 });
    await render();
    expect(host.textContent).toContain(NO_PACKAGE_NOTICE);
    expect(host.textContent).toContain('Đăng ký gói tập ngay');
  });

  it('does not claim the member has no package when the quota request fails', async () => {
    api.quota.mockRejectedValue(new Error('offline'));
    await render();
    expect(host.textContent).not.toContain(NO_PACKAGE_NOTICE);
    expect(host.textContent).not.toContain('Bạn chưa có gói tập đang hoạt động');
    expect(host.textContent).toContain('Nâng cấp gói tập');
  });

  it('shows the real package for a member who has one', async () => {
    api.quota.mockResolvedValue({ packageName: 'SILVER', monthlyQuota: 0, usedThisMonth: 0, remainingQuota: 0 });
    await render();
    expect(host.textContent).toContain('Gói SILVER không bao gồm lượt tập PT 1:1 miễn phí.');
    expect(host.textContent).not.toContain(NO_PACKAGE_NOTICE);
  });
});
