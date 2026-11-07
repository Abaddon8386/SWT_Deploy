import { useSourceLanguage, sourceText } from '../shopI18n';
import { useEffect, useId, useState } from 'react';
import { shopApi } from '../shopApi';
import type { GeoRegion } from '../shopTypes';

import { Select } from '../../../shared/ui/Select';
export function RegionSelects({
  provinceCode,
  wardCode,
  onChange,
  errors,
  disabled = false,
}: {
  provinceCode: string;
  wardCode: string;
  onChange: (next: { provinceCode: string; wardCode: string }) => void;
  errors?: { provinceCode?: string; wardCode?: string };
  disabled?: boolean;
}) {
  useSourceLanguage();
  const provinceId = useId();
  const wardId = useId();
  const [provinces, setProvinces] = useState<GeoRegion[]>([]);
  const [wards, setWards] = useState<GeoRegion[]>([]);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingProvinces(true);
    shopApi
      .listProvinces(controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) {
          setProvinces(Array.isArray(list) ? list : []);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setProvinces([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingProvinces(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!provinceCode) {
      setWards([]);
      return;
    }
    const controller = new AbortController();
    setLoadingWards(true);
    shopApi
      .listWards(provinceCode, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) {
          setWards(Array.isArray(list) ? list : []);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setWards([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingWards(false);
      });
    return () => controller.abort();
  }, [provinceCode]);

  return (
    <div className="shop-region-selects">
      <div className="shop-field">
        <label htmlFor={provinceId} className="shop-label portal-label">
          {sourceText("Tỉnh / Thành phố")}</label>
        <Select
          id={provinceId}
          name="provinceCode"
          data-field="provinceCode"
          className="shop-select portal-select"
          value={provinceCode}
          disabled={disabled || loadingProvinces}
          aria-invalid={errors?.provinceCode ? 'true' : undefined}
          onChange={(e) => onChange({ provinceCode: e.target.value, wardCode: '' })}
        >
          <option value="">{sourceText("Chọn Tỉnh / Thành phố")}</option>
          {provinces.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </Select>
        {errors?.provinceCode && (
          <p className="form-error" role="alert">
            {sourceText(errors.provinceCode)}
          </p>
        )}
      </div>

      <div className="shop-field">
        <label htmlFor={wardId} className="shop-label portal-label">
          {sourceText("Phường / Xã")}</label>
        <Select
          id={wardId}
          name="wardCode"
          data-field="wardCode"
          className="shop-select portal-select"
          value={wardCode}
          disabled={disabled || !provinceCode || loadingWards}
          aria-invalid={errors?.wardCode ? 'true' : undefined}
          onChange={(e) => onChange({ provinceCode, wardCode: e.target.value })}
        >
          <option value="">{sourceText("Chọn Phường / Xã")}</option>
          {wards.map((w) => (
            <option key={w.code} value={w.code}>
              {w.name}
            </option>
          ))}
        </Select>
        {errors?.wardCode && (
          <p className="form-error" role="alert">
            {sourceText(errors.wardCode)}
          </p>
        )}
      </div>
    </div>
  );
}
