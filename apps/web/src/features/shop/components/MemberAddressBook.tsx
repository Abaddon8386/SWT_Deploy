import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../../shared/lib/errorMessage';
import { notify } from '../../../shared/lib/portalNotices';
import { useConfirm } from '../../../shared/ui/ConfirmDialog';
import { LoadingSkeleton } from '../../../shared/ui/LoadingSkeleton';
import { Modal } from '../../../shared/ui/Modal';
import { shopApi } from '../shopApi';
import type { AddressDto, AddressRequest } from '../shopTypes';
import { AddressForm } from './AddressForm';

const MAX_ADDRESSES = 5;

export function MemberAddressBook() {
  const [confirm, confirmDialog] = useConfirm();
  const [addresses, setAddresses] = useState<AddressDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{
    id: number | null;
    initialValue?: Partial<AddressRequest>;
  } | null>(null);
  const [modalError, setModalError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await shopApi.listAddresses();
      setAddresses(list);
    } catch (err) {
      setError(errorMessage(err, 'Không thể tải sổ địa chỉ giao hàng. Vui lòng thử lại.'));
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
      setModalError(errorMessage(err, 'Không thể lưu địa chỉ giao hàng. Vui lòng thử lại.'));
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
      const msg = errorMessage(err, 'Không thể đặt địa chỉ mặc định.');
      setError(msg);
      notify(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (addr: AddressDto) => {
    if (busy) return;
    const ok = await confirm({
      title: 'Xóa địa chỉ giao hàng',
      message: `Xóa địa chỉ của ${addr.recipientName} (${addr.streetLine}, ${addr.wardName}, ${addr.provinceName})?`,
      confirmLabel: 'Xóa địa chỉ',
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
      const msg = errorMessage(err, 'Không thể xóa địa chỉ giao hàng.');
      setError(msg);
      notify(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const atLimit = addresses.length >= MAX_ADDRESSES;

  return (
    <section className="stack" aria-label="Sổ địa chỉ giao hàng">
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
          Lưu tối đa {MAX_ADDRESSES} địa chỉ giao hàng ({addresses.length}/{MAX_ADDRESSES}).
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
          Thêm địa chỉ
        </button>
      </div>

      {loading ? (
        <LoadingSkeleton label="Đang tải sổ địa chỉ…" variant="rows" count={2} />
      ) : error ? (
        <div className="portal-alert" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : !addresses.length ? (
        <div className="portal-card portal-state">
          <p style={{ margin: 0 }}>Bạn chưa lưu địa chỉ giao hàng nào.</p>
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
                    {addr.isDefault && <span className="shop-status-pill">Mặc định</span>}
                  </div>
                  <p style={{ margin: '4px 0 0' }}>
                    {addr.streetLine}, {addr.wardName}, {addr.provinceName}
                  </p>
                  {addr.note && (
                    <p className="muted" style={{ margin: '4px 0 0' }}>
                      Ghi chú: {addr.note}
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
                    Sửa
                  </button>
                  {!addr.isDefault && (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => void handleMakeDefault(addr)}
                    >
                      Đặt làm mặc định
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => void handleDelete(addr)}
                  >
                    Xóa
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title={editing.id == null ? 'Thêm địa chỉ giao hàng' : 'Sửa địa chỉ giao hàng'}
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
                {modalError}
              </p>
            )}
          </div>
        </Modal>
      )}

      {confirmDialog}
    </section>
  );
}
