import { apiFetch } from '../../shared/api/client';
import { centerNowParts } from '../../shared/lib/centerTime';

export interface MemberSubscription {
  id: number;
  memberId: number;
  packageId: number;
  packageName: string;
  previousSubscriptionId: number | null;
  startDate: string;
  endDate: string;
  paidThroughDate?: string | null;
  status: string;
  qrCode: string | null;
  createdAt: string;
}

export interface BookedClass {
  id: number;
  classId: number;
  className: string;
  coachName: string | null;
  roomName: string | null;
  sessionDate: string | null;
  startTime: string | null;
  endTime: string | null;
  status: string;
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
}

interface SessionBookingRecord {
  id: number;
  sessionId?: number;
  classId: number;
  className: string;
  coachName: string | null;
  roomName: string | null;
  sessionDate: string | null;
  startTime: string | null;
  endTime: string | null;
  status: string;
  bookedAt?: string;
  createdAt?: string;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export const getCurrentMembership = () =>
  apiFetch<MemberSubscription | null>('/memberships/subscriptions/my');

export const getBookedEnrollments = async (): Promise<BookedClass[]> => {
  const today = centerNowParts().date;
  const [enrollments, sessionBookings] = await Promise.all([
    apiFetch<BookedClass[]>('/classes/enrollments/my?status=booked&upcoming=true'),
    apiFetch<SessionBookingRecord[]>(
      `/classes/session-bookings/my?status=booked&from=${today}`,
    ).catch(() => [] as SessionBookingRecord[]),
  ]);

  const baseList = Array.isArray(enrollments) ? enrollments : [];
  const seenKeys = new Set<string>(
    baseList.map(
      (item) => `${item.classId}|${item.sessionDate ?? ''}|${item.startTime ?? ''}`,
    ),
  );
  const merged: BookedClass[] = [...baseList];

  if (Array.isArray(sessionBookings)) {
    for (const b of sessionBookings) {
      if (!b || b.status?.toLowerCase() !== 'booked') continue;
      if (b.sessionDate && b.sessionDate < today && b.sessionId != null) continue;
      const key = `${b.classId}|${b.sessionDate ?? ''}|${b.startTime ?? ''}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      merged.push({
        id: b.id,
        classId: b.classId,
        className: b.className,
        coachName: b.coachName ?? null,
        roomName: b.roomName ?? null,
        sessionDate: b.sessionDate ?? null,
        startTime: b.startTime ?? null,
        endTime: b.endTime ?? null,
        status: b.status,
        createdAt: b.bookedAt ?? b.createdAt ?? '',
        cancelledAt: b.cancelledAt ?? null,
        cancelReason: b.cancelReason ?? null,
      });
    }
  }

  return merged;
};
