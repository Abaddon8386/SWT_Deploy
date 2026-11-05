import { Select } from '../../shared/ui/Select';
import { useCallback, useEffect, useState } from 'react';
import { catalogApi, type Discipline, type MembershipPackage, type Room } from './catalogApi';
import { Modal } from '../../shared/ui/Modal';
import { useConfirm } from '../../shared/ui/ConfirmDialog';
import { notify } from '../../shared/lib/portalNotices';
import { PageHeader } from '../../shared/ui/PageHeader';
import { isCourtDiscipline } from '../courts/courtsApi';
import { errorMessage } from '../../shared/lib/errorMessage';

type Tab = 'disciplines' | 'rooms' | 'packages';
type Form = Record<string, string>;

const ROOM_STATUS_LABEL = { available: 'Đang hoạt động', maintenance: 'Bảo trì', closed: 'Đã đóng' } as const;
const PACKAGE_TIER_LABEL: Record<string, string> = {
  SILVER: 'SILVER · Cơ bản',
  GOLD: 'GOLD · Trung cấp',
  PLATINUM: 'PLATINUM · VIP Cao cấp',
};
const QUICK_PRICE_PRESETS = [199000, 299000, 549000, 599000, 799000, 1599000, 1990000, 2990000, 5990000];
const QUICK_DURATION_PRESETS = [
  { days: 30, label: '1 tháng (30 ngày)' },
  { days: 90, label: '3 tháng (90 ngày)' },
  { days: 180, label: '6 tháng (180 ngày)' },
  { days: 365, label: '12 tháng (365 ngày)' },
];

const vnd = (n: number) => `${n.toLocaleString('vi-VN')} đ`;

function resolvePackageTier(pkg: { name?: string; tier?: string | null }): 'SILVER' | 'GOLD' | 'PLATINUM' {
  const explicit = pkg.tier?.trim().toUpperCase();
  if (explicit === 'SILVER' || explicit === 'GOLD' || explicit === 'PLATINUM') {
    return explicit;
  }
  const upper = (pkg.name ?? '').toUpperCase();
  if (upper.includes('PLATINUM') || upper.includes('VIP')) return 'PLATINUM';
  if (upper.includes('GOLD') || upper.includes('STANDARD')) return 'GOLD';
  return 'SILVER';
}

