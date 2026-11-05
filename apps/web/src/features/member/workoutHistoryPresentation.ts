import type { CheckinDto } from '../reception/checkinApi';
import { centerNowParts, parseCenterTime } from '../../shared/lib/centerTime';

export function monthRange(month: string) {
  const [year, number] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { fromDate: `${month}-01`, toDate: `${month}-${days}`, days, offset: (new Date(Date.UTC(year, number - 1, 1)).getUTCDay() + 6) % 7 };
}

export function workoutVisits(rows: CheckinDto[], month: string, now = new Date()) {
  return rows.flatMap(row => {
    const time = parseCenterTime(row.checkInTime);
    if (row.status.toUpperCase() !== 'GRANTED' || !time || time > now) return [];
    const day = centerNowParts(time).date;
    return day.startsWith(`${month}-`) ? [{ ...row, day, timestamp: time.getTime() }] : [];
  }).sort((a, b) => b.timestamp - a.timestamp || b.id - a.id);
}
