import { useI18n } from '../i18n';
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
  /** Allowed periods to choose from. Defaults to ['once', 'week', 'month']. */
  allowedPeriods?: RecurrencePeriod[];
}

/** Lets a member repeat one booking over a week or a month on chosen weekdays instead of booking day by day. */
export function RecurrenceFields({ startDate, value, onChange, disabled = false, hint, allowedPeriods }: FieldsProps) {
  const { t, lang } = useI18n();
  const visiblePeriods = allowedPeriods ? PERIODS.filter((p) => allowedPeriods.includes(p.id)) : PERIODS;
  const activeDays = value.period !== 'once' && value.days.length === 0 ? [isoWeekday(startDate)] : value.days;
  const effectiveValue: RecurrenceChoice = { ...value, days: activeDays };
  const dates = expandRecurrence(startDate, effectiveValue);
  const choosePeriod = (period: RecurrencePeriod) => {
    if (allowedPeriods && !allowedPeriods.includes(period)) return;
    onChange({
      period,
      days: period === 'once' ? [] : value.days.length ? value.days : [isoWeekday(startDate)],
    });
  };
  const toggleDay = (day: number) => {
    const currentDays = value.days.length ? value.days : [isoWeekday(startDate)];
    const nextDays = currentDays.includes(day)
      ? currentDays.filter((item) => item !== day)
      : [...currentDays, day].sort();
    // Keep the preview and recurrenceRequest on the selected start weekday.
    onChange({ ...value, days: nextDays.length ? nextDays : [isoWeekday(startDate)] });
  };

  const selectedDayNames = activeDays.map((d) => t(FULL_WEEKDAY_NAMES[d] || '') || `T${d}`).join(', ');
  const projectedCount = value.period === 'week' ? dates.length * 4 : dates.length;

  return (
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-paper)', marginBottom: 10, padding: 0 }}>
        {t("Tần suất buổi tập", "Session frequency")}</legend>
      <div
        role="group"
        aria-label={t("Kỳ hạn đặt lịch", "Booking frequency")}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          padding: 4,
          background: 'var(--portal-raised)',
          borderRadius: 9999,
          maxWidth: '100%',
          flexWrap: 'wrap',
        }}
      >
        {visiblePeriods.map((period) => {
          const active = value.period === period.id;
          return (
            <button
              key={period.id}
              type="button"
              className={active ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
              aria-pressed={active}
              aria-label={`${t(period.legacyLabel)} (${t(period.label)})`}
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
                background: active ? 'var(--portal-salmon)' : 'transparent',
                color: active ? 'var(--portal-on-accent)' : 'var(--portal-paper)',
                boxShadow: active ? '0 2px 6px color-mix(in srgb, var(--portal-salmon) 25%, transparent)' : 'none',
              }}
            >
              {t(period.label)}
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
                {' '}{t(period.legacyLabel)}
              </span>
            </button>
          );
        })}
      </div>
      {value.period !== 'once' && (
        <>
          <div role="group" aria-label={t("Thứ trong tuần", "Weekdays")} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            {(lang === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : WEEKDAY_LABELS).map((label, index) => {
              const day = index + 1;
              const active = activeDays.includes(day);
              return (
                <button
                  key={label}
                  type="button"
                  className={active ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                  aria-pressed={active}
                  aria-label={`${label}${active ? t(", đã chọn", ", selected") : ''}`}
                  onClick={() => toggleDay(day)}
                  style={{
                    width: 38,
                    height: 38,
                    padding: 0,
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
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
                    background: active ? 'var(--portal-salmon)' : 'var(--portal-raised)',
                    color: active ? 'var(--portal-on-accent)' : 'var(--portal-paper)',
                    boxShadow: active ? '0 2px 6px color-mix(in srgb, var(--portal-salmon) 25%, transparent)' : 'none',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div role="status" style={{ marginTop: 14, fontSize: 14, fontWeight: 700, color: 'var(--portal-paper)', lineHeight: 1.4 }}>
            {dates.length ? (
              <>
                {t(`Lặp lại vào ${selectedDayNames} ${value.period === 'week' ? 'hàng tuần' : 'hàng tháng'} (Dự kiến: ${projectedCount} buổi/tháng)`, `Repeats on ${selectedDayNames} ${value.period === 'week' ? 'weekly' : 'monthly'} (Estimated: ${projectedCount} sessions/month)`)}</>
            ) : (
              t("Không có ngày nào trong khoảng đã chọn.", "No dates in the selected range.")
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
                ? t(` Sẽ đặt ${dates.length} buổi: ${dates.map(shortDate).join(', ')}.`, ` ${dates.length} sessions will be booked: ${dates.map(shortDate).join(', ')}.`)
                : t(' Không có ngày nào trong khoảng đã chọn.', ' No dates in the selected range.')}
            </span>
          </div>
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              borderRadius: 14,
              background: 'var(--portal-tint)',
              border: '1px solid var(--portal-border)',
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
              stroke="currentColor"
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
            <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--portal-paper)' }}>
              <strong>{t("Lưu ý:", "Note:")}</strong> {hint || t("Các buổi tập được đặt cùng lúc cho những ngày đã chọn. Bạn có thể hủy từng buổi trước giờ tập theo quy định của trung tâm.", "Sessions are booked together for the selected dates. You can cancel individual sessions before they start, according to center policy.")}
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
  const { t } = useI18n();
  return (
    <div role="status" style={{ display: 'grid', gap: 10 }}>
      <p style={{ margin: 0 }}>
        {booked.length > 0
          ? <>{t("Đã đặt", "Booked")} <strong>{booked.length}</strong> {t("buổi", "sessions")}{skipped.length > 0 ? t(`, bỏ qua ${skipped.length} buổi.`, `, ${skipped.length} sessions skipped.`) : '.'}</>
          : <strong>{t("Không đặt được buổi nào.", "No sessions could be booked.")}</strong>}
      </p>
      {booked.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {booked.map((item, index) => <li key={index}>{describe(item)}</li>)}
        </ul>
      )}
      {skipped.length > 0 && (
        <div className="portal-alert">
          <strong>{t("Các buổi chưa đặt được:", "Sessions not booked:")}</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {skipped.map((item) => <li key={item.date}>{shortDate(item.date)}: {item.message || item.code}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
