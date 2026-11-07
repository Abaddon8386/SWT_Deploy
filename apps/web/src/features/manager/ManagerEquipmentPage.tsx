import { staffTranslation, useStaffI18n, type StaffMessage, staffMessage, staffError as errorMessage, staffNotify as notify } from '../operations/staffI18n';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Select } from '../../shared/ui/Select';
import { Modal } from '../../shared/ui/Modal';
import { useConfirm } from '../../shared/ui/ConfirmDialog';
import { catalogApi, type Room } from './catalogApi';
import { equipmentApi, type Equipment, type EquipmentInput } from './equipmentApi';

import { DatePicker } from '../../shared/ui/DatePicker';
const STATUS_LABEL: Record<string, { label: string; badgeClass: string }> = {
  active: { label: 'Đang hoạt động', badgeClass: 'badge-success' },
  maintenance: { label: 'Đang bảo trì', badgeClass: 'badge-warning' },
  broken: { label: 'Hỏng hóc', badgeClass: 'badge-danger' },
  retired: { label: 'Ngừng sử dụng', badgeClass: 'badge-secondary' },
};

const CATEGORIES = ['Tất cả', 'Cardio', 'Strength', 'Free Weights', 'Diagnostic', 'Recovery', 'Khác'];

interface FormState {
  name: string;
  code: string;
  category: string;
  roomId: string;
  quantity: string;
  status: string;
  purchaseDate: string;
  maintenanceDate: string;
  note: string;
}

const emptyForm = (): FormState => ({
  name: '',
  code: '',
  category: 'Cardio',
  roomId: '',
  quantity: '1',
  status: 'active',
  purchaseDate: '',
  maintenanceDate: '',
  note: '',
});

const isVipGymRoom = (room: Room) => room.name.toLowerCase().includes('gym') &&
  (room.tier === 'PLATINUM' || room.name.toLowerCase().includes('vip'));
const isStandardGymRoom = (room: Room) => room.name.toLowerCase().includes('gym') && !isVipGymRoom(room);

