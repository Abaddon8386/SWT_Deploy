import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagerCoachReviewsPage } from './ManagerCoachReviewsPage';
import * as coachReviewApi from '../coaching/coachReviewApi';
import * as coachBookingApi from '../member/coachBookingApi';

vi.mock('../coaching/coachReviewApi', () => ({
  getAllMonthlyReviews: vi.fn(),
  generateMonthlyReviews: vi.fn(),
  updateMonthlyReview: vi.fn(),
  getCoachReviews: vi.fn(),
}));

vi.mock('../member/coachBookingApi', () => ({
  getCoaches: vi.fn(),
}));

describe('ManagerCoachReviewsPage (SCRUM-134: Đánh giá HLV & Bảng xếp hạng)', () => {
  let host: HTMLDivElement;
  let root: Root;

  const mockMonthlyReviews: coachReviewApi.CoachMonthlyReviewDto[] = [
    {
      id: 1,
      coachId: 10,
      coachName: 'Huỳnh Đắc Tài',
      coachSpecialization: 'Fitness & Cardio',
      coachAvatarUrl: null,
      year: 2026,
      month: 10,
      averageRating: 4.9,
      totalReviews: 15,
      totalSessions: 42,
      rankPosition: 1,
      badge: '🥇 Top 1 Coach of the Month',
      bonusAmount: 5000000,
      managerFeedback: 'Huấn luyện viên xuất sắc của tháng!',
      status: 'published',
      createdAt: '2026-10-30T10:00:00',
      updatedAt: null,
    },
    {
      id: 2,
      coachId: 11,
      coachName: 'Nguyễn Minh Quân',
      coachSpecialization: 'Yoga & Strength',
      coachAvatarUrl: null,
      year: 2026,
      month: 10,
      averageRating: 4.7,
      totalReviews: 12,
      totalSessions: 35,
      rankPosition: 2,
      badge: '🥈 Top 2 Coach of the Month',
      bonusAmount: 3000000,
      managerFeedback: 'Tận tình với học viên.',
      status: 'published',
      createdAt: '2026-10-30T10:00:00',
      updatedAt: null,
    },
  ];

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    vi.mocked(coachReviewApi.getAllMonthlyReviews).mockResolvedValue(mockMonthlyReviews);
    vi.mocked(coachBookingApi.getCoaches).mockResolvedValue([
      {
        id: 10,
        fullName: 'Huỳnh Đắc Tài',
        email: 'tai.huynh@solfitness.vn',
        phone: '0901234567',
        bio: 'HLV Thể hình',
        certification: 'ACE Certified',
        avatarUrl: null,
        specialization: 'Fitness & Cardio',
        defaultHourlyRate: 200000,
      },
      {
        id: 11,
        fullName: 'Nguyễn Minh Quân',
        email: 'quan.nguyen@solfitness.vn',
        phone: '0907654321',
        bio: 'HLV Yoga',
        certification: 'Yoga Alliance',
        avatarUrl: null,
        specialization: 'Yoga & Strength',
        defaultHourlyRate: 200000,
      },
    ]);
    vi.mocked(coachReviewApi.getCoachReviews).mockResolvedValue([]);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  async function render() {
    await act(async () => {
      root.render(<ManagerCoachReviewsPage />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }

  it('renders the manager coach reviews page with header and auto-generate button', async () => {
    await render();

    expect(host.textContent).toContain('Bảng Xếp Hạng & Đánh Giá Huấn Luyện Viên Tháng');
    expect(host.textContent).toContain('Tự động tổng hợp số liệu tháng');
    expect(host.textContent).toContain('Huỳnh Đắc Tài');
    expect(host.textContent).toContain('Nguyễn Minh Quân');
    expect(host.textContent).toContain('Top 1 Coach of the Month');
  });

  it('opens edit modal and saves updated badge and bonus', async () => {
    await render();

    // Click edit on the first coach card
    const editBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Sửa danh hiệu & Thưởng')
    );
    expect(editBtn).not.toBeUndefined();

    await act(async () => {
      editBtn?.click();
    });

    expect(host.textContent).toContain('Đánh giá tháng & Khen thưởng: HLV Huỳnh Đắc Tài');

    vi.mocked(coachReviewApi.updateMonthlyReview).mockResolvedValue({
      ...mockMonthlyReviews[0],
      bonusAmount: 6000000,
      badge: '👑 Master Trainer',
    });

    const saveBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Lưu & Công bố cho HLV')
    );
    expect(saveBtn).not.toBeUndefined();

    await act(async () => {
      saveBtn?.click();
    });

    expect(coachReviewApi.updateMonthlyReview).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        bonusAmount: 5000000,
      })
    );
  });
});
