import { useSourceLanguage, sourceFormat, sourceText, sourceError, sourceNotify as notify, sourceFormatPair } from '../shopI18n';
import { useState } from 'react';
import { Modal } from '../../../shared/ui/Modal';
import { shopApi } from '../shopApi';
import type { VariantAdminDto } from '../shopTypes';

import { Select } from '../../../shared/ui/Select';
export interface StockAdjustDialogProps {
  variant: { id: number; sku: string; label: string; stock: number };
  onClose: () => void;
  onAdjusted: (updated: VariantAdminDto) => void;
}

export function StockAdjustDialog({ variant, onClose, onAdjusted }: StockAdjustDialogProps) {
  useSourceLanguage();
  const [deltaText, setDeltaText] = useState('10');
  const [reason, setReason] = useState<'restock' | 'adjustment'>('restock');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | Error>('');

  const parsedDelta = Number(deltaText);
  const isValidNumber = Number.isInteger(parsedDelta) && parsedDelta !== 0;
  const resultingStock = Number.isFinite(parsedDelta) ? variant.stock + parsedDelta : variant.stock;

  const handleSubmit = async () => {
    if (busy) return;
    if (!isValidNumber) {
      setError('Số lượng điều chỉnh phải là số nguyên khác 0.');
      return;
    }
    if (resultingStock < 0) {
      setError('Tồn kho sau điều chỉnh không được âm.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const updated = await shopApi.manager.adjustStock(variant.id, {
        delta: parsedDelta,
        reason,
        note: note.trim() || null,
      });
      notify(sourceFormatPair("Đã điều chỉnh tồn kho cho {0}.", variant.label), 'success');
      onAdjusted(updated);
    } catch (err) {
      setError(sourceError(err, 'Không thể điều chỉnh tồn kho. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={sourceFormat("Điều chỉnh tồn kho · {0}", variant.label)}
      busy={busy}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="stack">
        <p style={{ margin: 0 }}>
          SKU: <strong>{variant.sku}</strong> {sourceText(" · Tồn hiện tại:")}{' '}
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{variant.stock}</strong>
          {isValidNumber && (
            <>
              {' '}
              {sourceText("→ Sau điều chỉnh:")}{' '}
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{resultingStock}</strong>
            </>
          )}
        </p>

        <div className="shop-field">
          <label className="shop-label" htmlFor="stock-adjust-reason">
            {sourceText("Lý do điều chỉnh")}</label>
          <Select
            id="stock-adjust-reason"
            className="shop-select"
            value={reason}
            disabled={busy}
            onChange={e => setReason(e.target.value as 'restock' | 'adjustment')}
          >
            <option value="restock">{sourceText("Nhập thêm hàng")}</option>
            <option value="adjustment">{sourceText("Kiểm kê / điều chỉnh")}</option>
          </Select>
        </div>

        <div className="shop-field">
          <label className="shop-label" htmlFor="stock-adjust-delta">
            {sourceText("Số lượng thay đổi (+ nhập thêm / − giảm trừ)")}</label>
          <input
            id="stock-adjust-delta"
            className="shop-input"
            type="number"
            step={1}
            value={deltaText}
            disabled={busy}
            aria-invalid={Boolean(error)}
            onChange={e => {
              setDeltaText(e.target.value);
              if (error) setError('');
            }}
          />
        </div>

        <div className="shop-field">
          <label className="shop-label" htmlFor="stock-adjust-note">
            {sourceText("Ghi chú (tùy chọn)")}</label>
          <input
            id="stock-adjust-note"
            className="shop-input"
            type="text"
            maxLength={200}
            value={note}
            disabled={busy}
            onChange={e => setNote(e.target.value)}
            placeholder={sourceText("Phiếu nhập lô 11/2026…")}
          />
        </div>

        {error && (
          <p className="form-error" role="alert">
            {sourceText(error)}
          </p>
        )}

        <div className="form-actions">
          <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>
            {sourceText("Hủy")}</button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => void handleSubmit()}
          >
            {busy ? sourceText('Đang lưu…') : sourceText('Lưu điều chỉnh')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
