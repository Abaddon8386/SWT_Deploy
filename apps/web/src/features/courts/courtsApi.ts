import { apiFetch, ApiError } from '../../shared/api/client';
import { DISCIPLINES } from '../../shared/lib/disciplines';

export const COURT_DISCIPLINES = DISCIPLINES.filter(item => ['tennis', 'badminton', 'swimming'].includes(item.id));
// Backend accepts only the canonical names, so aliases ("Tennis nâng cao") must not be offered as bookable.
export const isCourtDiscipline = (name: string) => COURT_DISCIPLINES.some(item => item.name === name.trim());
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
/** "YYYY-MM-DDTHH:mm" in the center's timezone, comparable as a string with a booking's date and time. */
export function centerDateTime(value = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(value);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
export const bookingEnded = (booking: Pick<CourtBooking, 'date' | 'endTime'>, now = centerDateTime()) => `${booking.date}T${shortTime(booking.endTime)}` <= now;
export function dateAfter(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export const shortTime = (time: string) => time.slice(0, 5);
export const displayDate = (date: string) => date.split('-').reverse().join('/');
export function courtError(error: unknown): string {
  const messages: Record<string, string> = {
    COURT_BOOKING_SLOT_TAKEN: 'Khung giờ vừa được đặt hoặc đang có lớp. Vui lòng chọn khung khác.',
    COURT_BOOKING_MEMBERSHIP_INVALID: 'Bạn chưa đăng ký gói tập hoặc gói tập không còn hiệu lực đến ngày đặt sân. Vui lòng đăng ký gói tập trước khi đặt sân.',
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
