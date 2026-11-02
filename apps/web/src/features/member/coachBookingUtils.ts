export function formatCoachName(name?: string | null): string {
  if (!name) return 'Huấn luyện viên';
  return name.replace(/^HLV\s+/i, '').trim();
}

export function isSessionCompleted(booking: { bookingDate: string; endTime: string; status?: string }): boolean {
  if (booking.status === 'completed') return true;
  if (booking.status === 'cancelled') return false;
  const timeStr = booking.endTime.length === 5 ? `${booking.endTime}:00` : booking.endTime;
  const sessionEnd = new Date(`${booking.bookingDate}T${timeStr}`);
  if (isNaN(sessionEnd.getTime())) return false;
  return Date.now() >= sessionEnd.getTime();
}

