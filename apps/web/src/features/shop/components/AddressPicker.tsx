import { useId } from 'react';
import type { AddressDto, AddressRequest } from '../shopTypes';
import { RegionSelects } from './RegionSelects';

export function AddressPicker({
  addresses,
  selectedId,
  onSelect,
  newAddress,
  onNewAddressChange,
  saveAddress,
  onSaveAddressChange,
  errors,
}: {
  addresses: AddressDto[];
  selectedId: number | 'new';
  onSelect: (id: number | 'new') => void;
  newAddress: AddressRequest;
  onNewAddressChange: (next: AddressRequest) => void;
  saveAddress: boolean;
  onSaveAddressChange: (save: boolean) => void;
  errors?: Partial<Record<string, string>>;
}) {
  const uid = useId();
  const groupName = `${uid}-addr`;
  const showNewForm = selectedId === 'new' || addresses.length === 0;

  return (
    <div className="shop-address-picker">
      {addresses.map((addr) => {
        const selected = selectedId === addr.id;
        return (
          <label
            key={addr.id}
            className={`shop-address-option${selected ? ' is-selected' : ''}`}
          >
            <input
              type="radio"
              name={groupName}
              checked={selected}
              onChange={() => onSelect(addr.id)}
            />
            <div>
              <div>
                <strong>{addr.recipientName}</strong> · {addr.phone}
                {addr.isDefault && <span> · Mặc định</span>}
              </div>
              <div>
                {addr.streetLine}, {addr.wardName}, {addr.provinceName}
              </div>
              {addr.note && <div>{addr.note}</div>}
            </div>
          </label>
        );
      })}

      {addresses.length > 0 && (
        <label className={`shop-address-option${selectedId === 'new' ? ' is-selected' : ''}`}>
          <input
            type="radio"
            name={groupName}
            checked={selectedId === 'new'}
            onChange={() => onSelect('new')}
          />
          <span>+ Thêm địa chỉ mới</span>
        </label>
      )}

      {showNewForm && (
        <div className="shop-address-form">
          <div className="shop-field">
            <label htmlFor={`${uid}-name`} className="shop-label portal-label">
              Họ tên người nhận
            </label>
            <input
              id={`${uid}-name`}
              name="recipientName"
              data-field="recipientName"
              type="text"
              className="shop-input portal-input"
              value={newAddress.recipientName}
              aria-invalid={errors?.recipientName ? 'true' : undefined}
              onChange={(e) =>
                onNewAddressChange({ ...newAddress, recipientName: e.target.value })
              }
            />
            {errors?.recipientName && (
              <p className="form-error" role="alert">
                {errors.recipientName}
              </p>
            )}
          </div>

          <div className="shop-field">
            <label htmlFor={`${uid}-phone`} className="shop-label portal-label">
              Số điện thoại
            </label>
            <input
              id={`${uid}-phone`}
              name="phone"
              data-field="phone"
              type="tel"
              className="shop-input portal-input"
              value={newAddress.phone}
              aria-invalid={errors?.phone ? 'true' : undefined}
              onChange={(e) => onNewAddressChange({ ...newAddress, phone: e.target.value })}
            />
            {errors?.phone && (
              <p className="form-error" role="alert">
                {errors.phone}
              </p>
            )}
          </div>

          <RegionSelects
            provinceCode={newAddress.provinceCode}
            wardCode={newAddress.wardCode}
            errors={{ provinceCode: errors?.provinceCode, wardCode: errors?.wardCode }}
            onChange={({ provinceCode, wardCode }) =>
              onNewAddressChange({ ...newAddress, provinceCode, wardCode })
            }
          />

          <div className="shop-field">
            <label htmlFor={`${uid}-street`} className="shop-label portal-label">
              Số nhà, tên đường
            </label>
            <input
              id={`${uid}-street`}
              name="streetLine"
              data-field="streetLine"
              type="text"
              className="shop-input portal-input"
              value={newAddress.streetLine}
              aria-invalid={errors?.streetLine ? 'true' : undefined}
              onChange={(e) =>
                onNewAddressChange({ ...newAddress, streetLine: e.target.value })
              }
            />
            {errors?.streetLine && (
              <p className="form-error" role="alert">
                {errors.streetLine}
              </p>
            )}
          </div>

          <div className="shop-field">
            <label htmlFor={`${uid}-note`} className="shop-label portal-label">
              Ghi chú giao hàng (tùy chọn)
            </label>
            <input
              id={`${uid}-note`}
              name="note"
              data-field="note"
              type="text"
              className="shop-input portal-input"
              value={newAddress.note ?? ''}
              aria-invalid={errors?.note ? 'true' : undefined}
              onChange={(e) => onNewAddressChange({ ...newAddress, note: e.target.value })}
            />
            {errors?.note && (
              <p className="form-error" role="alert">
                {errors.note}
              </p>
            )}
          </div>

          <label className="shop-checkbox">
            <input
              type="checkbox"
              checked={saveAddress}
              onChange={(e) => onSaveAddressChange(e.target.checked)}
            />
            <span>Lưu vào sổ địa chỉ</span>
          </label>

          {saveAddress && (
            <label className="shop-checkbox">
              <input
                type="checkbox"
                checked={newAddress.makeDefault}
                onChange={(e) =>
                  onNewAddressChange({ ...newAddress, makeDefault: e.target.checked })
                }
              />
              <span>Đặt làm địa chỉ mặc định</span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
