import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MemberCoachBookingView,
} from './MemberCoachBookingView';
import {
  formatCoachName,
  isSessionCompleted,
  COACH_FILTER_DISCIPLINES,
  matchesCoachDiscipline,
} from '../coachBookingUtils';

const mocks = vi.hoisted(() => ({
  getCoaches: vi.fn(),
  getAvailableSlots: vi.fn(),
  getMyCoachBookings: vi.fn(),
  createCoachBooking: vi.fn(),
  createRecurringCoachBooking: vi.fn(),
  cancelCoachBooking: vi.fn(),
  getMemberQuotaStatus: vi.fn(),
  createCoachReview: vi.fn(),
  getMyCoachReviews: vi.fn(),
  getCoachLeaderboard: vi.fn(),
}));

vi.mock('../coachBookingApi', () => ({
  getCoaches: mocks.getCoaches,
  getAvailableSlots: mocks.getAvailableSlots,
  getMyCoachBookings: mocks.getMyCoachBookings,
  createCoachBooking: mocks.createCoachBooking,
  createRecurringCoachBooking: mocks.createRecurringCoachBooking,
  cancelCoachBooking: mocks.cancelCoachBooking,
  getMemberQuotaStatus: mocks.getMemberQuotaStatus,
}));

vi.mock('../../coaching/coachReviewApi', () => ({
  createCoachReview: mocks.createCoachReview,
  getMyCoachReviews: mocks.getMyCoachReviews,
  getCoachLeaderboard: mocks.getCoachLeaderboard,
}));

describe('formatCoachName & isSessionCompleted helpers', () => {
  it('formats coach names correctly without duplicate HLV prefixes', () => {
    expect(formatCoachName('HLV Huỳnh Đắc Tài')).toBe('Huỳnh Đắc Tài');
    expect(formatCoachName('hlv Nguyễn Văn A')).toBe('Nguyễn Văn A');
    expect(formatCoachName('Trần Thị B')).toBe('Trần Thị B');
    expect(formatCoachName(null)).toBe('Huấn luyện viên');
  });

  it('determines whether a session has completed based on status and time', () => {
    // Completed status
    expect(isSessionCompleted({ bookingDate: '2099-01-01', endTime: '20:00', status: 'completed' })).toBe(true);
    // Cancelled status
    expect(isSessionCompleted({ bookingDate: '2000-01-01', endTime: '10:00', status: 'cancelled' })).toBe(false);
    // Past booking date & time
    expect(isSessionCompleted({ bookingDate: '2020-01-01', endTime: '10:00', status: 'confirmed' })).toBe(true);
    // Far future booking
    expect(isSessionCompleted({ bookingDate: '2099-12-31', endTime: '23:59', status: 'confirmed' })).toBe(false);
  });
});

describe('MemberCoachBookingView Review Logic', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    mocks.getCoaches.mockResolvedValue([
      { id: 1, fullName: 'Huỳnh Đắc Tài', specialization: 'Gym Fitness', defaultHourlyRate: 250000 },
    ]);
    mocks.getAvailableSlots.mockResolvedValue([]);
    mocks.getMemberQuotaStatus.mockResolvedValue({
      packageName: 'Platinum',
      monthlyQuota: 4,
      usedThisMonth: 1,
      remainingQuota: 3,
    });
    mocks.getMyCoachReviews.mockResolvedValue([]);
    mocks.getCoachLeaderboard.mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  async function renderComponent() {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <MemberCoachBookingView />
        </MemoryRouter>
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
  }

  it('renders upcoming session with "Sắp diễn ra", pending review badge, and cancel button', async () => {
    mocks.getMyCoachBookings.mockResolvedValue([
      {
        id: 99,
        coachId: 1,
        coachName: 'HLV Huỳnh Đắc Tài',
        bookingDate: '2099-11-03',
        startTime: '20:00:00',
        endTime: '21:00:00',
        status: 'confirmed',
        paymentMethod: 'package_quota',
        hourlyRate: 250000,
      },
    ]);

    await renderComponent();

    // Does not double HLV prefix
    expect(host.textContent).toContain('Tập 1:1 cùng HLV Huỳnh Đắc Tài');
    expect(host.textContent).not.toContain('HLV HLV');

    // Upcoming indicators
    expect(host.textContent).toContain('Sắp diễn ra');
    expect(host.textContent).toContain('Đánh giá sau khi kết thúc buổi');
    expect(host.textContent).toContain('Hủy lịch hẹn');
    // Review button should not be present
    expect(host.textContent).not.toContain('Đánh giá HLV');
  });

  it('renders completed session with "Đã kết thúc buổi" and allows reviewing coach', async () => {
    mocks.getMyCoachBookings.mockResolvedValue([
      {
        id: 88,
        coachId: 1,
        coachName: 'Huỳnh Đắc Tài',
        bookingDate: '2020-01-01',
        startTime: '09:00:00',
        endTime: '10:00:00',
        status: 'confirmed',
        paymentMethod: 'package_quota',
        hourlyRate: 250000,
      },
    ]);

    await renderComponent();

    expect(host.textContent).toContain('Đã kết thúc buổi');
    expect(host.textContent).toContain('Đánh giá HLV');
    // Session in the past cannot be cancelled
    expect(host.textContent).not.toContain('Hủy lịch hẹn');

    // Click review button to open modal
    const reviewBtn = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Đánh giá HLV'));
    expect(reviewBtn).toBeDefined();

    await act(async () => {
      reviewBtn?.click();
    });

    expect(host.textContent).toContain('Đánh giá Huấn luyện viên: Huỳnh Đắc Tài');
    expect(host.textContent).toContain('Mức độ hài lòng của bạn:');
    expect(host.textContent).toContain('Gửi đánh giá');
  });
});

