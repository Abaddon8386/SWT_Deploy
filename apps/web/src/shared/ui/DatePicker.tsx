import React, { useEffect, useMemo, useRef, useState } from 'react';
import './datepicker.css';

export interface DatePickerProps {
  id?: string;
  value: string; // YYYY-MM-DD
  onChange: (e: { target: { value: string } }) => void;
  min?: string; // YYYY-MM-DD
  max?: string; // YYYY-MM-DD
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  disabled = false,
  required = false,
  placeholder = 'Chọn ngày...',
  className = '',
  style,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial year & month from value or today
  const initialDate = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      return { year: y, month: m - 1, day: d };
    }
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth(), day: today.getDate() };
  }, [value]);

  const [viewYear, setViewYear] = useState(initialDate.year);
  const [viewMonth, setViewMonth] = useState(initialDate.month);

  // Sync view when value changes from outside
  useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split('-').map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }, [value]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        containerRef.current?.querySelector<HTMLButtonElement>('.luxury-datepicker-trigger')?.focus();
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Format display text (DD/MM/YYYY)
  const displayLabel = useMemo(() => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }, [value]);

  // Navigation handlers
  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Build calendar grid days
  const calendarDays = useMemo(() => {
    const days: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isDisabled: boolean;
      isSelected: boolean;
      isToday: boolean;
    }> = [];

    const todayObj = new Date();
    const todayStr = `${todayObj.getFullYear()}-${pad2(todayObj.getMonth() + 1)}-${pad2(todayObj.getDate())}`;

    // First day of current month (0: Sunday, 1: Monday, ... 6: Saturday)
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    // Adjust to Monday-first (Monday = 0, Sunday = 6)
    const shift = (firstDayIndex + 6) % 7;

    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    // Previous month overflow days
    for (let i = shift - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${prevYear}-${pad2(prevMonth + 1)}-${pad2(dayNum)}`;
      const isDisabled = (min && dateStr < min) || (max && dateStr > max);
      days.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        isDisabled: !!isDisabled,
        isSelected: dateStr === value,
        isToday: dateStr === todayStr,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dateStr = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(d)}`;
      const isDisabled = (min && dateStr < min) || (max && dateStr > max);
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        isDisabled: !!isDisabled,
        isSelected: dateStr === value,
        isToday: dateStr === todayStr,
      });
    }

    // Next month fill days (up to multiple of 7, usually 35 or 42)
    const totalSlots = days.length <= 35 ? 35 : 42;
    const remaining = totalSlots - days.length;
    for (let d = 1; d <= remaining; d++) {
      const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = `${nextYear}-${pad2(nextMonth + 1)}-${pad2(d)}`;
      const isDisabled = (min && dateStr < min) || (max && dateStr > max);
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: false,
        isDisabled: !!isDisabled,
        isSelected: dateStr === value,
        isToday: dateStr === todayStr,
      });
    }

    return days;
  }, [viewYear, viewMonth, value, min, max]);

  const handleSelectDate = (dateStr: string, isDisabled: boolean) => {
    if (isDisabled || disabled) return;
    onChange({ target: { value: dateStr } });
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({ target: { value: '' } });
    setIsOpen(false);
  };

  const handleToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const todayObj = new Date();
    const todayStr = `${todayObj.getFullYear()}-${pad2(todayObj.getMonth() + 1)}-${pad2(todayObj.getDate())}`;
    if (min && todayStr < min) return;
    if (max && todayStr > max) return;
    setViewYear(todayObj.getFullYear());
    setViewMonth(todayObj.getMonth());
    onChange({ target: { value: todayStr } });
    setIsOpen(false);
  };

  return (
    <div className={`luxury-datepicker-wrap ${className}`} ref={containerRef} style={style}>
      <input
        type="hidden"
        name={id}
        value={value}
        min={min}
        max={max}
        readOnly
      />
      <button
        id={id}
        type="button"
        className={`luxury-datepicker-trigger ${isOpen ? 'is-open' : ''}`}
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className={`luxury-datepicker-value ${!displayLabel ? 'luxury-datepicker-placeholder' : ''}`}>
          {displayLabel || placeholder}
        </span>
        <span className="luxury-datepicker-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </span>
      </button>

      {/* Hidden input for form validation if required */}
      {required && (
        <input
          tabIndex={-1}
          required={required}
          value={value}
          onChange={() => {}}
          onInvalid={(event) => {
            event.preventDefault();
            setIsOpen(true);
            containerRef.current?.querySelector<HTMLButtonElement>('.luxury-datepicker-trigger')?.focus();
          }}
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
        />
      )}

      {isOpen && (
        <div className="luxury-datepicker-popover" role="dialog" aria-label="Chọn ngày">
          <div className="ldp-header">
            <span className="ldp-title">
              Tháng {viewMonth + 1}, {viewYear}
            </span>
            <div className="ldp-nav-btns">
              <button
                type="button"
                className="ldp-nav-btn"
                onClick={handlePrevMonth}
                aria-label="Tháng trước"
              >
                ‹
              </button>
              <button
                type="button"
                className="ldp-nav-btn"
                onClick={handleNextMonth}
                aria-label="Tháng sau"
              >
                ›
              </button>
            </div>
          </div>

          <div className="ldp-weekdays">
            {WEEKDAYS.map((wd) => (
              <span key={wd} className="ldp-weekday">
                {wd}
              </span>
            ))}
          </div>

          <div className="ldp-days-grid">
            {calendarDays.map((d, index) => {
              const classNames = [
                'ldp-day-cell',
                d.isCurrentMonth ? 'is-current-month' : 'is-other-month',
                d.isSelected ? 'is-selected' : '',
                d.isToday ? 'is-today' : '',
                d.isDisabled ? 'is-disabled' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <button
                  key={`${d.dateStr}-${index}`}
                  type="button"
                  className={classNames}
                  disabled={d.isDisabled}
                  aria-label={d.dateStr}
                  aria-pressed={d.isSelected}
                  aria-current={d.isToday ? 'date' : undefined}
                  onClick={() => handleSelectDate(d.dateStr, d.isDisabled)}
                >
                  {d.dayNum}
                </button>
              );
            })}
          </div>

          <div className="ldp-footer">
            <button type="button" className="ldp-action-btn btn-clear" onClick={handleClear}>
              Xóa ngày
            </button>
            <button type="button" className="ldp-action-btn" onClick={handleToday}>
              Hôm nay
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
