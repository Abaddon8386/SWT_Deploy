import { useSourceLanguage, sourceText, sourceFormat, sourceError, sourceNotify as notify, sourcePair, sourceFormatPair } from '../shopI18n';
import { useCallback, useEffect, useState } from 'react';
import { ActionMenu } from '../../../shared/ui/ActionMenu';
import { useConfirm } from '../../../shared/ui/ConfirmDialog';
import { LoadingSkeleton } from '../../../shared/ui/LoadingSkeleton';
import { Modal } from '../../../shared/ui/Modal';
import { shopApi } from '../shopApi';
import type { CategoryAdminDto } from '../shopTypes';

interface CategoryFormState {
  id: number | null;
  name: string;
  sortOrder: string;
  active: boolean;
}

export function CategoryManager() {
  useSourceLanguage();
  const [confirm, confirmDialog] = useConfirm();
  const [categories, setCategories] = useState<CategoryAdminDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | Error>('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CategoryFormState | null>(null);
  const [formError, setFormError] = useState<string | Error>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await shopApi.manager.listCategories();
      setCategories(list);
    } catch (err) {
      setError(sourceError(err, 'Không thể tải danh sách loại sản phẩm.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || busy) return;
    const trimmedName = editing.name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      setFormError('Tên loại sản phẩm cần từ 2 đến 80 ký tự.');
      return;
    }
    const sortOrder = Number(editing.sortOrder);
    if (!Number.isInteger(sortOrder)) {
      setFormError('Thứ tự hiển thị phải là số nguyên.');
      return;
    }

    setBusy(true);
    setFormError('');
    try {
      const payload = {
        name: trimmedName,
        sortOrder,
        active: editing.active,
      };
      if (editing.id == null) {
        await shopApi.manager.createCategory(payload);
        notify('Đã thêm loại sản phẩm.', 'success');
      } else {
        await shopApi.manager.updateCategory(editing.id, payload);
        notify('Đã cập nhật loại sản phẩm.', 'success');
      }
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(sourceError(err, 'Không thể lưu loại sản phẩm.'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (cat: CategoryAdminDto) => {
    if (busy) return;
    const ok = await confirm({
      title: sourcePair('Xóa loại sản phẩm'),
      message: sourceFormatPair("Xóa loại sản phẩm “{0}”?", cat.name),
      confirmLabel: sourcePair('Xóa loại sản phẩm'),
      danger: true,
    });
    if (!ok) return;

    setBusy(true);
    setError('');
    try {
      await shopApi.manager.deleteCategory(cat.id);
      notify(sourceFormatPair("Đã xóa loại sản phẩm “{0}”.", cat.name), 'success');
      await load();
    } catch (err) {
      const msg = sourceError(err, 'Không thể xóa loại sản phẩm.');
      setError(msg);
      notify(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stack" aria-label={sourceText("Quản lý loại sản phẩm")}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <p className="muted" style={{ margin: 0 }}>
          {sourceText("Phân loại sản phẩm trên kệ cửa hàng SÖL.")}</p>
        <button
          type="button"
          className="btn-primary"
          disabled={loading || busy}
          onClick={() => {
            setFormError('');
            setEditing({
              id: null,
              name: '',
              sortOrder: String(categories.length + 1),
              active: true,
            });
          }}
        >
          {sourceText("Thêm loại sản phẩm")}</button>
      </div>

      {loading ? (
        <LoadingSkeleton label={sourceText("Đang tải loại sản phẩm…")} variant="table" count={3} />
      ) : error ? (
        <div className="portal-alert" role="alert">
          <span>{sourceText(error)}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void load()}>
            {sourceText("Thử lại")}</button>
        </div>
      ) : !categories.length ? (
        <div className="portal-card portal-state">
          <p style={{ margin: 0 }}>{sourceText("Chưa có loại sản phẩm nào.")}</p>
        </div>
      ) : (
        <div className="portal-table-wrapper" role="region" aria-label={sourceText("Danh mục sản phẩm")} tabIndex={0}>
          <table className="portal-table">
            <thead>
              <tr>
                <th scope="col">{sourceText("Tên loại")}</th>
                <th scope="col">Slug</th>
                <th scope="col">{sourceText("Thứ tự")}</th>
                <th scope="col">{sourceText("Số sản phẩm")}</th>
                <th scope="col">{sourceText("Trạng thái")}</th>
                <th scope="col">{sourceText("Thao tác")}</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => (
                <tr key={cat.id}>
                  <td>
                    <strong>{cat.name}</strong>
                  </td>
                  <td className="muted">{cat.slug}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{cat.sortOrder}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{cat.productCount}</td>
                  <td>
                    <span className="shop-status-pill">
                      {cat.active ? sourceText('Đang hiển thị') : sourceText('Đã ẩn')}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={busy}
                        onClick={() => {
                          setFormError('');
                          setEditing({
                            id: cat.id,
                            name: cat.name,
                            sortOrder: String(cat.sortOrder),
                            active: cat.active,
                          });
                        }}
                      >
                        {sourceText("Sửa")}</button>
                      <ActionMenu label={sourceFormat("Thao tác khác cho {0}", cat.name)}>
                        <button
                          type="button"
                          className="action-menu__item action-menu__item--danger"
                          disabled={busy}
                          onClick={() => void handleDelete(cat)}
                        >
                          {sourceText("Xóa")}</button>
                      </ActionMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal
          title={editing.id == null ? sourceText('Thêm loại sản phẩm') : sourceText('Sửa loại sản phẩm')}
          busy={busy}
          onClose={() => {
            if (!busy) setEditing(null);
          }}
        >
          <form className="stack" onSubmit={e => void handleSubmit(e)} noValidate>
            <div className="shop-field">
              <label className="shop-label" htmlFor="cat-name">
                {sourceText("Tên loại sản phẩm")}</label>
              <input
                id="cat-name"
                type="text"
                className="shop-input"
                maxLength={80}
                value={editing.name}
                disabled={busy}
                aria-invalid={Boolean(formError)}
                onChange={e => {
                  setEditing({ ...editing, name: e.target.value });
                  if (formError) setFormError('');
                }}
              />
            </div>

            <div className="shop-field">
              <label className="shop-label" htmlFor="cat-sort-order">
                {sourceText("Thứ tự hiển thị")}</label>
              <input
                id="cat-sort-order"
                type="number"
                step={1}
                className="shop-input"
                value={editing.sortOrder}
                disabled={busy}
                onChange={e => setEditing({ ...editing, sortOrder: e.target.value })}
              />
            </div>

            <label className="shop-checkbox">
              <input
                type="checkbox"
                checked={editing.active}
                disabled={busy}
                onChange={e => setEditing({ ...editing, active: e.target.checked })}
              />
              <span>{sourceText("Hiển thị trên kệ sản phẩm")}</span>
            </label>

            {formError && (
              <p className="form-error" role="alert">
                {sourceText(formError)}
              </p>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                {sourceText("Hủy")}</button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? sourceText('Đang lưu…') : sourceText('Lưu loại sản phẩm')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDialog}
    </section>
  );
}