describe('MemberCoachBookingView membership notice', () => {
  const NO_PACKAGE_NOTICE = 'Bạn chưa đăng ký gói tập hoặc gói tập chưa được kích hoạt';
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    mocks.getCoaches.mockResolvedValue([]);
    mocks.getAvailableSlots.mockResolvedValue([]);
    mocks.getMyCoachBookings.mockResolvedValue([]);
    mocks.getMyCoachReviews.mockResolvedValue([]);
    mocks.getCoachLeaderboard.mockResolvedValue([]);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  const render = () => act(async () => root.render(<MemoryRouter><MemberCoachBookingView /></MemoryRouter>));

  it('tells a member without a package to register one', async () => {
    mocks.getMemberQuotaStatus.mockResolvedValue({ packageName: null, monthlyQuota: 0, usedThisMonth: 0, remainingQuota: 0 });
    await render();
    expect(host.textContent).toContain(NO_PACKAGE_NOTICE);
    expect(host.textContent).toContain('Đăng ký gói tập ngay');
  });

  it('does not claim the member has no package when the quota request fails', async () => {
    mocks.getMemberQuotaStatus.mockRejectedValue(new Error('offline'));
    await render();
    expect(host.textContent).not.toContain(NO_PACKAGE_NOTICE);
    expect(host.textContent).not.toContain('Bạn chưa có gói tập đang hoạt động');
    expect(host.textContent).toContain('Nâng cấp gói tập');
  });

  it('shows the real package for a member who has one', async () => {
    mocks.getMemberQuotaStatus.mockResolvedValue({ packageName: 'SILVER', monthlyQuota: 0, usedThisMonth: 0, remainingQuota: 0 });
    await render();
    expect(host.textContent).toContain('Gói SILVER không bao gồm lượt tập PT 1:1 miễn phí.');
    expect(host.textContent).not.toContain(NO_PACKAGE_NOTICE);
  });
});

