import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Select } from '../../shared/ui/Select';
import { Modal } from '../../shared/ui/Modal';
import { useConfirm } from '../../shared/ui/ConfirmDialog';
import { toast } from '../../shared/ui/toast';
import { errorMessage } from '../../shared/lib/errorMessage';
import { catalogApi, type Room } from './catalogApi';
import { equipmentApi, type Equipment, type EquipmentInput } from './equipmentApi';

const STATUS_LABEL: Record<string, { label: string; badgeClass: string }> = {
  active: { label: 'Đang hoạt động', badgeClass: 'badge-success' },
  maintenance: { label: 'Đang bảo trì', badgeClass: 'badge-warning' },
  broken: { label: 'Hỏng hóc', badgeClass: 'badge-danger' },
  retired: { label: 'Ngừng sử dụng', badgeClass: 'badge-secondary' },
};

const CATEGORIES = ['Tất cả', 'Cardio', 'Strength', 'Free Weights', 'Diagnostic', 'Khác'];

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

export function ManagerEquipmentPage() {
  const [confirm, confirmDialog] = useConfirm();
  const [items, setItems] = useState<Equipment[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [areaTab, setAreaTab] = useState<'ALL' | 'STANDARD' | 'VIP' | 'OTHER'>('ALL');
  const [filterRoom, setFilterRoom] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('Tất cả');

  // Modal editor
  const [editing, setEditing] = useState<{ id: number | null; form: FormState } | null>(null);
  const [formError, setFormError] = useState('');
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
      setError(errorMessage(err, 'Không thể tải danh sách máy móc thiết bị.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const isVipItem = (item: Equipment) => {
    const r = rooms.find((room) => room.id === item.roomId);
    const roomName = (item.roomName || r?.name || '').toLowerCase();
    return (
      (r && r.tier === 'PLATINUM') ||
      roomName.includes('vip') ||
      (item.code && item.code.toLowerCase().includes('vip'))
    );
  };

  const isStandardGymItem = (item: Equipment) => {
    const r = rooms.find((room) => room.id === item.roomId);
    const roomName = (item.roomName || r?.name || '').toLowerCase();
    return (
      !isVipItem(item) &&
      (roomName.includes('tiêu chuẩn') || roomName.includes('gym'))
    );
  };

  const filteredItems = items.filter((item) => {
    if (areaTab === 'STANDARD' && !isStandardGymItem(item)) return false;
    if (areaTab === 'VIP' && !isVipItem(item)) return false;
    if (areaTab === 'OTHER' && (isStandardGymItem(item) || isVipItem(item))) return false;

    if (filterRoom && String(item.roomId ?? '') !== filterRoom) return false;
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
  const otherAreaCount = totalQuantity - standardGymCount - vipGymCount;

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
      // Default to standard or vip room if currently filtered
      let defaultRoomId = '';
      if (areaTab === 'VIP') {
        const vip = rooms.find((r) => r.tier === 'PLATINUM' || r.name.toLowerCase().includes('vip'));
        if (vip) defaultRoomId = String(vip.id);
      } else if (areaTab === 'STANDARD') {
        const std = rooms.find((r) => r.name.toLowerCase().includes('tiêu chuẩn'));
        if (std) defaultRoomId = String(std.id);
      }
      setEditing({ id: null, form: { ...emptyForm(), roomId: defaultRoomId } });
    }
  };

  const setFormField = (field: keyof FormState, value: string) => {
    setFormError('');
    if (editing) {
      setEditing({
        ...editing,
        form: { ...editing.form, [field]: value },
      });
    }
  };

  const handleQuickStatusChange = async (item: Equipment, newStatus: Equipment['status']) => {
    if (item.status === newStatus) return;
    try {
      await equipmentApi.updateStatus(item.id, newStatus);
      toast(`Đã chuyển trạng thái máy "${item.name}" sang ${STATUS_LABEL[newStatus]?.label ?? newStatus}`, 'success');
      await loadData();
    } catch (err) {
      toast(errorMessage(err, 'Không thể cập nhật trạng thái máy.'), 'error');
    }
  };

  const handleDelete = async (item: Equipment) => {
    const ok = await confirm({
      title: 'Xóa thiết bị máy móc?',
      message: `Bạn có chắc chắn muốn xóa "${item.name}" (${item.code || 'Chưa có mã'}) khỏi danh sách máy móc phòng gym?`,
      confirmLabel: 'Xóa thiết bị',
      danger: true,
    });
    if (!ok) return;

    try {
      await equipmentApi.delete(item.id);
      toast(`Đã xóa thiết bị "${item.name}" thành công.`, 'success');
      await loadData();
    } catch (err) {
      toast(errorMessage(err, 'Không thể xóa thiết bị.'), 'error');
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
      roomId: f.roomId ? parseInt(f.roomId, 10) : undefined,
      quantity: qty,
      status: f.status,
      purchaseDate: f.purchaseDate || undefined,
      maintenanceDate: f.maintenanceDate || undefined,
      note: f.note.trim() || undefined,
    };

    try {
      await equipmentApi.save(editing.id, payload);
      toast(editing.id ? `Đã cập nhật máy "${payload.name}" thành công.` : `Đã thêm mới thiết bị "${payload.name}" thành công.`, 'success');
      setEditing(null);
      await loadData();
    } catch (err) {
      setFormError(errorMessage(err, 'Lưu thiết bị thất bại. Vui lòng kiểm tra lại.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const vipRooms = rooms.filter((r) => r.tier === 'PLATINUM' || r.name.toLowerCase().includes('vip'));
  const standardGymRooms = rooms.filter((r) => !vipRooms.includes(r) && (r.name.toLowerCase().includes('tiêu chuẩn') || r.name.toLowerCase().includes('gym')));
  const otherRooms = rooms.filter((r) => !vipRooms.includes(r) && !standardGymRooms.includes(r));

  return (
    <div className="portal-page">
      <PageHeader
        eyebrow="Vận hành cơ sở vật chất"
        title="Quản lý máy móc & thiết bị phòng gym"
        subtitle="Quản lý chi tiết danh mục thiết bị, phân bổ khu vực Gym Tiêu chuẩn và Gym VIP Platinum"
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => openEditor(null)}
          >
            + Thêm thiết bị máy mới
          </button>
        }
      />

      {/* Area Highlights: Tiêu chuẩn vs VIP */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div
          className="portal-card"
          style={{
            padding: '18px 22px',
            borderLeft: '5px solid #0284c7',
            background: areaTab === 'STANDARD' ? 'rgba(2, 132, 199, 0.08)' : undefined,
            cursor: 'pointer',
          }}
          onClick={() => {
            setAreaTab(areaTab === 'STANDARD' ? 'ALL' : 'STANDARD');
            setFilterRoom('');
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              🏋️ Khu vực Gym Tiêu chuẩn
            </span>
            <span style={{ fontSize: '0.78rem', background: '#e0f2fe', color: '#0284c7', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
              Mọi hội viên
            </span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-text)', marginTop: 6 }}>
            {standardGymCount} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>thiết bị máy</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            Tầng 1 - Khu Gym Chính • Máy chạy, xe đạp, Smith, tạ tay
          </div>
        </div>

        <div
          className="portal-card"
          style={{
            padding: '18px 22px',
            borderLeft: '5px solid #f59e0b',
            background: areaTab === 'VIP' ? 'rgba(245, 158, 11, 0.08)' : undefined,
            cursor: 'pointer',
          }}
          onClick={() => {
            setAreaTab(areaTab === 'VIP' ? 'ALL' : 'VIP');
            setFilterRoom('');
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              👑 Khu vực Gym VIP Platinum
            </span>
            <span style={{ fontSize: '0.78rem', background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
              Đặc quyền Platinum
            </span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#d97706', marginTop: 6 }}>
            {vipGymCount} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>thiết bị máy cao cấp</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            Tầng 2 - Khu VIP • Technogym Artis, Kinesis One, InBody 770
          </div>
        </div>
      </div>

      {/* Metrics overview */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <div className="portal-card" style={{ padding: '16px 20px' }}>
          <div className="muted" style={{ fontSize: '0.85rem' }}>Tổng số máy móc</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: 4 }}>
            {totalQuantity} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>máy ({items.length} loại)</span>
          </div>
        </div>
        <div className="portal-card" style={{ padding: '16px 20px' }}>
          <div className="muted" style={{ fontSize: '0.85rem' }}>Đang hoạt động tốt</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-success, #22c55e)', marginTop: 4 }}>
            {activeCount} <span style={{ fontSize: '1rem', fontWeight: 500 }}>máy</span>
          </div>
        </div>
        <div className="portal-card" style={{ padding: '16px 20px' }}>
          <div className="muted" style={{ fontSize: '0.85rem' }}>Đang bảo trì định kỳ</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-warning, #f59e0b)', marginTop: 4 }}>
            {maintenanceCount} <span style={{ fontSize: '1rem', fontWeight: 500 }}>máy</span>
          </div>
        </div>
        <div className="portal-card" style={{ padding: '16px 20px' }}>
          <div className="muted" style={{ fontSize: '0.85rem' }}>Hỏng hóc cần xử lý</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-danger, #ef4444)', marginTop: 4 }}>
            {brokenCount} <span style={{ fontSize: '1rem', fontWeight: 500 }}>máy</span>
          </div>
        </div>
      </div>

      {/* Quick classification tabs: VIP vs Tiêu chuẩn */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--color-text-muted)', marginRight: 4 }}>
          Phân loại khu vực:
        </span>
        <button
          type="button"
          className={`btn-sm ${areaTab === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setAreaTab('ALL'); setFilterRoom(''); }}
          style={{ padding: '6px 16px', borderRadius: 20, fontWeight: 600 }}
        >
          Tất cả máy ({totalQuantity})
        </button>
        <button
          type="button"
          className={`btn-sm ${areaTab === 'STANDARD' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setAreaTab('STANDARD'); setFilterRoom(''); }}
          style={{
            padding: '6px 16px',
            borderRadius: 20,
            fontWeight: 600,
            background: areaTab === 'STANDARD' ? '#0284c7' : undefined,
            color: areaTab === 'STANDARD' ? '#ffffff' : undefined,
          }}
        >
          🏋️ Gym Tiêu chuẩn ({standardGymCount} máy)
        </button>
        <button
          type="button"
          className={`btn-sm ${areaTab === 'VIP' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setAreaTab('VIP'); setFilterRoom(''); }}
          style={{
            padding: '6px 16px',
            borderRadius: 20,
            fontWeight: 700,
            background: areaTab === 'VIP' ? '#d97706' : '#fffbeb',
            color: areaTab === 'VIP' ? '#ffffff' : '#b45309',
            borderColor: '#f59e0b',
          }}
        >
          👑 Gym VIP Platinum ({vipGymCount} máy)
        </button>
        {otherAreaCount > 0 && (
          <button
            type="button"
            className={`btn-sm ${areaTab === 'OTHER' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setAreaTab('OTHER'); setFilterRoom(''); }}
            style={{ padding: '6px 16px', borderRadius: 20, fontWeight: 500 }}
          >
            Khu vực khác ({otherAreaCount})
          </button>
        )}
      </div>

      {/* Filter toolbar */}
      <div className="portal-card" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="portal-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Phòng chi tiết:</span>
          <Select
            className="portal-select"
            value={filterRoom}
            onChange={(e) => {
              setFilterRoom(e.target.value);
              setAreaTab('ALL');
            }}
            style={{ minWidth: 230 }}
          >
            <option value="">Tất cả phòng tập</option>
            {vipRooms.length > 0 && (
              <optgroup label="-- 👑 KHU VỰC GYM VIP (PLATINUM) --">
                {vipRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    👑 {r.name} (VIP Platinum)
                  </option>
                ))}
              </optgroup>
            )}
            {standardGymRooms.length > 0 && (
              <optgroup label="-- 🏋️ KHU VỰC GYM TIÊU CHUẨN --">
                {standardGymRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    🏋️ {r.name} (Tiêu chuẩn)
                  </option>
                ))}
              </optgroup>
            )}
            {otherRooms.length > 0 && (
              <optgroup label="-- 🏊 CÁC PHÒNG BỘ MÔN KHÁC --">
                {otherRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="portal-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Trạng thái:</span>
          <Select
            className="portal-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ minWidth: 160 }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="maintenance">Đang bảo trì</option>
            <option value="broken">Hỏng hóc</option>
            <option value="retired">Ngừng sử dụng</option>
          </Select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="portal-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Nhóm máy:</span>
          <Select
            className="portal-select"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{ minWidth: 160 }}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </Select>
        </div>

        {(areaTab !== 'ALL' || filterRoom || filterStatus || filterCategory !== 'Tất cả') && (
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => { setAreaTab('ALL'); setFilterRoom(''); setFilterStatus(''); setFilterCategory('Tất cả'); }}
          >
            Xóa bộ lọc
          </button>
        )}
      </div>

      {/* Main Table */}
      {error && (
        <div className="portal-alert" role="alert" style={{ marginBottom: 16 }}>
          <span>{error}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void loadData()}>Thử lại</button>
        </div>
      )}

      {loading ? (
        <div className="portal-card" aria-busy="true">
          <div style={{ display: 'grid', gap: 12 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="portal-skeleton" style={{ height: 50, borderRadius: 8 }} />
            ))}
          </div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="portal-card">
          <div className="portal-state">
            <h3 className="portal-state__title">Không tìm thấy thiết bị nào</h3>
            <p style={{ color: 'var(--color-text-muted)' }}>
              Chưa có máy móc thiết bị nào phù hợp với bộ lọc hoặc cơ sở dữ liệu đang trống.
            </p>
            <button type="button" className="btn-primary" onClick={() => openEditor(null)}>
              Thêm thiết bị mới
            </button>
          </div>
        </div>
      ) : (
        <div className="portal-card portal-card--flush">
          <div className="portal-table-wrapper">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Tên thiết bị & Mã máy</th>
                  <th>Phân loại khu vực Gym</th>
                  <th>Nhóm máy</th>
                  <th>Số lượng</th>
                  <th>Trạng thái</th>
                  <th>Hạn bảo trì</th>
                  <th className="actions">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const vip = isVipItem(item);
                  const standard = isStandardGymItem(item);

                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        {item.code && <div className="muted" style={{ fontSize: '0.82rem' }}>Mã: {item.code}</div>}
                        {item.note && <div className="muted" style={{ fontSize: '0.78rem', fontStyle: 'italic' }}>{item.note}</div>}
                      </td>
                      <td>
                        {vip ? (
                          <div>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: '#fef3c7',
                              color: '#92400e',
                              padding: '3px 8px',
                              borderRadius: 4,
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              border: '1px solid #fde68a',
                            }}>
                              👑 GYM VIP (PLATINUM)
                            </span>
                            <div className="muted" style={{ fontSize: '0.8rem', marginTop: 3 }}>
                              {item.roomName || 'Phòng Gym VIP'}
                            </div>
                          </div>
                        ) : standard ? (
                          <div>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: '#e0f2fe',
                              color: '#0369a1',
                              padding: '3px 8px',
                              borderRadius: 4,
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              border: '1px solid #bae6fd',
                            }}>
                              🏋️ GYM TIÊU CHUẨN
                            </span>
                            <div className="muted" style={{ fontSize: '0.8rem', marginTop: 3 }}>
                              {item.roomName || 'Phòng Gym Tiêu chuẩn'}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="badge badge-secondary">{item.roomName || 'Chưa xếp phòng'}</span>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-secondary">{item.category || 'Chung'}</span>
                      </td>
                      <td>
                        <strong>{item.quantity}</strong> cái
                      </td>
                      <td>
                        <Select
                          className="portal-select"
                          value={item.status}
                          onChange={(e) => void handleQuickStatusChange(item, e.target.value as Equipment['status'])}
                          style={{ fontSize: '0.85rem', padding: '4px 8px', height: 'auto', minWidth: 140 }}
                        >
                          <option value="active">🟢 Đang hoạt động</option>
                          <option value="maintenance">🟡 Đang bảo trì</option>
                          <option value="broken">🔴 Hỏng hóc</option>
                          <option value="retired">⚪ Ngừng dùng</option>
                        </Select>
                      </td>
                      <td>
                        {item.maintenanceDate ? (
                          <span style={{ fontSize: '0.88rem' }}>{item.maintenanceDate}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => openEditor(item.id, item)}
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => void handleDelete(item)}
                        >
                          Xóa
                        </button>
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
          title={editing.id ? 'Chỉnh sửa thiết bị máy móc' : 'Thêm thiết bị máy móc mới'}
          onClose={() => !isSubmitting && setEditing(null)}
        >
          <form onSubmit={(e) => void handleSubmit(e)} className="portal-form">
            {formError && (
              <div className="portal-alert portal-alert--error" role="alert" style={{ marginBottom: 16 }}>
                {formError}
              </div>
            )}

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="eq-name">Tên máy móc / Thiết bị *</label>
              <input
                id="eq-name"
                className="portal-input"
                type="text"
                required
                placeholder="Vd: Máy chạy bộ Technogym Artis, Giàn tạ Smith..."
                value={editing.form.name}
                onChange={(e) => setFormField('name', e.target.value)}
              />
            </div>

            <div className="grid-2">
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="eq-code">Mã thiết bị / Serial</label>
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
                <label className="portal-label" htmlFor="eq-cat">Nhóm thiết bị</label>
                <Select
                  id="eq-cat"
                  className="portal-select"
                  value={editing.form.category}
                  onChange={(e) => setFormField('category', e.target.value)}
                >
                  <option value="Cardio">Cardio (Chạy, Đạp xe, Trượt tuyết)</option>
                  <option value="Strength">Strength (Kháng lực, Giàn khối)</option>
                  <option value="Free Weights">Free Weights (Tạ tay, Đòn gánh)</option>
                  <option value="Diagnostic">Diagnostic (Đo chỉ số InBody)</option>
                  <option value="Recovery">Recovery (Giãn cơ, Phục hồi)</option>
                  <option value="Khác">Khác</option>
                </Select>
              </div>
            </div>

            <div className="grid-2">
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="eq-room">Khu vực phòng tập lắp đặt *</label>
                <Select
                  id="eq-room"
                  className="portal-select"
                  value={editing.form.roomId}
                  onChange={(e) => setFormField('roomId', e.target.value)}
                >
                  <option value="">-- Kho tổng / Chưa xếp phòng --</option>
                  {vipRooms.length > 0 && (
                    <optgroup label="-- 👑 KHU VỰC GYM VIP (PLATINUM) --">
                      {vipRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          👑 {r.name} (VIP Platinum)
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {standardGymRooms.length > 0 && (
                    <optgroup label="-- 🏋️ KHU VỰC GYM TIÊU CHUẨN --">
                      {standardGymRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          🏋️ {r.name} (Tiêu chuẩn)
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {otherRooms.length > 0 && (
                    <optgroup label="-- 🏊 CÁC PHÒNG BỘ MÔN KHÁC --">
                      {otherRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              </div>

              <div className="portal-form-group">
                <label className="portal-label" htmlFor="eq-qty">Số lượng *</label>
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
                <label className="portal-label" htmlFor="eq-status">Trạng thái vận hành</label>
                <Select
                  id="eq-status"
                  className="portal-select"
                  value={editing.form.status}
                  onChange={(e) => setFormField('status', e.target.value)}
                >
                  <option value="active">Đang hoạt động tốt</option>
                  <option value="maintenance">Đang bảo trì định kỳ</option>
                  <option value="broken">Hỏng hóc cần sửa chữa</option>
                  <option value="retired">Ngừng sử dụng / Thanh lý</option>
                </Select>
              </div>

              <div className="portal-form-group">
                <label className="portal-label" htmlFor="eq-maint-date">Ngày bảo trì tiếp theo</label>
                <input
                  id="eq-maint-date"
                  className="portal-input"
                  type="date"
                  value={editing.form.maintenanceDate}
                  onChange={(e) => setFormField('maintenanceDate', e.target.value)}
                />
              </div>
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="eq-note">Ghi chú kỹ thuật / bảo hành</label>
              <textarea
                id="eq-note"
                className="portal-textarea"
                rows={2}
                placeholder="Vd: Bảo hành chính hãng 3 năm, thay dây cáp định kỳ tháng 12..."
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
                Hủy
              </button>
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Đang lưu...' : 'Lưu thiết bị'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirmDialog}
    </div>
  );
}
