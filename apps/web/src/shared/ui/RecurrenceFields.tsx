import { expandRecurrence, isoWeekday, WEEKDAY_LABELS, type RecurrenceChoice, type RecurrencePeriod, type SkippedOccurrence } from '../lib/recurrence';

const PERIODS: { id: RecurrencePeriod; label: string }[] = [
  { id: 'once', label: 'Chỉ ngày này' },
  { id: 'week', label: 'Cả tuần' },
  { id: 'month', label: 'Cả tháng' },
];

const shortDate = (date: string) => date.split('-').reverse().slice(0, 2).join('/');

interface FieldsProps {
  /** First date of the standing booking, YYYY-MM-DD. */
  startDate: string;
  value: RecurrenceChoice;
  onChange: (value: RecurrenceChoice) => void;
  disabled?: boolean;
  /** Upper bound the booking rules allow, shown as a hint; dates beyond it are reported as skipped by the server. */
  hint?: string;
}

/** Lets a member repeat one booking over a week or a month on chosen weekdays instead of booking day by day. */
export function RecurrenceFields({ startDate, value, onChange, disabled = false, hint }: FieldsProps) {
  const dates = expandRecurrence(startDate, value);
  const choosePeriod = (period: RecurrencePeriod) => onChange({
    period,
    days: period === 'once' ? [] : value.days.length ? value.days : [isoWeekday(startDate)],
  });
  const toggleDay = (day: number) => {
    const days = value.days.includes(day) ? value.days.filter((item) => item !== day) : [...value.days, day].sort();
    onChange({ ...value, days: days.length ? days : [isoWeekday(startDate)] });
  };

  return (
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend className="portal-label">Lặp lại</legend>
      <div role="group" aria-label="Kỳ hạn đặt lịch" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PERIODS.map((period) => (
          <button
            key={period.id}
            type="button"
            className={value.period === period.id ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
            aria-pressed={value.period === period.id}
            onClick={() => choosePeriod(period.id)}
          >
            {period.label}
          </button>
        ))}
      </div>
      {value.period !== 'once' && (
        <>
          <div role="group" aria-label="Thứ trong tuần" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {WEEKDAY_LABELS.map((label, index) => {
              const day = index + 1;
              const active = value.days.includes(day);
              return (
                <button
                  key={label}
                  type="button"
                  className={active ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                  aria-pressed={active}
                  aria-label={`${label}${active ? ', đã chọn' : ''}`}
                  onClick={() => toggleDay(day)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="muted" role="status" style={{ marginTop: 8 }}>
            {dates.length
              ? `Sẽ đặt ${dates.length} buổi: ${dates.map(shortDate).join(', ')}.`
              : 'Không có ngày nào trong khoảng đã chọn.'}
          </p>
          {hint && <p className="muted">{hint}</p>}
        </>
      )}
    </fieldset>
  );
}

interface SummaryProps<T> {
  booked: T[];
  skipped: SkippedOccurrence[];
  /** Short text for one created booking, e.g. its date and time. */
  describe: (item: T) => string;
}

/** Outcome of a standing booking: what was created and why other dates were skipped. */
export function RecurrenceSummary<T>({ booked, skipped, describe }: SummaryProps<T>) {
  return (
    <div role="status" style={{ display: 'grid', gap: 10 }}>
      <p style={{ margin: 0 }}>
        {booked.length > 0
          ? <>Đã đặt <strong>{booked.length}</strong> buổi{skipped.length > 0 ? `, bỏ qua ${skipped.length} buổi.` : '.'}</>
          : <strong>Không đặt được buổi nào.</strong>}
      </p>
      {booked.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {booked.map((item, index) => <li key={index}>{describe(item)}</li>)}
        </ul>
      )}
      {skipped.length > 0 && (
        <div className="portal-alert">
          <strong>Các buổi chưa đặt được:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {skipped.map((item) => <li key={item.date}>{shortDate(item.date)}: {item.message || item.code}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