describe('MemberCoachBookingView Coach Discipline Sorting & Filtering', () => {
  it('has ALL, Gym, Boxing, Yoga as filter disciplines', () => {
    expect(COACH_FILTER_DISCIPLINES).toEqual(['ALL', 'Gym', 'Boxing', 'Yoga']);
  });

  it('matches coaches by discipline patterns accurately', () => {
    const gymCoach = {
      id: 1,
      fullName: 'Huỳnh Đắc Tài',
      email: 'tai@example.com',
      phone: '0901234567',
      specialization: 'Fitness & Cardio',
      bio: 'Chuyên gia huấn luyện thể hình và phục hồi thể lực.',
      certification: 'NASM',
      avatarUrl: null,
      defaultHourlyRate: 200000,
    };
    const multiCoach = {
      id: 2,
      fullName: 'Nguyễn Minh Quân',
      email: 'quan@example.com',
      phone: '0901234568',
      specialization: 'Yoga & Strength',
      bio: 'HLV 5 nam kinh nghiem',
      certification: 'Yoga Alliance',
      avatarUrl: null,
      defaultHourlyRate: 200000,
    };
    const yogaCoach = {
      id: 3,
      fullName: 'Trần Thị Mỹ Trâm',
      email: 'tram@example.com',
      phone: '0901234569',
      specialization: 'Pilates & Yoga',
      bio: '',
      certification: '',
      avatarUrl: null,
      defaultHourlyRate: 200000,
    };
    const boxingCoach = {
      id: 4,
      fullName: 'Võ Văn Quyền',
      email: 'quyen@example.com',
      phone: '0901234570',
      specialization: 'Boxing & Kickfit',
      bio: 'Võ sĩ boxing chuyên nghiệp',
      certification: '',
      avatarUrl: null,
      defaultHourlyRate: 200000,
    };

    // ALL matches everything
    expect(matchesCoachDiscipline(gymCoach, 'ALL')).toBe(true);
    expect(matchesCoachDiscipline(yogaCoach, 'ALL')).toBe(true);
    expect(matchesCoachDiscipline(boxingCoach, 'ALL')).toBe(true);

    // Gym matching
    expect(matchesCoachDiscipline(gymCoach, 'Gym')).toBe(true);
    expect(matchesCoachDiscipline(multiCoach, 'Gym')).toBe(true);
    expect(matchesCoachDiscipline(yogaCoach, 'Gym')).toBe(false);

    // Yoga matching
    expect(matchesCoachDiscipline(yogaCoach, 'Yoga')).toBe(true);
    expect(matchesCoachDiscipline(multiCoach, 'Yoga')).toBe(true);
    expect(matchesCoachDiscipline(gymCoach, 'Yoga')).toBe(false);

    // Boxing matching
    expect(matchesCoachDiscipline(boxingCoach, 'Boxing')).toBe(true);
    expect(matchesCoachDiscipline(gymCoach, 'Boxing')).toBe(false);
    expect(matchesCoachDiscipline(yogaCoach, 'Boxing')).toBe(false);
  });

  describe('UI Interaction for discipline chips', () => {
    let host: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
      host = document.createElement('div');
      document.body.append(host);
      root = createRoot(host);

      mocks.getCoaches.mockResolvedValue([
        { id: 1, fullName: 'Huỳnh Đắc Tài', specialization: 'Fitness & Cardio', defaultHourlyRate: 200000 },
        { id: 2, fullName: 'Nguyễn Minh Quân', specialization: 'Yoga & Strength', defaultHourlyRate: 200000 },
        { id: 3, fullName: 'Trần Thị Mỹ Trâm', specialization: 'Pilates & Yoga', defaultHourlyRate: 200000 },
      ]);
      mocks.getAvailableSlots.mockResolvedValue([]);
      mocks.getMyCoachBookings.mockResolvedValue([]);
      mocks.getMemberQuotaStatus.mockResolvedValue({ packageName: 'Gold', monthlyQuota: 3, usedThisMonth: 0, remainingQuota: 3 });
      mocks.getMyCoachReviews.mockResolvedValue([]);
      mocks.getCoachLeaderboard.mockResolvedValue([]);
    });

    afterEach(async () => {
      await act(async () => root.unmount());
      host.remove();
      vi.clearAllMocks();
      vi.unstubAllGlobals();
    });

    it('renders discipline chips and filters coach list when clicked', async () => {
      await act(async () => {
        root.render(<MemoryRouter><MemberCoachBookingView /></MemoryRouter>);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });

      // Default: ALL - all 3 coaches visible
      expect(host.textContent).toContain('Tất cả bộ môn');
      expect(host.textContent).toContain('Gym');
      expect(host.textContent).toContain('Boxing');
      expect(host.textContent).toContain('Yoga');
      expect(host.textContent).toContain('Huỳnh Đắc Tài');
      expect(host.textContent).toContain('Nguyễn Minh Quân');
      expect(host.textContent).toContain('Trần Thị Mỹ Trâm');

      // Click "Yoga" chip
      const chips = [...host.querySelectorAll<HTMLButtonElement>('.filter-chip')];
      const yogaChip = chips.find((c) => c.textContent?.trim() === 'Yoga');
      expect(yogaChip).toBeDefined();

      await act(async () => {
        yogaChip?.click();
      });

      // Huỳnh Đắc Tài should be filtered out
      expect(host.textContent).not.toContain('Huỳnh Đắc Tài');
      expect(host.textContent).toContain('Nguyễn Minh Quân');
      expect(host.textContent).toContain('Trần Thị Mỹ Trâm');

      // Click "Boxing" chip (no coaches match)
      const boxingChip = chips.find((c) => c.textContent?.trim() === 'Boxing');
      await act(async () => {
        boxingChip?.click();
      });

      expect(host.textContent).toContain('Chưa có huấn luyện viên nào cho bộ môn Boxing.');
      expect(host.textContent).toContain('Xem tất cả huấn luyện viên');

      // Click "Xem tất cả huấn luyện viên" button in empty state
      const resetBtn = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.includes('Xem tất cả huấn luyện viên')
      );
      await act(async () => {
        resetBtn?.click();
      });

      // All 3 back
      expect(host.textContent).toContain('Huỳnh Đắc Tài');
      expect(host.textContent).toContain('Nguyễn Minh Quân');
      expect(host.textContent).toContain('Trần Thị Mỹ Trâm');
    });
  });
});