export function ManagerEquipmentPage() {
  const { t } = useStaffI18n();
  const [confirm, confirmDialog] = useConfirm();
  const [items, setItems] = useState<Equipment[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<StaffMessage>('');

  // Filters (gộp phân loại khu vực & sort chi tiết phòng tập)
  const [filterRoom, setFilterRoom] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('Tất cả');

  // Modal editor
  const [editing, setEditing] = useState<{ id: number | null; form: FormState } | null>(null);
  const [formError, setFormError] = useState<StaffMessage>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [eqList, roomList] = await Promise.all([
        equipmentApi.list(),
        catalogApi.rooms(),
      ]);
      setItems(eqList);
      setRooms(roomList);
    } catch (err) {
      setItems([]);
      setRooms([]);
      setError(errorMessage(err, 'Không thể tải danh sách máy móc thiết bị.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const isVipItem = (item: Equipment) => {
    return rooms.some(room => room.id === item.roomId && isVipGymRoom(room));
  };

  const isStandardGymItem = (item: Equipment) =>
    rooms.some(room => room.id === item.roomId && isStandardGymRoom(room));

  const filteredItems = items.filter((item) => {
    if (filterRoom === 'STANDARD' && !isStandardGymItem(item)) return false;
    if (filterRoom === 'VIP' && !isVipItem(item)) return false;
    if (!['ALL', 'STANDARD', 'VIP'].includes(filterRoom) && String(item.roomId) !== filterRoom) return false;
    if (filterStatus && item.status !== filterStatus) return false;
    if (filterCategory !== 'Tất cả' && item.category !== filterCategory) return false;
    return true;
  });

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const activeCount = items.filter((i) => i.status === 'active').reduce((sum, i) => sum + i.quantity, 0);
  const maintenanceCount = items.filter((i) => i.status === 'maintenance').reduce((sum, i) => sum + i.quantity, 0);
  const brokenCount = items.filter((i) => i.status === 'broken').reduce((sum, i) => sum + i.quantity, 0);

  const standardGymCount = items.filter(isStandardGymItem).reduce((sum, i) => sum + i.quantity, 0);
  const vipGymCount = items.filter(isVipItem).reduce((sum, i) => sum + i.quantity, 0);

  const openEditor = (id: number | null, item?: Equipment) => {
    setFormError('');
    if (item) {
      setEditing({
        id,
        form: {
          name: item.name,
          code: item.code ?? '',
          category: item.category ?? 'Cardio',
          roomId: item.roomId != null ? String(item.roomId) : '',
          quantity: String(item.quantity ?? 1),
          status: item.status,
          purchaseDate: item.purchaseDate ?? '',
          maintenanceDate: item.maintenanceDate ?? '',
          note: item.note ?? '',
        },
      });
    } else {
      const defaultRoom = filterRoom === 'VIP'
        ? rooms.find(isVipGymRoom)
        : filterRoom === 'STANDARD' ? rooms.find(isStandardGymRoom) : rooms.find(room => String(room.id) === filterRoom);
      setEditing({ id: null, form: { ...emptyForm(), roomId: defaultRoom ? String(defaultRoom.id) : '' } });
    }
  };

  const handleSelectTier = (mode: 'STANDARD' | 'VIP') => {
    const room = rooms.find(mode === 'VIP' ? isVipGymRoom : isStandardGymRoom);
    if (room) setFormField('roomId', String(room.id));
  };

  const setFormField = (field: keyof FormState, value: string) => {
    setFormError('');
    setEditing(current => current ? { ...current, form: { ...current.form, [field]: value } } : current);
  };

  const handleQuickStatusChange = async (item: Equipment, newStatus: Equipment['status']) => {
    if (item.status === newStatus) return;
    try {
      await equipmentApi.updateStatus(item.id, newStatus);
      notify(staffMessage(`Đã chuyển trạng thái máy "${item.name}" sang ${STATUS_LABEL[newStatus]?.label ?? newStatus}`, `Changed equipment status for "${item.name}" sang ${STATUS_LABEL[newStatus]?.label ?? newStatus}`), 'success');
      await loadData();
    } catch (err) {
      notify(errorMessage(err, 'Không thể cập nhật trạng thái máy.'), 'error');
    }
  };

  const handleDelete = async (item: Equipment) => {
    const ok = await confirm({
      title: staffMessage('Xóa thiết bị máy móc?', staffTranslation('Xóa thiết bị máy móc?')),
      message: staffMessage(`Bạn có chắc chắn muốn xóa "${item.name}" (${item.code || 'Chưa có mã'}) khỏi danh sách máy móc phòng gym?`, `Are you sure you want to delete "${item.name}" (${item.code || 'No code'}) from the gym equipment list?`),
      confirmLabel: staffMessage('Xóa thiết bị', staffTranslation('Xóa thiết bị')),
      danger: true,
    });
    if (!ok) return;

    try {
      await equipmentApi.delete(item.id);
      notify(staffMessage(`Đã xóa thiết bị "${item.name}" thành công.`, `Deleted equipment "${item.name}" successfully.`), 'success');
      await loadData();
    } catch (err) {
      notify(errorMessage(err, 'Không thể xóa thiết bị.'), 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || isSubmitting) return;

    const f = editing.form;
    if (!f.name.trim()) {
      setFormError('Vui lòng nhập tên thiết bị.');
      return;
    }
    const qty = parseInt(f.quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      setFormError('Số lượng thiết bị phải là số dương.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    const payload: EquipmentInput = {
      name: f.name.trim(),
      code: f.code.trim() || undefined,
      category: f.category,
      roomId: f.roomId ? Number(f.roomId) : null,
      quantity: qty,
      status: f.status,
      purchaseDate: f.purchaseDate || undefined,
      maintenanceDate: f.maintenanceDate || undefined,
      note: f.note.trim() || undefined,
    };

    try {
      await equipmentApi.save(editing.id, payload);
      notify(editing.id ? staffMessage(`Đã cập nhật máy "${payload.name}" thành công.`, `Updated equipment "${payload.name}" successfully.`) : staffMessage(`Đã thêm mới thiết bị "${payload.name}" thành công.`, `Added equipment "${payload.name}" successfully.`), 'success');
      setEditing(null);
      await loadData();
    } catch (err) {
      setFormError(errorMessage(err, 'Lưu thiết bị thất bại. Vui lòng kiểm tra lại.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const vipRooms = rooms.filter(isVipGymRoom);
  const standardGymRooms = rooms.filter(isStandardGymRoom);

  return (
    <div data-i18n-managed className="portal-container">
      <PageHeader
        eyebrow={t("Vận hành cơ sở vật chất")}
        title={t("Quản lý máy móc & thiết bị phòng gym")}
        actions={
          <button
            type="button"
            className="btn-primary"
            disabled={loading || !!error}
            onClick={() => openEditor(null)}
          >
            {t("Thêm thiết bị máy mới")}</button>
        }
      />

      {/* Area Highlights: Tiêu chuẩn vs VIP */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
        <button
          type="button"
          className="portal-card"
          style={{
            textAlign: 'left',
            font: 'inherit',
            color: 'inherit',
            padding: '18px 22px',
            borderLeft: '5px solid var(--portal-salmon)',
            background: filterRoom === 'STANDARD' ? 'var(--portal-tint)' : undefined,
            cursor: 'pointer',
          }}
          aria-pressed={filterRoom === 'STANDARD'}
          onClick={() => {
            setFilterRoom(filterRoom === 'STANDARD' ? 'ALL' : 'STANDARD');
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--portal-salmon)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t("Khu vực Gym Tiêu chuẩn")}</span>
            <span style={{ fontSize: '0.78rem', background: 'var(--portal-surface)', color: 'var(--portal-salmon)', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
              {t("Mọi hội viên")}</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text)', marginTop: 6 }}>
            {standardGymCount} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>{t("thiết bị máy")}</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            {t("Tầng 1 - Khu Gym Chính • Máy chạy, xe đạp, Smith, tạ tay")}</div>
        </button>

        <button
          type="button"
          className="portal-card"
          style={{
            textAlign: 'left',
            font: 'inherit',
            color: 'inherit',
            padding: '18px 22px',
            borderLeft: '5px solid var(--portal-salmon)',
            background: filterRoom === 'VIP' ? 'var(--portal-tint)' : undefined,
            cursor: 'pointer',
          }}
          aria-pressed={filterRoom === 'VIP'}
          onClick={() => {
            setFilterRoom(filterRoom === 'VIP' ? 'ALL' : 'VIP');
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--portal-salmon)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t("Khu vực Gym VIP Platinum")}</span>
            <span style={{ fontSize: '0.78rem', background: 'var(--portal-surface)', color: 'var(--portal-salmon)', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
              {t("Đặc quyền Platinum")}</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--portal-salmon)', marginTop: 6 }}>
            {vipGymCount} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>{t("thiết bị máy cao cấp")}</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            {t("Tầng 2 - Khu VIP • Technogym Artis, Kinesis One, InBody 770")}</div>
        </button>
      </div>

      {/* Metrics overview */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <div className="portal-card" style={{ padding: '16px 20px' }}>
          <div className="muted" style={{ fontSize: '0.85rem' }}>{t("Tổng số máy móc")}</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: 4 }}>
            {totalQuantity} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>{t("máy (")}{items.length} {t(" loại)")}</span>
          </div>
        </div>
        <div className="portal-card" style={{ padding: '16px 20px' }}>
          <div className="muted" style={{ fontSize: '0.85rem' }}>{t("Đang hoạt động tốt")}</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--portal-success)', marginTop: 4 }}>
            {activeCount} <span style={{ fontSize: '1rem', fontWeight: 500 }}>{t("máy")}</span>
          </div>
        </div>
        <div className="portal-card" style={{ padding: '16px 20px' }}>
          <div className="muted" style={{ fontSize: '0.85rem' }}>{t("Đang bảo trì định kỳ")}</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--portal-warning)', marginTop: 4 }}>
            {maintenanceCount} <span style={{ fontSize: '1rem', fontWeight: 500 }}>{t("máy")}</span>
          </div>
        </div>
        <div className="portal-card" style={{ padding: '16px 20px' }}>
          <div className="muted" style={{ fontSize: '0.85rem' }}>{t("Hỏng hóc cần xử lý")}</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--portal-danger)', marginTop: 4 }}>
            {brokenCount} <span style={{ fontSize: '1rem', fontWeight: 500 }}>{t("máy")}</span>
          </div>
        </div>
      </div>

      {/* Filter toolbar: Gộp phân loại phòng và sort chi tiết thành 1 bộ lọc duy nhất */}
      <div className="portal-card" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="portal-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>{t("Phòng tập:")}</span>
          <Select
            className="portal-select"
            aria-label={t("Lọc theo phòng tập")}
            value={filterRoom}
            onChange={(e) => setFilterRoom(e.target.value)}
            style={{ minWidth: 240 }}
          >
            <option value="ALL">{t("Tất cả phòng tập (")}{totalQuantity} {t(" máy)")}</option>
            <option value="STANDARD">{t("Gym Tiêu chuẩn (")}{standardGymCount} {t(" máy)")}</option>
            <option value="VIP">{t("Gym VIP Platinum (")}{vipGymCount} {t(" máy)")}</option>
            {rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
          </Select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="portal-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>{t("Trạng thái:")}</span>
          <Select
            className="portal-select"
            aria-label={t("Lọc theo trạng thái")}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ minWidth: 160 }}
          >
            <option value="">{t("Tất cả trạng thái")}</option>
            <option value="active">{t("Đang hoạt động")}</option>
            <option value="maintenance">{t("Đang bảo trì")}</option>
            <option value="broken">{t("Hỏng hóc")}</option>
            <option value="retired">{t("Ngừng sử dụng")}</option>
          </Select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="portal-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>{t("Nhóm máy:")}</span>
          <Select
            className="portal-select"
            aria-label={t("Lọc theo nhóm máy")}
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{ minWidth: 160 }}
          >
            {CATEGORIES.map((cat) => (
              <option data-i18n-managed key={t(cat)} value={cat}>{cat}</option>
            ))}
          </Select>
        </div>

        {(filterRoom !== 'ALL' || filterStatus || filterCategory !== 'Tất cả') && (
          <button data-i18n-managed
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => { setFilterRoom('ALL'); setFilterStatus(''); setFilterCategory('Tất cả'); }}
          >
            {t("Xóa bộ lọc")}</button>
        )}
      </div>

      {/* Main Table */}
      {error && (
        <div data-i18n-managed className="portal-alert" role="alert" style={{ marginBottom: 16 }}>
          <span>{t(error)}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void loadData()}>{t("Thử lại")}</button>
        </div>
      )}

      {loading ? (
        <div data-i18n-managed className="portal-card" aria-busy="true">
          <div style={{ display: 'grid', gap: 12 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <div data-i18n-managed key={n} className="portal-skeleton" style={{ height: 50, borderRadius: 8 }} />
            ))}
          </div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div data-i18n-managed className="portal-card">
          <div className="portal-state">
            <h3 className="portal-state__title">{t("Không tìm thấy thiết bị nào")}</h3>
            <p style={{ color: 'var(--color-text-muted)' }}>
              {t("Chưa có máy móc thiết bị nào phù hợp với bộ lọc hoặc cơ sở dữ liệu đang trống.")}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" className="btn-primary" disabled={!!error} onClick={() => openEditor(null)}>
                {t("Thêm thiết bị mới")}</button>

            </div>
          </div>
        </div>
      ) : (
        <div data-i18n-managed className="portal-card portal-card--flush">
          <div className="portal-table-wrapper">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>{t("Tên thiết bị & Mã máy")}</th>
                  <th>{t("Phân loại khu vực Gym")}</th>
                  <th>{t("Nhóm máy")}</th>
                  <th>{t("Số lượng")}</th>
                  <th>{t("Trạng thái")}</th>
                  <th>{t("Hạn bảo trì")}</th>
                  <th className="actions">{t("Thao tác")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const vip = isVipItem(item);
                  const standard = isStandardGymItem(item);

                  return (
                    <tr data-i18n-managed key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        {item.code && <div className="muted" style={{ fontSize: '0.82rem' }}>{t("Mã: ")}{item.code}</div>}
                        {item.note && <div className="muted" style={{ fontSize: '0.78rem', fontStyle: 'italic' }}>{item.note}</div>}
                      </td>
                      <td>
                        {vip ? (
                          <div data-i18n-managed>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: 'var(--portal-surface)',
                              color: 'var(--portal-salmon)',
                              padding: '3px 8px',
                              borderRadius: 4,
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              border: '1px solid var(--portal-border)',
                            }}>
                              {t("GYM VIP (PLATINUM)")}</span>
                            <div className="muted" style={{ fontSize: '0.8rem', marginTop: 3 }}>
                              {item.roomName || t('Phòng Gym VIP')}
                            </div>
                          </div>
                        ) : standard ? (
                          <div data-i18n-managed>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: 'var(--portal-surface)',
                              color: 'var(--portal-salmon)',
                              padding: '3px 8px',
                              borderRadius: 4,
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              border: '1px solid var(--portal-border)',
                            }}>
                              {t("GYM TIÊU CHUẨN")}</span>
                            <div className="muted" style={{ fontSize: '0.8rem', marginTop: 3 }}>
                              {item.roomName || t('Phòng Gym Tiêu chuẩn')}
                            </div>
                          </div>
                        ) : (
                          <div data-i18n-managed>
                            <span className="badge badge-secondary">{item.roomName || t('Chưa xếp phòng')}</span>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-secondary">{item.category || 'Chung'}</span>
                      </td>
                      <td>
                        <strong>{item.quantity}</strong> {t(" cái")}</td>
                      <td>
                        <Select
                          className="portal-select"
                          value={item.status}
                          onChange={(e) => void handleQuickStatusChange(item, e.target.value as Equipment['status'])}
                          style={{ fontSize: '0.85rem', padding: '4px 8px', height: 'auto', minWidth: 140 }}
                        >
                          <option value="active">{t("Đang hoạt động")}</option>
                          <option value="maintenance">{t("Đang bảo trì")}</option>
                          <option value="broken">{t("Hỏng hóc")}</option>
                          <option value="retired">{t("Ngừng dùng")}</option>
                        </Select>
                      </td>
                      <td>
                        {item.maintenanceDate ? (
                          <span data-i18n-managed style={{ fontSize: '0.88rem' }}>{item.maintenanceDate}</span>
                        ) : (
                          <span data-i18n-managed className="muted">—</span>
                        )}
                      </td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => openEditor(item.id, item)}
                        >
                          {t("Sửa")}</button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => void handleDelete(item)}
                        >
                          {t("Xóa")}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Editor Modal */}
      {editing && (
        <Modal
          title={editing.id ? t('Chỉnh sửa thiết bị máy móc') : t('Thêm thiết bị máy móc mới')}
          onClose={() => !isSubmitting && setEditing(null)}
          busy={isSubmitting}
        >
          <form onSubmit={(e) => void handleSubmit(e)} className="portal-form">
            {formError && (
              <div data-i18n-managed className="portal-alert portal-alert--error" role="alert" style={{ marginBottom: 16 }}>
                {t(formError)}
              </div>
            )}

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="eq-name">{t("Tên máy móc / Thiết bị *")}</label>
              <input
                id="eq-name"
                className="portal-input"
                type="text"
                required
                placeholder={t("Vd: Máy chạy bộ Technogym Artis, Giàn tạ Smith...")}
                value={editing.form.name}
                onChange={(e) => setFormField('name', e.target.value)}
              />
            </div>

            <div className="grid-2">
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="eq-code">{t("Mã thiết bị / Serial")}</label>
                <input
                  id="eq-code"
                  className="portal-input"
                  type="text"
                  placeholder="Vd: EQ-RUN-01, EQ-VIP-02..."
                  value={editing.form.code}
                  onChange={(e) => setFormField('code', e.target.value)}
                />
              </div>

              <div className="portal-form-group">
                <label className="portal-label" htmlFor="eq-cat">{t("Nhóm thiết bị")}</label>
                <Select
                  id="eq-cat"
                  className="portal-select"
                  value={editing.form.category}
                  onChange={(e) => setFormField('category', e.target.value)}
                >
                  <option value="Cardio">{t("Cardio (Chạy, Đạp xe, Trượt tuyết)")}</option>
                  <option value="Strength">{t("Strength (Kháng lực, Giàn khối)")}</option>
                  <option value="Free Weights">{t("Free Weights (Tạ tay, Đòn gánh)")}</option>
                  <option value="Diagnostic">{t("Diagnostic (Đo chỉ số InBody)")}</option>
                  <option value="Recovery">{t("Recovery (Giãn cơ, Phục hồi)")}</option>
                  <option value="Khác">{t("Khác")}</option>
                </Select>
              </div>
            </div>

            <div className="grid-2">
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="eq-room">{t("Phòng lắp đặt")}</label>
                <Select
                  id="eq-room"
                  className="portal-select"
                  value={editing.form.roomId}
                  onChange={e => setFormField('roomId', e.target.value)}
                  disabled={isSubmitting}
                >
                  <option value="">{t("Chưa xếp phòng")}</option>
                  {rooms.filter(room => !isStandardGymRoom(room) && !isVipGymRoom(room)).map(room => (
                    <option data-i18n-managed key={room.id} value={room.id}>{room.name}</option>
                  ))}
                  {standardGymRooms.map(r => (
                    <option data-i18n-managed key={r.id} value={r.id}>
                      {t("Gym Tiêu chuẩn (")}{r.name})
                    </option>
                  ))}
                  {vipRooms.map(r => (
                    <option data-i18n-managed key={r.id} value={r.id}>
                      {t("Gym VIP Platinum (")}{r.name})
                    </option>
                  ))}
                </Select>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    className={`btn-sm ${standardGymRooms.some(room => String(room.id) === editing.form.roomId) ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '8px 12px', fontWeight: 600 }}
                    aria-pressed={standardGymRooms.some(room => String(room.id) === editing.form.roomId)}
                    disabled={isSubmitting || standardGymRooms.length === 0}
                    onClick={() => handleSelectTier('STANDARD')}
                  >
                    {t("Gym Tiêu chuẩn")}</button>
                  <button
                    type="button"
                    className={`btn-sm ${vipRooms.some(room => String(room.id) === editing.form.roomId) ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '8px 12px', fontWeight: 700 }}
                    aria-pressed={vipRooms.some(room => String(room.id) === editing.form.roomId)}
                    disabled={isSubmitting || vipRooms.length === 0}
                    onClick={() => handleSelectTier('VIP')}
                  >
                    {t("Gym VIP Platinum")}</button>
                </div>
              </div>

              <div className="portal-form-group">
                <label className="portal-label" htmlFor="eq-qty">{t("Số lượng *")}</label>
                <input
                  id="eq-qty"
                  className="portal-input"
                  type="number"
                  min="1"
                  max="999"
                  required
                  value={editing.form.quantity}
                  onChange={(e) => setFormField('quantity', e.target.value)}
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="eq-status">{t("Trạng thái vận hành")}</label>
                <Select
                  id="eq-status"
                  className="portal-select"
                  value={editing.form.status}
                  onChange={(e) => setFormField('status', e.target.value)}
                >
                  <option value="active">{t("Đang hoạt động tốt")}</option>
                  <option value="maintenance">{t("Đang bảo trì định kỳ")}</option>
                  <option value="broken">{t("Hỏng hóc cần sửa chữa")}</option>
                  <option value="retired">{t("Ngừng sử dụng / Thanh lý")}</option>
                </Select>
              </div>

              <div className="portal-form-group">
                <label className="portal-label" htmlFor="eq-maint-date">{t("Ngày bảo trì tiếp theo")}</label>
                <DatePicker
                  id="eq-maint-date"
                  value={editing.form.maintenanceDate}
                  onChange={(e) => setFormField('maintenanceDate', e.target.value)}
                />
              </div>
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="eq-note">{t("Ghi chú kỹ thuật / bảo hành")}</label>
              <textarea
                id="eq-note"
                className="portal-textarea"
                rows={2}
                placeholder={t("Vd: Bảo hành chính hãng 3 năm, thay dây cáp định kỳ tháng 12...")}
                value={editing.form.note}
                onChange={(e) => setFormField('note', e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={isSubmitting}
                onClick={() => setEditing(null)}
              >
                {t("Hủy")}</button>
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? t('Đang lưu...') : t('Lưu thiết bị')}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirmDialog}
    </div>
  );
}
