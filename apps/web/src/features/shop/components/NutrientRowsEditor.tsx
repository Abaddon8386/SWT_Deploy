import { useSourceLanguage, sourceText, sourceFormat } from '../shopI18n';
import type { NutrientDto } from '../shopTypes';
import { NutritionFacts } from './NutritionFacts';

export interface NutrientRowDraft {
  key: string;
  name: string;
  amount: string;
  unit: string;
  dailyValuePercent: string;
  subRow: boolean;
  highlight: boolean;
}

export interface NutrientRowsEditorProps {
  servingSize: string;
  onServingSizeChange: (next: string) => void;
  servingsPreview: number | null;
  rows: NutrientRowDraft[];
  onChange: (next: NutrientRowDraft[]) => void;
  disabled?: boolean;
  servingSizeError?: string;
}

export function NutrientRowsEditor({
  servingSize,
  onServingSizeChange,
  servingsPreview,
  rows,
  onChange,
  disabled = false,
  servingSizeError,
}: NutrientRowsEditorProps) {
  useSourceLanguage();
  const updateRow = (index: number, patch: Partial<NutrientRowDraft>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const toggleHighlight = (index: number, checked: boolean) => {
    onChange(
      rows.map((r, i) => ({
        ...r,
        highlight: i === index ? checked : false,
      })),
    );
  };

  const addRow = () => {
    if (rows.length >= 30) return;
    onChange([
      ...rows,
      {
        key: `n-${Date.now()}-${rows.length}`,
        name: '',
        amount: '',
        unit: 'g',
        dailyValuePercent: '',
        subRow: false,
        highlight: false,
      },
    ]);
  };

  const removeRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  const previewNutrients: NutrientDto[] = rows
    .filter(r => r.name.trim() !== '')
    .map((r, idx) => ({
      name: r.name.trim(),
      amount: Number(r.amount) || 0,
      unit: r.unit.trim() || 'g',
      dailyValuePercent:
        r.dailyValuePercent.trim() !== '' && Number.isFinite(Number(r.dailyValuePercent))
          ? Number(r.dailyValuePercent)
          : null,
      subRow: r.subRow,
      highlight: r.highlight,
      sortOrder: idx,
    }));

  return (
    <section className="portal-card stack" aria-label={sourceText("Thành phần mỗi khẩu phần")}>
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
          {sourceText("Thành phần mỗi khẩu phần")}</h2>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={disabled || rows.length >= 30}
          onClick={addRow}
        >
          {sourceText("Thêm thành phần")}</button>
      </div>

      <div className="shop-field" style={{ maxWidth: 360 }}>
        <label className="shop-label" htmlFor="product-serving-size">
          {sourceText("Khẩu phần (Serving size)")}</label>
        <input
          id="product-serving-size"
          data-field="servingSize"
          type="text"
          className="shop-input"
          value={servingSize}
          disabled={disabled}
          maxLength={60}
          aria-invalid={Boolean(servingSizeError)}
          placeholder={sourceText("1 muỗng (33 g)")}
          onChange={e => onServingSizeChange(e.target.value)}
        />
        {servingSizeError && (
          <p className="form-error" role="alert">
            {sourceText(servingSizeError)}
          </p>
        )}
      </div>

      <div className="shop-nutrient-editor">
        <div className="portal-table-wrapper" role="region" aria-label={sourceText("Biên tập thành phần dinh dưỡng")} tabIndex={0}>
          <table className="portal-table shop-editor-table">
            <thead>
              <tr>
                <th scope="col">{sourceText("Tên chất")}</th>
                <th scope="col">{sourceText("Lượng")}</th>
                <th scope="col">{sourceText("Đơn vị")}</th>
                <th scope="col">{sourceText("% NCKN")}</th>
                <th scope="col">{sourceText("Hàng con")}</th>
                <th scope="col">{sourceText("Nổi bật")}</th>
                <th scope="col">{sourceText("Xóa")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    {sourceText("Chưa có dòng thành phần. Nhấn “Thêm thành phần” để nhập bảng dinh dưỡng.")}</td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={row.key}>
                    <td>
                      <input
                        type="text"
                        className="shop-input"
                        aria-label={sourceFormat("Tên chất {0}", idx + 1)}
                        value={row.name}
                        disabled={disabled}
                        maxLength={80}
                        placeholder={sourceText("Đạm")}
                        onChange={e => updateRow(idx, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="shop-input"
                        aria-label={sourceFormat("Lượng chất {0}", idx + 1)}
                        value={row.amount}
                        disabled={disabled}
                        step="0.01"
                        min={0}
                        placeholder="25"
                        onChange={e => updateRow(idx, { amount: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="shop-input"
                        aria-label={sourceFormat("Đơn vị chất {0}", idx + 1)}
                        value={row.unit}
                        disabled={disabled}
                        maxLength={12}
                        placeholder="g"
                        onChange={e => updateRow(idx, { unit: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="shop-input"
                        aria-label={sourceFormat("% NCKN chất {0}", idx + 1)}
                        value={row.dailyValuePercent}
                        disabled={disabled}
                        step={1}
                        min={0}
                        placeholder="50"
                        onChange={e => updateRow(idx, { dailyValuePercent: e.target.value })}
                      />
                    </td>
                    <td>
                      <label className="shop-checkbox-target">
                        <input
                          type="checkbox"
                          aria-label={sourceFormat("Hàng con chất {0}", idx + 1)}
                          checked={row.subRow}
                          disabled={disabled}
                          onChange={e => updateRow(idx, { subRow: e.target.checked })}
                        />
                      </label>
                    </td>
                    <td>
                      <label className="shop-checkbox-target">
                        <input
                          type="checkbox"
                          aria-label={sourceFormat("Nổi bật chất {0}", idx + 1)}
                          checked={row.highlight}
                          disabled={disabled}
                          onChange={e => toggleHighlight(idx, e.target.checked)}
                        />
                      </label>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={disabled}
                        onClick={() => removeRow(idx)}
                      >
                        {sourceText("Xóa")}</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="stack">
          <span className="shop-label">{sourceText("Xem trước nhãn thành phần")}</span>
          <NutritionFacts
            servingSize={servingSize.trim() || sourceText('1 khẩu phần')}
            servings={servingsPreview}
            nutrients={previewNutrients}
          />
        </div>
      </div>
    </section>
  );
}
