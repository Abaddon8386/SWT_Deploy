import { useSourceLanguage, sourceText, sourceFormat } from '../shopI18n';
import { useState } from 'react';
import { StockAdjustDialog } from './StockAdjustDialog';

export interface VariantRowDraft {
  key: string;
  id: number | null;
  sku: string;
  label: string;
  price: string;
  servingsPerContainer: string;
  stock: number;
  initialStock: string;
  active: boolean;
}

export interface VariantRowsEditorProps {
  rows: VariantRowDraft[];
  onChange: (next: VariantRowDraft[]) => void;
  disabled?: boolean;
  error?: string;
}

export function VariantRowsEditor({
  rows,
  onChange,
  disabled = false,
  error,
}: VariantRowsEditorProps) {
  useSourceLanguage();
  const [adjusting, setAdjusting] = useState<VariantRowDraft | null>(null);

  const updateRow = (index: number, patch: Partial<VariantRowDraft>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    onChange([
      ...rows,
      {
        key: `v-${Date.now()}-${rows.length}`,
        id: null,
        sku: '',
        label: '',
        price: '',
        servingsPerContainer: '',
        stock: 0,
        initialStock: '10',
        active: true,
      },
    ]);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <section className="portal-card stack" aria-label={sourceText("Biến thể sản phẩm")}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h2 className="portal-card-title" style={{ margin: 0 }}>
          {sourceText("Biến thể sản phẩm")}</h2>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={disabled}
          onClick={addRow}
        >
          {sourceText("Thêm biến thể")}</button>
      </div>

      <div className="portal-table-wrapper" role="region" aria-label={sourceText("Biên tập phân loại sản phẩm")} tabIndex={0}>
        <table className="portal-table shop-editor-table shop-editor-table--variants">
          <thead>
            <tr>
              <th scope="col">SKU</th>
              <th scope="col">{sourceText("Nhãn biến thể")}</th>
              <th scope="col">{sourceText("Giá (đ)")}</th>
              <th scope="col">{sourceText("Số lần dùng")}</th>
              <th scope="col">{sourceText("Tồn kho")}</th>
              <th scope="col">{sourceText("Đang bán")}</th>
              <th scope="col">{sourceText("Thao tác")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.key}>
                <td>
                  <input
                    type="text"
                    className="shop-input"
                    aria-label={sourceFormat("SKU biến thể {0}", idx + 1)}
                    data-field={idx === 0 ? 'variantSku' : undefined}
                    value={row.sku}
                    disabled={disabled}
                    maxLength={40}
                    placeholder="SOL-WHEY-2KG"
                    onChange={e => updateRow(idx, { sku: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="shop-input"
                    aria-label={sourceFormat("Nhãn biến thể {0}", idx + 1)}
                    data-field={idx === 0 ? 'variantLabel' : undefined}
                    value={row.label}
                    disabled={disabled}
                    maxLength={80}
                    placeholder={sourceText("Sô-cô-la · 2,27 kg")}
                    onChange={e => updateRow(idx, { label: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="shop-input"
                    aria-label={sourceFormat("Giá biến thể {0}", idx + 1)}
                    data-field={idx === 0 ? 'variantPrice' : undefined}
                    value={row.price}
                    disabled={disabled}
                    min={1000}
                    step={1000}
                    onChange={e => updateRow(idx, { price: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="shop-input"
                    aria-label={sourceFormat("Số lần dùng biến thể {0}", idx + 1)}
                    value={row.servingsPerContainer}
                    disabled={disabled}
                    min={1}
                    step={1}
                    placeholder="68"
                    onChange={e => updateRow(idx, { servingsPerContainer: e.target.value })}
                  />
                </td>
                <td>
                  {row.id != null ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        type="number"
                        className="shop-input"
                        aria-label={sourceFormat("Tồn kho biến thể {0}", idx + 1)}
                        value={row.stock}
                        readOnly
                        style={{ width: 84 }}
                      />
                      {row.stock > 0 && row.stock < 10 && (
                        <span className="shop-status-pill shop-status-pill--pending_payment">
                          {sourceText("Sắp hết")}</span>
                      )}
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={disabled}
                        onClick={() => setAdjusting(row)}
                      >
                        {sourceText("Điều chỉnh tồn")}</button>
                    </div>
                  ) : (
                    <input
                      type="number"
                      className="shop-input"
                      aria-label={sourceFormat("Tồn ban đầu biến thể {0}", idx + 1)}
                      value={row.initialStock}
                      disabled={disabled}
                      min={0}
                      step={1}
                      onChange={e => updateRow(idx, { initialStock: e.target.value })}
                    />
                  )}
                </td>
                <td>
                  <label className="shop-checkbox-target">
                    <input
                      type="checkbox"
                      aria-label={sourceFormat("Đang bán biến thể {0}", idx + 1)}
                      checked={row.active}
                      disabled={disabled}
                      onChange={e => updateRow(idx, { active: e.target.checked })}
                    />
                  </label>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={disabled || rows.length <= 1}
                    onClick={() => removeRow(idx)}
                  >
                    {sourceText("Xóa dòng")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {sourceText(error)}
        </p>
      )}

      {adjusting && adjusting.id != null && (
        <StockAdjustDialog
          variant={{
            id: adjusting.id,
            sku: adjusting.sku,
            label: adjusting.label || adjusting.sku,
            stock: adjusting.stock,
          }}
          onClose={() => setAdjusting(null)}
          onAdjusted={updated => {
            onChange(
              rows.map(r => (r.id === updated.id ? { ...r, stock: updated.stock } : r)),
            );
            setAdjusting(null);
          }}
        />
      )}
    </section>
  );
}
