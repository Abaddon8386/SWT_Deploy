import { centerNowParts } from '../../shared/lib/centerTime';
import type { CoachPublicDto } from './coachBookingApi';

export const COACH_FILTER_DISCIPLINES = ['ALL', 'Gym', 'Boxing', 'Yoga'] as const;
export type CoachDisciplineFilter = (typeof COACH_FILTER_DISCIPLINES)[number];

const COACH_DISCIPLINE_PATTERNS: Record<'Gym' | 'Boxing' | 'Yoga', RegExp> = {
  Gym: /\bgym\b|fitness|cardio|strength|olympic|thể hình|tập tạ|sức mạnh|thể lực/i,
  Boxing: /boxing|kickfit|đấm bốc|võ|muay|combat/i,
  Yoga: /yoga|pilates|mindful|thiền|dẻo dai|stretch|giãn cơ|movement/i,
};

export function matchesCoachDiscipline(
  coach: Pick<CoachPublicDto, 'specialization'> & Partial<Pick<CoachPublicDto, 'bio' | 'certification'>>,
  filter: CoachDisciplineFilter,
): boolean {
  if (filter === 'ALL') return true;
  const pattern = COACH_DISCIPLINE_PATTERNS[filter];
  if (!pattern) return true;
  if (coach.specialization && pattern.test(coach.specialization)) {
    return true;
  }
  const isGenericSpec = !coach.specialization || /huấn luyện|coach|personal|trainer|pt|chuyên gia/i.test(coach.specialization);
  if (isGenericSpec && (pattern.test(coach.bio || '') || pattern.test(coach.certification || ''))) {
    return true;
  }
  return false;
}

export function formatCoachName(name?: string | null): string {
  if (!name) return 'Huấn luyện viên';
  return name.replace(/^HLV\s+/i, '').trim();
}

/** Buổi đã kết thúc theo giờ trung tâm (không phụ thuộc múi giờ của trình duyệt). */
export function isSessionCompleted(
  booking: { bookingDate: string; endTime: string; status?: string },
  now = centerNowParts(),
): boolean {
  if (booking.status === 'completed') return true;
  if (booking.status === 'cancelled') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.bookingDate) || !/^\d{2}:\d{2}/.test(booking.endTime)) return false;
  return `${booking.bookingDate} ${booking.endTime.slice(0, 5)}` <= `${now.date} ${now.time}`;
}
