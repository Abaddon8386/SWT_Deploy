import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/language';
import { popoverPlacement, type PopoverPlacement } from './popoverPlacement';
import './timepicker.css';

export interface TimePickerProps {
  id?: string;
  value: string; // HH:mm (e.g. '08:00')
  onChange: (e: { target: { value: string } }) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Chỉ cho chọn giờ chẵn (phút luôn là 00), ẩn cột phút. */
  wholeHour?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => (i < 10 ? `0${i}` : `${i}`));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function TimePicker({
  id,
  value,
  onChange,
  disabled = false,
  required = false,
  placeholder,
  className = '',
  style,
  wholeHour = false,
}: TimePickerProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<PopoverPlacement>({ v: 'down', h: 'left' });
  const triggerPlaceholder = placeholder ?? t('Chọn giờ...', 'Select time...');
  const containerRef = useRef<HTMLDivElement>(null);
  const hourScrollRef = useRef<HTMLDivElement>(null);
  const minuteScrollRef = useRef<HTMLDivElement>(null);

  // Parse current hour and minute
  const { hour, minute } = useMemo(() => {
    if (value && /^\d{1,2}:\d{2}$/.test(value)) {
      const parts = value.split(':');
      const h = parts[0].padStart(2, '0');
      const m = parts[1];
      return { hour: h, minute: m };
    }
    return { hour: '08', minute: '00' };
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
        containerRef.current?.querySelector<HTMLButtonElement>('.luxury-timepicker-trigger')?.focus();
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Auto scroll active item into view when popover opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        const activeHour = hourScrollRef.current?.querySelector('.is-active');
        if (activeHour) activeHour.scrollIntoView({ block: 'nearest' });
        const activeMinute = minuteScrollRef.current?.querySelector('.is-active');
        if (activeMinute) activeMinute.scrollIntoView({ block: 'nearest' });
      }, 50);
    }
  }, [isOpen]);

  // Lật lên / căn phải khi thiếu chỗ
  useLayoutEffect(() => {
    if (!isOpen) return;
    const trigger = containerRef.current?.querySelector<HTMLElement>('.luxury-timepicker-trigger');
    if (trigger) setPlacement(popoverPlacement(trigger, 252, 330));
  }, [isOpen]);

  const handleSelectHour = (h: string) => {
    const newVal = `${h}:${wholeHour ? '00' : minute}`;
    onChange({ target: { value: newVal } });
  };

  const handleSelectMinute = (m: string) => {
    const newVal = `${hour}:${m}`;
    onChange({ target: { value: newVal } });
  };

  return (
    <div className={`luxury-timepicker-wrap ${className}`} ref={containerRef} style={style}>
      <button
        id={id}
        type="button"
        className={`luxury-timepicker-trigger ${isOpen ? 'is-open' : ''}`}
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className={`luxury-timepicker-value ${!value ? 'luxury-timepicker-placeholder' : ''}`}>
          {value || triggerPlaceholder}
        </span>
        <span className="luxury-timepicker-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
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
            containerRef.current?.querySelector<HTMLButtonElement>('.luxury-timepicker-trigger')?.focus();
          }}
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
        />
      )}

      {isOpen && (
        <div
          className={`luxury-timepicker-popover luxury-timepicker-popover--${placement.v} luxury-timepicker-popover--${placement.h}`}
          role="dialog"
          aria-label={t('Chọn giờ', 'Select time')}
        >
          <div className="ltp-header">
            <span className="ltp-title">{t('Khung giờ', 'Time')}</span>
            <span className="ltp-preview-badge">
              {hour}:{wholeHour ? '00' : minute}
            </span>
          </div>

          <div className="ltp-columns">
            <div className="ltp-col">
              <span className="ltp-col-label">{t('Giờ', 'Hour')}</span>
              <div className="ltp-col-scroll" ref={hourScrollRef}>
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className={`ltp-item-btn ${h === hour ? 'is-active' : ''}`}
                    onClick={() => handleSelectHour(h)}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            {!wholeHour && <div className="ltp-col">
              <span className="ltp-col-label">{t('Phút', 'Min')}</span>
              <div className="ltp-col-scroll" ref={minuteScrollRef}>
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`ltp-item-btn ${m === minute ? 'is-active' : ''}`}
                    onClick={() => handleSelectMinute(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>}
          </div>

          <div className="ltp-footer">
            <button
              type="button"
              className="ltp-done-btn"
              onClick={() => setIsOpen(false)}
            >
              {t('Xong', 'Done')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