export function ManagerCatalogsPage() {
  const [confirm, confirmDialog] = useConfirm();
  const [tab, setTab] = useState<Tab>('disciplines');
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [packages, setPackages] = useState<MembershipPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [editing, setEditing] = useState<{ id: number | null; form: Form } | null>(null);
  const [quickPricePkg, setQuickPricePkg] = useState<{ pkg: MembershipPackage; price: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [d, r, p] = await Promise.all([catalogApi.disciplines(), catalogApi.rooms(), catalogApi.packages()]);
      setDisciplines(d);
      setRooms(r);
      setPackages(p);
    } catch (err) {
      setError(errorMessage(err, 'Không thể tải danh mục.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>, successMsg = 'Thao tác thành công!') => {
    setError('');
    setIsSubmitting(true);
    try {
      await action();
      setEditing(null);
      setQuickPricePkg(null);
      await load();
      notify(successMsg, 'success');
    } catch (err) {
      const msg = errorMessage(err, 'Thao tác thất bại.');
      setError(msg);
      notify(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const emptyForm = (): Form =>
    tab === 'disciplines'
      ? { name: '', description: '' }
      : tab === 'rooms'
        ? { name: '', location: '', capacity: '10', status: 'available', disciplineId: '', openTime: '06:00', closeTime: '22:00', tier: 'STANDARD' }
        : { name: '', description: '', price: '199000', durationDays: '30', classCreditLimit: '', status: 'active', tier: 'SILVER' };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || isSubmitting) return;
    const { id, form: f } = editing;
    const isNew = id == null;
    setFormError('');
    if (tab === 'rooms' && f.disciplineId && (!/^\d{2}:00$/.test(f.openTime) || !/^\d{2}:00$/.test(f.closeTime) || f.openTime >= f.closeTime)) {
      setFormError('Giờ mở và đóng cửa phải là giờ chẵn; giờ đóng phải sau giờ mở.');
      return;
    }
    if (tab === 'packages') {
      const parsedPrice = Number(f.price);
      const parsedDuration = Number(f.durationDays);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        setFormError('Giá bán gói tập phải từ 0 đ trở lên.');
        return;
      }
      if (!Number.isFinite(parsedDuration) || parsedDuration < 1) {
        setFormError('Thời hạn gói tập phải từ 1 ngày trở lên.');
        return;
      }
    }

    void run(async () => {
      if (tab === 'disciplines') {
        return catalogApi.saveDiscipline(id, { name: f.name.trim(), description: f.description.trim() });
      }
      if (tab === 'rooms') {
        return catalogApi.saveRoom(id, {
          name: f.name.trim(),
          location: f.location.trim(),
          capacity: Number(f.capacity),
          status: f.status as Room['status'],
          disciplineId: f.disciplineId ? Number(f.disciplineId) : null,
          openTime: f.disciplineId ? f.openTime : null,
          closeTime: f.disciplineId ? f.closeTime : null,
          tier: (f.tier as Room['tier']) || 'STANDARD',
        });
      }
      return catalogApi.savePackage(id, {
        name: f.name.trim(),
        description: f.description.trim(),
        price: Number(f.price),
        durationDays: Number(f.durationDays),
        classCreditLimit: f.classCreditLimit === '' ? null : Number(f.classCreditLimit),
        status: (f.status as MembershipPackage['status']) || 'active',
        tier: (f.tier as MembershipPackage['tier']) || resolvePackageTier({ name: f.name }),
      });
    }, isNew ? 'Đã thêm mới danh mục thành công!' : 'Đã cập nhật danh mục thành công!');
  };

  const submitQuickPrice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPricePkg || isSubmitting) return;
    const nextPrice = Number(quickPricePkg.price);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      notify('Giá bán không hợp lệ.', 'error');
      return;
    }
    const p = quickPricePkg.pkg;
    void run(
      () =>
        catalogApi.savePackage(p.id, {
          name: p.name,
          description: p.description,
          price: nextPrice,
          durationDays: p.durationDays,
          classCreditLimit: p.classCreditLimit,
          status: p.status,
          tier: resolvePackageTier(p),
        }),
      `Đã cập nhật giá gói "${p.name}" thành ${vnd(nextPrice)}!`
    );
  };

  const openEditor = (value: { id: number | null; form: Form }) => {
    setFormError('');
    setError('');
    setEditing(value);
  };

  const remove = async (what: string, name: string, action: () => Promise<unknown>) => {
    const confirmed = await confirm({
      title: `Xóa ${what}?`,
      message: `"${name}" sẽ bị xóa vĩnh viễn. Nếu đã được sử dụng, hệ thống sẽ từ chối và bạn nên chuyển sang trạng thái ngừng dùng.`,
      confirmLabel: 'Xóa',
      danger: true,
    });
    if (confirmed) void run(action, `Đã xóa ${what} "${name}".`);
  };

  const set = (key: string, value: string) => {
    setFormError('');
    if (editing) setEditing({ ...editing, form: { ...editing.form, [key]: value } });
  };

  const adjustFormPrice = (delta: number) => {
    if (!editing) return;
    const current = Number(editing.form.price) || 0;
    const next = Math.max(0, current + delta);
    set('price', String(next));
  };

  const modalTitle = () => {
    if (!editing) return '';
    const isNew = editing.id == null;
    if (tab === 'disciplines') return isNew ? 'Thêm bộ môn' : 'Chỉnh sửa bộ môn';
    if (tab === 'rooms') return isNew ? 'Thêm phòng tập' : 'Chỉnh sửa phòng tập';
    return isNew ? 'Tạo gói tập mới' : 'Chỉnh sửa gói tập & giá bán';
  };

  const rowCount = tab === 'disciplines' ? disciplines.length : tab === 'rooms' ? rooms.length : packages.length;

  return (
    <div className="portal-container">
      <PageHeader
        eyebrow="Quản lý"
        title="Danh mục vận hành"
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            {tab === 'packages' && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => openEditor({ id: null, form: emptyForm() })}
              >
                + Tạo gói tập mới
              </button>
            )}
            <button
              type="button"
              className={tab === 'packages' ? 'btn-secondary' : 'btn-primary'}
              onClick={() => openEditor({ id: null, form: emptyForm() })}
            >
              Thêm mới
            </button>
          </div>
        }
      />

      <div className="portal-tabs">
        {(
          [
            ['disciplines', `Bộ môn (${disciplines.length})`],
            ['rooms', `Phòng tập (${rooms.length})`],
            ['packages', `Gói tập (${packages.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`portal-tab ${tab === key ? 'active' : ''}`}
            onClick={() => {
              setTab(key);
              setEditing(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="portal-alert" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      )}

      {/* Quick Price Edit Modal */}
      {quickPricePkg && (
        <Modal
          title={`Sửa giá nhanh: ${quickPricePkg.pkg.name}`}
          busy={isSubmitting}
          onClose={() => !isSubmitting && setQuickPricePkg(null)}
        >
          <form onSubmit={submitQuickPrice} style={{ display: 'grid', gap: 14 }}>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="quick-pkg-price">
                Giá bán mới (VNĐ) *
              </label>
              <input
                id="quick-pkg-price"
                className="portal-input"
                type="number"
                min="0"
                step="1000"
                required
                autoFocus
                value={quickPricePkg.price}
                onChange={(e) => setQuickPricePkg({ ...quickPricePkg, price: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {QUICK_PRICE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setQuickPricePkg({ ...quickPricePkg, price: String(preset) })}
                >
                  {vnd(preset)}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[-100000, -50000, -10000, 10000, 50000, 100000].map((delta) => (
                <button
                  key={delta}
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    const current = Number(quickPricePkg.price) || 0;
                    setQuickPricePkg({ ...quickPricePkg, price: String(Math.max(0, current + delta)) });
                  }}
                >
                  {delta > 0 ? `+${(delta / 1000).toLocaleString('vi-VN')}k` : `${(delta / 1000).toLocaleString('vi-VN')}k`}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={isSubmitting}
                onClick={() => setQuickPricePkg(null)}
              >
                Hủy
              </button>
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Đang lưu...' : 'Lưu giá mới'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Accessible Dialog Modal for Adding/Editing */}
      {editing && (
        <Modal title={modalTitle()} busy={isSubmitting} onClose={() => !isSubmitting && setEditing(null)}>
          <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
            {formError && <p role="alert" className="portal-alert">{formError}</p>}
            {error && <p role="alert" className="portal-alert">{error}</p>}
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="cat-name">Tên hiển thị *</label>
              <input
                id="cat-name"
                className="portal-input"
                type="text"
                required
                autoFocus
                placeholder={tab === 'packages' ? 'Vd: SILVER, GOLD 3 THÁNG, PLATINUM VIP...' : 'Vd: Gym, Bơi lội, Tennis...'}
                value={editing.form.name ?? ''}
                onChange={(e) => set('name', e.target.value)}
              />
            </div>

            {tab === 'rooms' && (
              <>
                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="cat-discipline">Đặt sân / làn theo bộ môn</label>
                  <Select id="cat-discipline" className="portal-select" value={editing.form.disciplineId ?? ''} onChange={event => {
                    const value = event.target.value;
                    setFormError('');
                    setEditing({ ...editing, form: { ...editing.form, disciplineId: value, openTime: editing.form.openTime || '06:00', closeTime: editing.form.closeTime || '22:00' } });
                  }}>
                    <option value="">Không mở đặt sân</option>
                    {disciplines.filter(discipline => isCourtDiscipline(discipline.name)).map(discipline => <option key={discipline.id} value={discipline.id}>{discipline.name}</option>)}
                  </Select>
                </div>
                {editing.form.disciplineId && <div className="grid-2">
                  <label className="portal-form-group" htmlFor="cat-open"><span className="portal-label">Giờ mở cửa</span><input id="cat-open" className="portal-input" type="time" step="3600" required value={editing.form.openTime ?? ''} onChange={event => set('openTime', event.target.value)} /></label>
                  <label className="portal-form-group" htmlFor="cat-close"><span className="portal-label">Giờ đóng cửa</span><input id="cat-close" className="portal-input" type="time" step="3600" required value={editing.form.closeTime ?? ''} onChange={event => set('closeTime', event.target.value)} /></label>
                </div>}
                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="cat-tier">Phân hạng phòng</label>
                  <Select id="cat-tier" className="portal-select" value={editing.form.tier || 'STANDARD'} onChange={(e) => set('tier', e.target.value)}>
                    <option value="STANDARD">Tiêu chuẩn (Mọi hội viên)</option>
                    <option value="PLATINUM">VIP (Chỉ dành cho Platinum)</option>
                  </Select>
                </div>
                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="cat-location">Vị trí / tầng</label>
                  <input
                    id="cat-location"
                    className="portal-input"
                    type="text"
                    placeholder="Vd: Tầng 2, Khu Đông"
                    value={editing.form.location ?? ''}
                    onChange={(e) => set('location', e.target.value)}
                  />
                </div>
                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="cat-capacity">Sức chứa tối đa (người) *</label>
                  <input
                    id="cat-capacity"
                    className="portal-input"
                    type="number"
                    min="1"
                    max="200"
                    required
                    value={editing.form.capacity ?? ''}
                    onChange={(e) => set('capacity', e.target.value)}
                  />
                </div>
              </>
            )}

            {tab === 'packages' && (
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="cat-package-tier">Hạng gói tập (Tier)</label>
                <Select
                  id="cat-package-tier"
                  className="portal-select"
                  value={editing.form.tier || resolvePackageTier({ name: editing.form.name })}
                  onChange={(e) => set('tier', e.target.value)}
                >
                  <option value="SILVER">SILVER · Cơ bản (1 lượt sân miễn phí/tháng)</option>
                  <option value="GOLD">GOLD · Trung cấp (2 lượt sân miễn phí/tháng)</option>
                  <option value="PLATINUM">PLATINUM · VIP Cao cấp (Phòng VIP + 3 lượt sân miễn phí/tháng)</option>
                </Select>
              </div>
            )}

            {tab === 'packages' && (
              <>
                <div className="grid-2">
                  <div className="portal-form-group">
                    <label className="portal-label" htmlFor="cat-price">Đơn giá (VND) *</label>
                    <input
                      id="cat-price"
                      className="portal-input"
                      type="number"
                      min="0"
                      step="1000"
                      required
                      placeholder="Vd: 199000"
                      value={editing.form.price ?? ''}
                      onChange={(e) => set('price', e.target.value)}
                    />
                  </div>
                  <div className="portal-form-group">
                    <label className="portal-label" htmlFor="cat-duration">Thời hạn (ngày) *</label>
                    <input
                      id="cat-duration"
                      className="portal-input"
                      type="number"
                      min="1"
                      required
                      placeholder="Vd: 30"
                      value={editing.form.durationDays ?? ''}
                      onChange={(e) => set('durationDays', e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Chọn nhanh giá:</span>
                  {QUICK_PRICE_PRESETS.slice(0, 6).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => set('price', String(preset))}
                    >
                      {vnd(preset)}
                    </button>
                  ))}
                  <button type="button" className="btn-secondary btn-sm" onClick={() => adjustFormPrice(-50000)}>
                    -50k
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => adjustFormPrice(50000)}>
                    +50k
                  </button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Chọn nhanh kỳ hạn:</span>
                  {QUICK_DURATION_PRESETS.map((preset) => (
                    <button
                      key={preset.days}
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => set('durationDays', String(preset.days))}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {tab === 'packages' && (
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="cat-credit">
                  Số buổi lớp kèm theo (để trống = không giới hạn)
                </label>
                <input
                  id="cat-credit"
                  className="portal-input"
                  type="number"
                  min="0"
                  placeholder="Vd: 2, 5, 15 hoặc để trống (không giới hạn)"
                  value={editing.form.classCreditLimit ?? ''}
                  onChange={(e) => set('classCreditLimit', e.target.value)}
                />
              </div>
            )}

            {tab !== 'rooms' && (
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="cat-desc">
                  {tab === 'packages' ? 'Mô tả & Quyền lợi chi tiết trong gói' : 'Mô tả chi tiết'}
                </label>
                <textarea
                  id="cat-desc"
                  className="portal-textarea"
                  rows={tab === 'packages' ? 6 : 3}
                  placeholder={
                    tab === 'packages'
                      ? 'Nhập chi tiết từng quyền lợi của gói tập (mỗi dòng một quyền lợi)...'
                      : 'Mô tả công năng hoặc quyền lợi...'
                  }
                  value={editing.form.description ?? ''}
                  onChange={(e) => set('description', e.target.value)}
                />
              </div>
            )}

            {tab !== 'disciplines' && (
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="cat-status">Trạng thái vận hành</label>
                <Select
                  id="cat-status"
                  className="portal-select"
                  value={editing.form.status}
                  onChange={(e) => set('status', e.target.value)}
                >
                  {tab === 'rooms' ? (
                    <>
                      <option value="available">Đang hoạt động</option>
                      <option value="maintenance">Bảo trì</option>
                      <option value="closed">Đã đóng</option>
                    </>
                  ) : (
                    <>
                      <option value="active">Đang bán</option>
                      <option value="inactive">Ngừng bán</option>
                    </>
                  )}
                </Select>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={isSubmitting}
                onClick={() => setEditing(null)}
              >
                Hủy
              </button>
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className="spinner" />
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  'Lưu thay đổi'
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {loading ? (
        <div className="portal-card" aria-busy="true">
          <div style={{ display: 'grid', gap: 12 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="portal-skeleton" style={{ height: 52, borderRadius: 8 }} />
            ))}
          </div>
        </div>
      ) : rowCount === 0 && !error ? (
        <div className="portal-card">
          <div className="portal-state">
            <h3 className="portal-state__title">
              {tab === 'disciplines' && 'Chưa có bộ môn nào'}
              {tab === 'rooms' && 'Chưa có cơ sở phòng tập nào'}
              {tab === 'packages' && 'Chưa có gói hội viên nào'}
            </h3>
            <p style={{ color: 'var(--color-text-muted)' }}>
              Hãy nhấn nút thêm để cấu hình danh mục phục vụ vận hành.
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => openEditor({ id: null, form: emptyForm() })}
            >
              {tab === 'packages' ? '+ Tạo gói tập mới' : 'Thêm mới'}
            </button>
          </div>
        </div>
      ) : (
        <div className="portal-card portal-card--flush">
          <div className="portal-table-wrapper">
            <table className="portal-table">
              {tab === 'disciplines' && (
                <>
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>Tên bộ môn</th>
                      <th>Mô tả</th>
                      <th className="actions" style={{ width: '200px' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disciplines.map((d) => (
                      <tr key={d.id}>
                        <td><strong>{d.name}</strong></td>
                        <td style={{ color: 'var(--color-text-muted)' }}>{d.description || <span className="muted">Không có mô tả</span>}</td>
                        <td className="actions">
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => openEditor({ id: d.id, form: { name: d.name, description: d.description ?? '' } })}
                          >
                            Chỉnh sửa
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            disabled={isSubmitting}
                            onClick={() => void remove('bộ môn', d.name, () => catalogApi.deleteDiscipline(d.id))}
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {tab === 'rooms' && (
                <>
                  <thead>
                    <tr>
                      <th>Phòng tập</th>
                      <th>Phân hạng</th>
                      <th>Vị trí</th>
                      <th>Sức chứa</th>
                      <th>Trạng thái</th>
                      <th className="actions">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((r) => (
                      <tr key={r.id}>
                        <td><strong>{r.name}</strong>{r.disciplineName && <div className="muted">{r.disciplineName}{r.openTime && r.closeTime ? ` · ${r.openTime.slice(0, 5)}–${r.closeTime.slice(0, 5)}` : ''}</div>}</td>
                        <td>
                          {r.tier === 'PLATINUM' || r.name.toLowerCase().includes('vip') ? (
                            <span className="badge badge-primary" style={{ backgroundColor: 'rgba(235, 114, 91, 0.2)', color: 'var(--color-brand-salmon, #eb725b)', border: '1px solid rgba(235, 114, 91, 0.4)' }}>VIP · Platinum</span>
                          ) : (
                            <span className="badge badge-secondary">Tiêu chuẩn</span>
                          )}
                        </td>
                        <td>{r.location || <span className="muted">—</span>}</td>
                        <td><strong>{r.capacity} người</strong></td>
                        <td>
                          <span className={`badge ${r.status === 'available' ? 'badge-success' : 'badge-warning'}`}>
                            {ROOM_STATUS_LABEL[r.status] ?? r.status}
                          </span>
                        </td>
                        <td className="actions">
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() =>
                              openEditor({
                                id: r.id,
                                form: { name: r.name, location: r.location ?? '', capacity: String(r.capacity), status: r.status, disciplineId: r.disciplineId == null ? '' : String(r.disciplineId), openTime: r.openTime?.slice(0, 5) ?? '', closeTime: r.closeTime?.slice(0, 5) ?? '', tier: r.tier || (r.name.toLowerCase().includes('vip') ? 'PLATINUM' : 'STANDARD') },
                              })
                            }
                          >
                            Chỉnh sửa
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            disabled={isSubmitting}
                            onClick={() => void remove('phòng tập', r.name, () => catalogApi.deleteRoom(r.id))}
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {tab === 'packages' && (
                <>
                  <thead>
                    <tr>
                      <th>Tên gói & Quyền lợi</th>
                      <th>Hạng gói</th>
                      <th>Giá gói</th>
                      <th>Thời hạn</th>
                      <th>Số buổi lớp</th>
                      <th>Trạng thái</th>
                      <th className="actions">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packages.map((p) => {
                      const tier = resolvePackageTier(p);
                      return (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.name}</strong>
                            {p.description && (
                              <div className="muted" style={{ whiteSpace: 'pre-line', maxHeight: 72, overflow: 'hidden' }}>
                                {p.description}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className="badge badge-secondary">
                              {PACKAGE_TIER_LABEL[tier] ?? tier}
                            </span>
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--portal-salmon)', whiteSpace: 'nowrap' }}>
                            {vnd(p.price)}
                          </td>
                          <td>{p.durationDays} ngày</td>
                          <td>{p.classCreditLimit ?? 'Không giới hạn'}</td>
                          <td>
                            <span className={`badge ${p.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                              {p.status === 'active' ? 'Đang bán' : 'Ngừng bán'}
                            </span>
                          </td>
                          <td className="actions">
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => setQuickPricePkg({ pkg: p, price: String(p.price) })}
                            >
                              Sửa giá nhanh
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() =>
                                openEditor({
                                  id: p.id,
                                  form: {
                                    name: p.name,
                                    description: p.description ?? '',
                                    price: String(p.price),
                                    durationDays: String(p.durationDays),
                                    classCreditLimit: p.classCreditLimit == null ? '' : String(p.classCreditLimit),
                                    status: p.status,
                                    tier,
                                  },
                                })
                              }
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={async () => {
                                const nextStatus = p.status === 'active' ? 'inactive' : 'active';
                                const label = nextStatus === 'active' ? 'mở bán' : 'ngừng bán';
                                const confirmed = await confirm({
                                  title: nextStatus === 'active' ? 'Mở bán gói tập?' : 'Ngừng bán gói tập?',
                                  message: nextStatus === 'active'
                                    ? `Gói "${p.name}" sẽ hiển thị lại cho hội viên đăng ký.`
                                    : `Hội viên sẽ không đăng ký mới được gói "${p.name}". Gói đang dùng không bị ảnh hưởng.`,
                                  confirmLabel: nextStatus === 'active' ? 'Mở bán' : 'Ngừng bán',
                                  danger: nextStatus !== 'active',
                                });
                                if (confirmed) {
                                  void run(
                                    () => catalogApi.setPackageStatus(p.id, nextStatus),
                                    `Đã chuyển gói "${p.name}" sang ${label}.`
                                  );
                                }
                              }}
                            >
                              {p.status === 'active' ? 'Ngừng bán' : 'Mở bán'}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              disabled={isSubmitting}
                              onClick={() => void remove('gói tập', p.name, () => catalogApi.deletePackage(p.id))}
                            >
                              Xóa
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </>
              )}
            </table>
          </div>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
