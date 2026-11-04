import { expandRecurrence, isoWeekday, WEEKDAY_LABELS, type RecurrenceChoice, type RecurrencePeriod, type SkippedOccurrence } from '../lib/recurrence';

const PERIODS: { id: RecurrencePeriod; label: string; legacyLabel: string }[] = [
  { id: 'once', label: 'Một buổi', legacyLabel: 'Chỉ ngày này' },
  { id: 'week', label: 'Hàng tuần', legacyLabel: 'Cả tuần' },
  { id: 'month', label: 'Hàng tháng', legacyLabel: 'Cả tháng' },
];

const FULL_WEEKDAY_NAMES: Record<number, string> = {
  1: 'thứ Hai',
  2: 'thứ Ba',
  3: 'thứ Tư',
  4: 'thứ Năm',
  5: 'thứ Sáu',
  6: 'thứ Bảy',
  7: 'Chủ Nhật',
};

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

  const selectedDayNames = value.days.map((d) => FULL_WEEKDAY_NAMES[d] || `T${d}`).join(', ');
  const projectedCount = value.period === 'week' ? dates.length * 4 : dates.length;

  return (
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-paper, #201b17)', marginBottom: 10, padding: 0 }}>
        Tần suất buổi tập
      </legend>
      <div
        role="group"
        aria-label="Kỳ hạn đặt lịch"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          padding: 4,
          background: 'var(--portal-surface-subtle, #edf1f5)',
          borderRadius: 9999,
          maxWidth: '100%',
          flexWrap: 'wrap',
        }}
      >
        {PERIODS.map((period) => {
          const active = value.period === period.id;
          return (
            <button
              key={period.id}
              type="button"
              className={active ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
              aria-pressed={active}
              aria-label={`${period.legacyLabel} (${period.label})`}
              onClick={() => choosePeriod(period.id)}
              style={{
                border: 'none',
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: active ? 700 : 500,
                padding: '7px 18px',
                borderRadius: 9999,
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all 160ms ease',
                background: active ? 'var(--portal-salmon, #c86b43)' : 'transparent',
                color: active ? '#ffffff' : 'var(--portal-paper, #201b17)',
                boxShadow: active ? '0 2px 6px rgba(184, 84, 51, 0.25)' : 'none',
              }}
            >
              {period.label}
              <span
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  padding: 0,
                  margin: -1,
                  overflow: 'hidden',
                  clip: 'rect(0, 0, 0, 0)',
                  whiteSpace: 'nowrap',
                  border: 0,
                }}
              >
                {' '}{period.legacyLabel}
              </span>
            </button>
          );
        })}
      </div>
      {value.period !== 'once' && (
        <>
          <div role="group" aria-label="Thứ trong tuần" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
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
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    border: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    fontWeight: active ? 700 : 600,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    transition: 'all 160ms ease',
                    background: active ? 'var(--portal-salmon, #c86b43)' : '#edf1f5',
                    color: active ? '#ffffff' : '#2e384d',
                    boxShadow: active ? '0 2px 6px rgba(184, 84, 51, 0.25)' : 'none',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div role="status" style={{ marginTop: 14, fontSize: 14, fontWeight: 700, color: 'var(--portal-paper, #201b17)', lineHeight: 1.4 }}>
            {dates.length ? (
              <>
                Lặp lại vào {selectedDayNames} {value.period === 'week' ? 'hàng tuần' : 'hàng tháng'} (Dự kiến: {projectedCount} buổi/tháng)
              </>
            ) : (
              'Không có ngày nào trong khoảng đã chọn.'
            )}
            <span
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: 'hidden',
                clip: 'rect(0, 0, 0, 0)',
                whiteSpace: 'nowrap',
                border: 0,
              }}
            >
              {dates.length
                ? ` Sẽ đặt ${dates.length} buổi: ${dates.map(shortDate).join(', ')}.`
                : ' Không có ngày nào trong khoảng đã chọn.'}
            </span>
          </div>
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              borderRadius: 14,
              background: '#fdf2eb',
              border: '1px solid rgba(200, 107, 67, 0.15)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#b85433"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0, marginTop: 1 }}
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <div style={{ fontSize: 13, lineHeight: 1.45, color: '#201b17' }}>
              <strong>Lưu ý:</strong> {hint || 'Các buổi tập được đặt cùng lúc cho những ngày đã chọn. Bạn có thể hủy từng buổi trước giờ tập theo quy định của trung tâm.'}
            </div>
          </div>
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
