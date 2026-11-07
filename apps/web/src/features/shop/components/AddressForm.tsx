import { useSourceLanguage, sourceText } from '../shopI18n';
import { useId, useRef, useState, type FormEvent } from 'react';
import type { AddressRequest } from '../shopTypes';
import { RegionSelects } from './RegionSelects';

const VN_PHONE_REGEX = /^(0|\+84)(3|5|7|8|9)\d{8}$/;

export type AddressFieldErrorKey = 'recipientName' | 'phone' | 'provinceCode' | 'wardCode' | 'streetLine' | 'note';

function validateAddressRequest(
  value: AddressRequest,
): Partial<Record<AddressFieldErrorKey, string>> {
  const errors: Partial<Record<AddressFieldErrorKey, string>> = {};
  const name = value.recipientName.trim();
  const phone = value.phone.trim();
  const street = value.streetLine.trim();
  const note = (value.note ?? '').trim();

  if (name.length < 2 || name.length > 80) {
    errors.recipientName = 'Họ tên người nhận cần từ 2 đến 80 ký tự.';
  }
  if (!VN_PHONE_REGEX.test(phone)) {
    errors.phone = 'Số điện thoại di động Việt Nam không hợp lệ.';
  }
  if (!value.provinceCode) {
    errors.provinceCode = 'Vui lòng chọn Tỉnh / Thành phố.';
  }
  if (!value.wardCode) {
    errors.wardCode = 'Vui lòng chọn Phường / Xã.';
  }
  if (street.length < 5 || street.length > 200) {
    errors.streetLine = 'Địa chỉ số nhà, tên đường cần từ 5 đến 200 ký tự.';
  }
  if (note.length > 200) {
    errors.note = 'Ghi chú tối đa 200 ký tự.';
  }
  return errors;
}

export function AddressForm({
  initialValue,
  onSubmit,
  onCancel,
  busy = false,
  submitLabel = 'Lưu địa chỉ',
}: {
  initialValue?: Partial<AddressRequest>;
  onSubmit: (value: AddressRequest) => void | Promise<void>;
  onCancel?: () => void;
  busy?: boolean;
  submitLabel?: string;
}) {
  useSourceLanguage();
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);

  const [form, setForm] = useState<AddressRequest>({
    recipientName: initialValue?.recipientName ?? '',
    phone: initialValue?.phone ?? '',
    provinceCode: initialValue?.provinceCode ?? '',
    wardCode: initialValue?.wardCode ?? '',
    streetLine: initialValue?.streetLine ?? '',
    note: initialValue?.note ?? '',
    makeDefault: initialValue?.makeDefault ?? false,
  });

  const [errors, setErrors] = useState<Partial<Record<AddressFieldErrorKey, string>>>({});

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const nextErrors = validateAddressRequest(form);
    setErrors(nextErrors);

    const firstKey = (
      ['recipientName', 'phone', 'provinceCode', 'wardCode', 'streetLine', 'note'] as const
    ).find((k) => Boolean(nextErrors[k]));

    if (firstKey) {
      const target = formRef.current?.querySelector<HTMLElement>(`[data-field="${firstKey}"]`);
      target?.focus();
      return;
    }

    await onSubmit({
      recipientName: form.recipientName.trim(),
      phone: form.phone.trim(),
      provinceCode: form.provinceCode,
      wardCode: form.wardCode,
      streetLine: form.streetLine.trim(),
      note: form.note?.trim() ? form.note.trim() : null,
      makeDefault: form.makeDefault,
    });
  };

  return (
    <form ref={formRef} className="shop-address-form" onSubmit={handleSubmit} noValidate>
      <div className="shop-field">
        <label htmlFor={`${uid}-name`} className="shop-label portal-label">
          {sourceText("Họ tên người nhận")}</label>
        <input
          id={`${uid}-name`}
          name="recipientName"
          data-field="recipientName"
          type="text"
          className="shop-input portal-input"
          value={form.recipientName}
          disabled={busy}
          aria-invalid={errors.recipientName ? 'true' : undefined}
          onChange={(e) => setForm((prev) => ({ ...prev, recipientName: e.target.value }))}
        />
        {errors.recipientName && (
          <p className="form-error" role="alert">
            {sourceText(errors.recipientName)}
          </p>
        )}
      </div>

      <div className="shop-field">
        <label htmlFor={`${uid}-phone`} className="shop-label portal-label">
          {sourceText("Số điện thoại")}</label>
        <input
          id={`${uid}-phone`}
          name="phone"
          data-field="phone"
          type="tel"
          className="shop-input portal-input"
          value={form.phone}
          disabled={busy}
          aria-invalid={errors.phone ? 'true' : undefined}
          onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
        />
        {errors.phone && (
          <p className="form-error" role="alert">
            {sourceText(errors.phone)}
          </p>
        )}
      </div>

      <RegionSelects
        provinceCode={form.provinceCode}
        wardCode={form.wardCode}
        disabled={busy}
        errors={{ provinceCode: errors.provinceCode, wardCode: errors.wardCode }}
        onChange={({ provinceCode, wardCode }) =>
          setForm((prev) => ({ ...prev, provinceCode, wardCode }))
        }
      />

      <div className="shop-field">
        <label htmlFor={`${uid}-street`} className="shop-label portal-label">
          {sourceText("Số nhà, tên đường")}</label>
        <input
          id={`${uid}-street`}
          name="streetLine"
          data-field="streetLine"
          type="text"
          className="shop-input portal-input"
          value={form.streetLine}
          disabled={busy}
          aria-invalid={errors.streetLine ? 'true' : undefined}
          onChange={(e) => setForm((prev) => ({ ...prev, streetLine: e.target.value }))}
        />
        {errors.streetLine && (
          <p className="form-error" role="alert">
            {sourceText(errors.streetLine)}
          </p>
        )}
      </div>

      <div className="shop-field">
        <label htmlFor={`${uid}-note`} className="shop-label portal-label">
          {sourceText("Ghi chú giao hàng (tùy chọn)")}</label>
        <input
          id={`${uid}-note`}
          name="note"
          data-field="note"
          type="text"
          className="shop-input portal-input"
          value={form.note ?? ''}
          disabled={busy}
          aria-invalid={errors.note ? 'true' : undefined}
          onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
        />
        {errors.note && (
          <p className="form-error" role="alert">
            {sourceText(errors.note)}
          </p>
        )}
      </div>

      <label className="shop-checkbox">
        <input
          type="checkbox"
          checked={form.makeDefault}
          disabled={busy}
          onChange={(e) => setForm((prev) => ({ ...prev, makeDefault: e.target.checked }))}
        />
        <span>{sourceText("Đặt làm địa chỉ mặc định")}</span>
      </label>

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>
            {sourceText("Hủy")}</button>
        )}
        <button type="submit" className="btn-primary" disabled={busy}>
          {sourceText(submitLabel)}
        </button>
      </div>
    </form>
  );
}
