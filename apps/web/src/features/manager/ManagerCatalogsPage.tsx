import { Select } from '../../shared/ui/Select';
import { useCallback, useEffect, useState } from 'react';
import { catalogApi, type Discipline, type MembershipPackage, type Room } from './catalogApi';
import { Modal } from '../../shared/ui/Modal';
import { toast } from '../../shared/ui/toast';
import { PageHeader } from '../../shared/ui/PageHeader';

type Tab = 'disciplines' | 'rooms' | 'packages';
type Form = Record<string, string>;

const ROOM_STATUS_LABEL = { available: 'Đang hoạt động', maintenance: 'Bảo trì', closed: 'Đã đóng' } as const;
const vnd = (n: number) => `${n.toLocaleString('vi-VN')} đ`;

export function ManagerCatalogsPage() {
  const [tab, setTab] = useState<Tab>('disciplines');
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [packages, setPackages] = useState<MembershipPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ id: number | null; form: Form } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [d, r, p] = await Promise.all([catalogApi.disciplines(), catalogApi.rooms(), catalogApi.packages()]);
      setDisciplines(d);
      setRooms(r);
      setPackages(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh mục.');
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
      await load();
      toast(successMsg, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Thao tác thất bại.';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const emptyForm = (): Form =>
    tab === 'disciplines'
      ? { name: '', description: '' }
      : tab === 'rooms'
        ? { name: '', location: '', capacity: '10', status: 'available' }
        : { name: '', description: '', price: '', durationDays: '30', classCreditLimit: '', status: 'active' };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || isSubmitting) return;
    const { id, form: f } = editing;
    const isNew = id == null;

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
        });
      }
      return catalogApi.savePackage(id, {
        name: f.name.trim(),
        description: f.description.trim(),
        price: Number(f.price),
        durationDays: Number(f.durationDays),
        classCreditLimit: f.classCreditLimit === '' ? null : Number(f.classCreditLimit),
        status: f.status as MembershipPackage['status'],
      });
    }, isNew ? 'Đã thêm mới danh mục thành công!' : 'Đã cập nhật danh mục thành công!');
  };

  const set = (key: string, value: string) => editing && setEditing({ ...editing, form: { ...editing.form, [key]: value } });

  const modalTitle = () => {
    if (!editing) return '';
    const isNew = editing.id == null;
    if (tab === 'disciplines') return isNew ? 'Thêm bộ môn' : 'Chỉnh sửa bộ môn';
    if (tab === 'rooms') return isNew ? 'Thêm phòng tập' : 'Chỉnh sửa phòng tập';
    return isNew ? 'Thêm gói tập' : 'Chỉnh sửa gói tập';
  };

  const rowCount = tab === 'disciplines' ? disciplines.length : tab === 'rooms' ? rooms.length : packages.length;

  return (
    <div className="portal-container">
      <PageHeader
        eyebrow="Quản lý"
        title="Danh mục vận hành"
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setEditing({ id: null, form: emptyForm() })}
          >
            + Thêm mới
          </button>
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

      {/* Accessible Dialog Modal for Adding/Editing */}
      {editing && (
        <Modal title={modalTitle()} onClose={() => !isSubmitting && setEditing(null)}>
          <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="cat-name">Tên hiển thị *</label>
              <input
                id="cat-name"
                className="portal-input"
                type="text"
                required
                autoFocus
                placeholder="Vd: Reformer Core Pilates..."
                value={editing.form.name ?? ''}
                onChange={(e) => set('name', e.target.value)}
              />
            </div>

            {tab === 'rooms' && (
              <>
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

            {tab !== 'rooms' && (
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="cat-desc">Mô tả chi tiết</label>
                <textarea
                  id="cat-desc"
                  className="portal-textarea"
                  rows={3}
                  placeholder="Mô tả công năng hoặc quyền lợi..."
                  value={editing.form.description ?? ''}
                  onChange={(e) => set('description', e.target.value)}
                />
              </div>
            )}

            {tab === 'packages' && (
              <div className="grid-2">
                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="cat-price">Đơn giá (VND) *</label>
                  <input
                    id="cat-price"
                    className="portal-input"
                    type="number"
                    min="0"
                    step="10000"
                    required
                    placeholder="Vd: 3500000"
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
                  placeholder="Vd: 12 hoặc để trống"
                  value={editing.form.classCreditLimit ?? ''}
                  onChange={(e) => set('classCreditLimit', e.target.value)}
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
              onClick={() => setEditing({ id: null, form: emptyForm() })}
            >
              + Thêm mới
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
                      <th className="actions" style={{ width: '120px' }}>Thao tác</th>
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
                            onClick={() => setEditing({ id: d.id, form: { name: d.name, description: d.description ?? '' } })}
                          >
                            Chỉnh sửa
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
                      <th>Vị trí</th>
                      <th>Sức chứa</th>
                      <th>Trạng thái</th>
                      <th className="actions">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((r) => (
                      <tr key={r.id}>
                        <td><strong>{r.name}</strong></td>
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
                              setEditing({
                                id: r.id,
                                form: { name: r.name, location: r.location ?? '', capacity: String(r.capacity), status: r.status },
                              })
                            }
                          >
                            Chỉnh sửa
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
                      <th>Tên gói</th>
                      <th>Giá gói</th>
                      <th>Thời hạn</th>
                      <th>Số buổi</th>
                      <th>Trạng thái</th>
                      <th className="actions">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packages.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          {p.description && <div className="muted">{p.description}</div>}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--portal-salmon)' }}>{vnd(p.price)}</td>
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
                            onClick={() =>
                              setEditing({
                                id: p.id,
                                form: {
                                  name: p.name,
                                  description: p.description ?? '',
                                  price: String(p.price),
                                  durationDays: String(p.durationDays),
                                  classCreditLimit: p.classCreditLimit == null ? '' : String(p.classCreditLimit),
                                  status: p.status,
                                },
                              })
                            }
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => {
                              const nextStatus = p.status === 'active' ? 'inactive' : 'active';
                              const label = nextStatus === 'active' ? 'mở bán' : 'ngừng bán';
                              if (window.confirm(`Bạn có chắc muốn ${label} gói "${p.name}"?`)) {
                                void run(
                                  () => catalogApi.setPackageStatus(p.id, nextStatus),
                                  `Đã chuyển gói "${p.name}" sang ${label}!`
                                );
                              }
                            }}
                          >
                            {p.status === 'active' ? 'Ngừng bán' : 'Mở bán'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
