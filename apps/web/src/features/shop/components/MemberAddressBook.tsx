import { useSourceLanguage, sourceText, sourceError, sourceNotify as notify, sourcePair, sourceFormatPair } from '../shopI18n';
import { useCallback, useEffect, useState } from 'react';
import { useConfirm } from '../../../shared/ui/ConfirmDialog';
import { LoadingSkeleton } from '../../../shared/ui/LoadingSkeleton';
import { Modal } from '../../../shared/ui/Modal';
import { shopApi } from '../shopApi';
import type { AddressDto, AddressRequest } from '../shopTypes';
import { AddressForm } from './AddressForm';

const MAX_ADDRESSES = 5;

export function MemberAddressBook() {
  useSourceLanguage();
  const [confirm, confirmDialog] = useConfirm();
  const [addresses, setAddresses] = useState<AddressDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | Error>('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{
    id: number | null;
    initialValue?: Partial<AddressRequest>;
  } | null>(null);
  const [modalError, setModalError] = useState<string | Error>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await shopApi.listAddresses();
      setAddresses(list);
    } catch (err) {
      setError(sourceError(err, 'Không thể tải sổ địa chỉ giao hàng. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (payload: AddressRequest) => {
    if (!editing || busy) return;
    setBusy(true);
    setModalError('');
    try {
      await shopApi.saveAddress(payload, editing.id);
      setEditing(null);
      await load();
      notify(
        editing.id == null ? 'Đã thêm địa chỉ giao hàng.' : 'Đã cập nhật địa chỉ giao hàng.',
        'success',
      );
    } catch (err) {
      setModalError(sourceError(err, 'Không thể lưu địa chỉ giao hàng. Vui lòng thử lại.'));
    } finally {
      setBusy(false);
    }
  };

  const handleMakeDefault = async (addr: AddressDto) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const updated = await shopApi.makeDefaultAddress(addr.id);
      setAddresses(updated);
      notify('Đã đặt làm địa chỉ mặc định.', 'success');
    } catch (err) {
      const msg = sourceError(err, 'Không thể đặt địa chỉ mặc định.');
      setError(msg);
      notify(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (addr: AddressDto) => {
    if (busy) return;
    const ok = await confirm({
      title: sourcePair('Xóa địa chỉ giao hàng'),
      message: sourceFormatPair("Xóa địa chỉ của {0} ({1}, {2}, {3})?", addr.recipientName, addr.streetLine, addr.wardName, addr.provinceName),
      confirmLabel: sourcePair('Xóa địa chỉ'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      const updated = await shopApi.deleteAddress(addr.id);
      setAddresses(updated);
      notify('Đã xóa địa chỉ giao hàng.', 'success');
    } catch (err) {
      const msg = sourceError(err, 'Không thể xóa địa chỉ giao hàng.');
      setError(msg);
      notify(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const atLimit = addresses.length >= MAX_ADDRESSES;

  return (
    <section className="stack" aria-label={sourceText("Sổ địa chỉ giao hàng")}>
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
          {sourceText("Lưu tối đa ")}{MAX_ADDRESSES}{sourceText(" địa chỉ giao hàng (")}{addresses.length}/{MAX_ADDRESSES}).
        </p>
        <button
          type="button"
          className="btn-primary"
          disabled={loading || busy || atLimit}
          onClick={() => {
            setModalError('');
            setEditing({ id: null, initialValue: { makeDefault: addresses.length === 0 } });
          }}
        >
          {sourceText("Thêm địa chỉ")}</button>
      </div>

      {loading ? (
        <LoadingSkeleton label={sourceText("Đang tải sổ địa chỉ…")} variant="rows" count={2} />
      ) : error ? (
        <div className="portal-alert" role="alert">
          <span>{sourceText(error)}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void load()}>
            {sourceText("Thử lại")}</button>
        </div>
      ) : !addresses.length ? (
        <div className="portal-card portal-state">
          <p style={{ margin: 0 }}>{sourceText("Bạn chưa lưu địa chỉ giao hàng nào.")}</p>
        </div>
      ) : (
        <div className="stack">
          {addresses.map(addr => (
            <article key={addr.id} className="portal-card stack" style={{ gap: 8 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong>{addr.recipientName}</strong>
                    <span className="muted">{addr.phone}</span>
                    {addr.isDefault && <span className="shop-status-pill">{sourceText("Mặc định")}</span>}
                  </div>
                  <p style={{ margin: '4px 0 0' }}>
                    {addr.streetLine}, {addr.wardName}, {addr.provinceName}
                  </p>
                  {addr.note && (
                    <p className="muted" style={{ margin: '4px 0 0' }}>
                      {sourceText("Ghi chú: ")}{addr.note}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => {
                      setModalError('');
                      setEditing({
                        id: addr.id,
                        initialValue: {
                          recipientName: addr.recipientName,
                          phone: addr.phone,
                          provinceCode: addr.provinceCode,
                          wardCode: addr.wardCode,
                          streetLine: addr.streetLine,
                          note: addr.note,
                          makeDefault: addr.isDefault,
                        },
                      });
                    }}
                  >
                    {sourceText("Sửa")}</button>
                  {!addr.isDefault && (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => void handleMakeDefault(addr)}
                    >
                      {sourceText("Đặt làm mặc định")}</button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => void handleDelete(addr)}
                  >
                    {sourceText("Xóa")}</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title={editing.id == null ? sourceText('Thêm địa chỉ giao hàng') : sourceText('Sửa địa chỉ giao hàng')}
          busy={busy}
          onClose={() => {
            if (!busy) setEditing(null);
          }}
        >
          <div className="stack">
            <AddressForm
              initialValue={editing.initialValue}
              busy={busy}
              onCancel={() => setEditing(null)}
              onSubmit={handleSave}
            />
            {modalError && (
              <p className="form-error" role="alert">
                {sourceText(modalError)}
              </p>
            )}
          </div>
        </Modal>
      )}

      {confirmDialog}
    </section>
  );
}
