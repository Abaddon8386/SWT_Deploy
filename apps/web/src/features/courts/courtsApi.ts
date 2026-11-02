import { apiFetch, ApiError } from '../../shared/api/client';
import { DISCIPLINES, matchesDiscipline } from '../../shared/lib/disciplines';

export const COURT_DISCIPLINES = DISCIPLINES.filter(item => ['tennis', 'badminton', 'swimming'].includes(item.id));
export const isCourtDiscipline = (name: string) => COURT_DISCIPLINES.some(item => matchesDiscipline(name, item.name));
export interface Court {
  id: number; name: string; location: string | null; disciplineId: number; disciplineName: string;
  openTime: string; closeTime: string;
}
export interface CourtSlot { startTime: string; endTime: string; status: 'free' | 'booked' | 'class' | 'past' }
export interface CourtBooking {
  id: number; roomId: number; roomName: string; disciplineName: string; memberId: number; memberName: string;
  date: string; startTime: string; endTime: string; status: 'booked' | 'cancelled'; createdAt: string;
  cancelledAt: string | null; cancelReason: string | null; canCancel: boolean;
}
export interface BookingPage { content: CourtBooking[]; number: number; totalPages: number; totalElements: number }
export interface BookCourtRequest { roomId: number; date: string; startTime: string }
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });
export const courtsApi = {
  courts: (discipline = '') => apiFetch<Court[]>(`/courts${discipline ? `?discipline=${encodeURIComponent(discipline)}` : ''}`),
  availability: (id: number, date: string) => apiFetch<CourtSlot[]>(`/courts/${id}/availability?date=${date}`),
  book: (body: BookCourtRequest) => apiFetch<CourtBooking>('/court-bookings', json('POST', body)),
  my: (page = 0) => apiFetch<BookingPage>(`/court-bookings/my?page=${page}&size=20`),
  list: (date: string, roomId = '', page = 0) => apiFetch<BookingPage>(`/court-bookings?date=${date}&page=${page}&size=20${roomId ? `&roomId=${encodeURIComponent(roomId)}` : ''}`),
  cancel: (id: number, reason = '') => apiFetch<CourtBooking>(`/court-bookings/${id}/cancel`, json('PATCH', { reason: reason.trim() || null })),
};
export function centerDate(value = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function dateAfter(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export const shortTime = (time: string) => time.slice(0, 5);
export const displayDate = (date: string) => date.split('-').reverse().join('/');
export function courtError(error: unknown): string {
  const messages: Record<string, string> = {
    COURT_BOOKING_SLOT_TAKEN: 'Khung giờ vừa được đặt hoặc đang có lớp. Vui lòng chọn khung khác.',
    COURT_BOOKING_MEMBERSHIP_INVALID: 'Bạn cần gói tập đang hoạt động và còn hạn đến ngày đặt sân.',
    COURT_BOOKING_PAST_SLOT: 'Khung giờ đã qua. Vui lòng chọn khung khác.',
    COURT_BOOKING_TOO_FAR: 'Bạn chỉ có thể đặt trước tối đa 7 ngày.',
    COURT_BOOKING_LIMIT_REACHED: 'Bạn đã có đủ 2 lượt đặt trong ngày này.',
    COURT_BOOKING_COURT_UNAVAILABLE: 'Sân hiện không hoạt động. Vui lòng chọn sân khác.',
    COURT_BOOKING_CANCEL_TOO_LATE: 'Chỉ có thể hủy trước giờ bắt đầu ít nhất 2 giờ.',
    COURT_BOOKING_NOT_FOUND: 'Không tìm thấy lượt đặt sân.',
    COURT_BOOKING_FORBIDDEN: 'Bạn không có quyền thay đổi lượt đặt này.',
    COURT_BOOKING_INVALID_SLOT: 'Khung giờ không hợp lệ. Vui lòng tải lại lịch sân.',
    COURT_BOOKING_INVALID_COURT: 'Phòng chưa được cấu hình để đặt sân.',
  };
  return error instanceof ApiError && error.code && messages[error.code] ? messages[error.code]
    : error instanceof Error ? error.message : 'Không thể tải dữ liệu. Vui lòng thử lại.';
}
