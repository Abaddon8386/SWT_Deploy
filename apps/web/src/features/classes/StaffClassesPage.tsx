import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentUser } from '../../shared/api/client';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { Modal } from '../../shared/ui/Modal';
import { Select } from '../../shared/ui/Select';
import { DatePicker } from '../../shared/ui/DatePicker';
import { TimePicker } from '../../shared/ui/TimePicker';
import { toast } from '../../shared/ui/toast';
import {
  classesApi,
  type ClassItem,
  type ClassSessionDto,
  type CoachUser,
} from './classesApi';
import type { Discipline, Room } from '../manager/catalogApi';

interface ClassFormData {
  name: string;
  disciplineId: string;
  coachId: string;
  roomId: string;
  capacity: number;
  level: string;
  description: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
}

const getTodayString = () => new Date().toISOString().split('T')[0];

const defaultFormData = (): ClassFormData => ({
  name: '',
  disciplineId: '',
  coachId: '',
  roomId: '',
  capacity: 15,
  level: 'all',
  description: '',
  sessionDate: getTodayString(),
  startTime: '08:00',
  endTime: '09:30',
});

export function StaffClassesPage() {
  const currentUser = getCurrentUser();

  // BR-01: Chỉ CENTER_MANAGER, STAFF và COACH được cấp quyền thấy màn hình
  const hasAccess = useMemo(() => {
    if (!currentUser) return false;
    return (
      currentUser.role === 'MANAGER' ||
      currentUser.role === 'STAFF' ||
      currentUser.role === 'COACH'
    );
  }, [currentUser]);

  // BR-01b: Lễ tân (STAFF) CHỈ ĐƯỢC XEM lịch học - ẩn các nút tạo / sửa lớp
  const canManageClasses = useMemo(() => {
    if (!currentUser) return false;
    return currentUser.role === 'MANAGER';
  }, [currentUser]);

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [sessions, setSessions] = useState<ClassSessionDto[]>([]);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [coaches, setCoaches] = useState<CoachUser[]>([]);

  const [loading, setLoading] = useState(true);
  const [catalogsLoading, setCatalogsLoading] = useState(true);
  const [catalogsError, setCatalogsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [selectedClassDetail, setSelectedClassDetail] = useState<ClassItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ClassFormData>(defaultFormData());
  const [modalError, setModalError] = useState<string | null>(null);
  const [pendingClassId, setPendingClassId] = useState<number | null>(null);
  const [pendingClassSignature, setPendingClassSignature] = useState<string | null>(null);

  // BR-04: Kiểm tra trùng tên lớp học ngay lập tức sau khi nhập (realtime validation)
  const isDuplicateClassName = useMemo(() => {
    const trimmed = formData.name.trim().toLowerCase();
    if (!trimmed) return false;
    return classes.some((c) => c.name.trim().toLowerCase() === trimmed);
  }, [formData.name, classes]);

  // Tải dữ liệu các danh mục phụ trợ (Phòng available, HLV active, Bộ môn)
  const loadCatalogs = useCallback(async () => {
    setCatalogsLoading(true);
    setCatalogsError(null);
    try {
      const [discList, roomList, coachList] = await Promise.all([
        classesApi.getDisciplines(),
        classesApi.getAvailableRooms(),
        classesApi.getActiveCoaches(),
      ]);
      setDisciplines(discList);
      setRooms(roomList);
      setCoaches(coachList);
    } catch (cause) {
      setCatalogsError(cause instanceof Error ? cause.message : 'Không thể tải danh mục tạo lớp học.');
    } finally {
      setCatalogsLoading(false);
    }
  }, []);

  // Tải danh sách lớp học và các buổi học
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [classList, sessionList] = await Promise.all([
        classesApi.getClasses(),
        classesApi.getSessions().catch(() => []),
      ]);
      setClasses(classList);
      setSessions(sessionList);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải danh sách lớp học.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasAccess) {
      void loadCatalogs();
      void loadData();
    }
  }, [hasAccess, loadCatalogs, loadData]);

  // BR-01: Forbidden Guard khi vai trò không hợp lệ
  if (!hasAccess) {
    return (
      <div className="portal-container" data-testid="forbidden-guard">
        <div className="portal-card">
          <div className="portal-state" style={{ padding: '60px 24px' }}>
            <div style={{ fontSize: '2.25rem', fontWeight: 700, color: 'var(--portal-danger, #fca5a5)', marginBottom: '12px' }} role="img" aria-label="Forbidden">
              403
            </div>
            <h2 className="portal-state__title" style={{ fontSize: '1.5rem', marginBottom: '8px' }}>
              403 - Quyền truy cập bị từ chối
            </h2>
            <p style={{ color: 'var(--color-text-muted)', maxWidth: '480px', margin: '0 auto 20px auto' }}>
              Chỉ Quản lý trung tâm (Center Manager) và Nhân viên được cấp quyền mới có thể truy cập và quản lý lớp học.
            </p>
            <a href="/portal" className="btn-secondary">
              Về trang chủ Portal
            </a>
          </div>
        </div>
      </div>
    );
  }

  const handleOpenModal = () => {
    if (!canManageClasses) return;
    setModalError(null);
    setPendingClassId(null);
    setPendingClassSignature(null);
    // Đặt mặc định nếu chưa chọn
    setFormData((prev) => ({
      ...prev,
      disciplineId: prev.disciplineId || (disciplines[0] ? String(disciplines[0].id) : ''),
      roomId: prev.roomId || (rooms[0] ? String(rooms[0].id) : ''),
      coachId: prev.coachId || (coaches[0] ? String(coaches[0].id) : ''),
      sessionDate: prev.sessionDate || getTodayString(),
    }));
    setShowModal(true);
  };

  const handleCloseModal = () => {
    if (isSubmitting) return;
    setModalError(null);
    setPendingClassId(null);
    setPendingClassSignature(null);
    setShowModal(false);
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    // BR-05: Chặn bấm đúp
    if (isSubmitting) return;

    // BR-03: Validate phía Frontend trước khi gửi
    if (!formData.name.trim()) {
      const msg = 'Vui lòng nhập tên lớp học.';
      setModalError(msg);
      toast(msg, 'error');
      return;
    }

    if (isDuplicateClassName) {
      const msg = `Tên lớp học "${formData.name.trim()}" đã tồn tại trong hệ thống. Vui lòng chọn tên khác.`;
      setModalError(msg);
      toast(msg, 'error');
      return;
    }

    if (!formData.disciplineId) {
      const msg = 'Vui lòng chọn bộ môn thể thao.';
      setModalError(msg);
      toast(msg, 'error');
      return;
    }

    if (!formData.coachId) {
      const msg = 'Vui lòng chọn huấn luyện viên phụ trách.';
      setModalError(msg);
      toast(msg, 'error');
      return;
    }

    if (!formData.roomId) {
      const msg = 'Vui lòng chọn phòng tập.';
      setModalError(msg);
      toast(msg, 'error');
      return;
    }

    const capacityNum = Number(formData.capacity);
    if (isNaN(capacityNum) || capacityNum <= 0) {
      const msg = 'Sức chứa tối đa (capacity) phải lớn hơn 0.';
      setModalError(msg);
      toast(msg, 'error');
      return;
    }

    const today = getTodayString();
    if (formData.sessionDate < today) {
      const msg = 'Ngày học không được ở trong quá khứ.';
      setModalError(msg);
      toast(msg, 'error');
      return;
    }

    if (formData.endTime <= formData.startTime) {
      const msg = 'Giờ kết thúc phải sau giờ bắt đầu.';
      setModalError(msg);
      toast(msg, 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const currentClassSignature = JSON.stringify({
        name: formData.name.trim(),
        disciplineId: Number(formData.disciplineId),
        coachId: Number(formData.coachId),
        roomId: Number(formData.roomId),
        capacity: capacityNum,
        level: formData.level,
        description: formData.description.trim() || undefined,
      });

      let targetClassId =
        pendingClassId && pendingClassSignature === currentClassSignature ? pendingClassId : null;

      if (!targetClassId) {
        const createdClass = await classesApi.createClass({
          name: formData.name.trim(),
          disciplineId: Number(formData.disciplineId),
          coachId: Number(formData.coachId),
          roomId: Number(formData.roomId),
          capacity: capacityNum,
          level: formData.level,
          description: formData.description.trim() || undefined,
          sessionDate: formData.sessionDate,
          startTime: formData.startTime,
          endTime: formData.endTime,
        });
        targetClassId = createdClass?.id ?? null;
        if (targetClassId) {
          setPendingClassId(targetClassId);
          setPendingClassSignature(currentClassSignature);
        }
      }

      if (targetClassId && formData.sessionDate && formData.startTime && formData.endTime) {
        await classesApi.createSession({
          classId: targetClassId,
          sessionDate: formData.sessionDate,
          startTime: formData.startTime,
          endTime: formData.endTime,
        });
      }

      toast('Đã tạo lớp học và xếp lịch thành công!', 'success');
      setShowModal(false);
      setFormData(defaultFormData());
      setModalError(null);
      setPendingClassId(null);
      setPendingClassSignature(null);
      await loadData();
    } catch (err: unknown) {
      // BR-04: Bắt lỗi trùng lịch phòng/HLV (P3, error.scheduling.session_conflict)
      // GIỮ NGUYÊN dữ liệu đã nhập trong form (không reset form, không đóng modal)
      const apiErr = err as { code?: string; message?: string; status?: number };
      const isConflict =
        apiErr?.code === 'error.scheduling.session_conflict' ||
        apiErr?.code === 'SCHEDULE_CONFLICT' ||
        apiErr?.status === 409 ||
        (typeof apiErr?.message === 'string' &&
          (apiErr.message.includes('trùng lịch') ||
            apiErr.message.includes('session_conflict') ||
            apiErr.message.includes('khung giờ')));

      const errMessage = isConflict
        ? 'Trùng lịch: Huấn luyện viên hoặc phòng học đã có lịch trong khung giờ này. Vui lòng chọn thời gian khác.'
        : apiErr?.message || 'Có lỗi xảy ra khi tạo lớp học.';

      setModalError(errMessage);
      toast(errMessage, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper tìm tên bộ môn, HLV, phòng hiển thị nếu backend chưa trả kèm
  const getDisciplineName = (cls: ClassItem) => {
    if (cls.disciplineName) return cls.disciplineName;
    const found = disciplines.find((d) => d.id === cls.disciplineId);
    return found ? found.name : `Bộ môn #${cls.disciplineId}`;
  };

  const getCoachName = (cls: ClassItem) => {
    if (cls.coachName) return cls.coachName;
    const found = coaches.find((c) => c.id === cls.coachId);
    return found ? found.fullName : `HLV #${cls.coachId}`;
  };

  const getRoomName = (cls: ClassItem) => {
    if (cls.roomName) return cls.roomName;
    const found = rooms.find((r) => r.id === cls.roomId);
    return found ? found.name : `Phòng #${cls.roomId}`;
  };

  const getClassSchedule = (cls: ClassItem) => {
    if (cls.schedule) return cls.schedule;
    const classSessions = sessions.filter((s) => s.classId === cls.id);
    if (classSessions.length > 0) {
      const first = classSessions[0];
      return `${first.sessionDate} (${first.startTime} - ${first.endTime})`;
    }
    return 'Chưa có lịch';
  };

  return (
    <div className="portal-container">
      <PageHeader
        eyebrow={currentUser?.role === 'STAFF' ? 'Lễ tân' : 'Huấn luyện'}
        title={currentUser?.role === 'STAFF' ? 'Lịch học & danh sách lớp' : 'Quản lý lớp học & xếp lịch'}
        actions={
          canManageClasses ? (
            <button
              type="button"
              className="btn-primary"
              onClick={handleOpenModal}
              data-testid="create-class-button"
            >
              + Tạo lớp học &amp; xếp lịch
            </button>
          ) : undefined
        }
      />

      {/* State 3: Error retry */}
      {error && (
        <div
          className="portal-alert portal-alert--error"
          style={{
            marginBottom: 20,
            padding: '16px 20px',
            backgroundColor: 'var(--portal-raised)',
            border: '1px solid var(--portal-danger, #fca5a5)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
          data-testid="classes-error"
        >
          <div style={{ color: 'var(--portal-danger, #fca5a5)' }}>
            <strong>Lỗi tải dữ liệu:</strong> {error}
          </div>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => void loadData()}
            data-testid="retry-button"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* State 1: Loading skeleton */}
      {loading ? (
        <div className="portal-card portal-card--flush" data-testid="classes-skeleton">
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'grid', gap: '16px' }}>
              {[1, 2, 3, 4].map((idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1.5fr 1.5fr 1.5fr 1fr 1fr',
                    gap: '12px',
                    alignItems: 'center',
                    padding: '14px 0',
                    borderBottom: '1px solid rgba(0,0,0,0.06)',
                  }}
                >
                  <div style={{ height: 20, backgroundColor: 'var(--color-border-subtle)', borderRadius: 4 }} />
                  <div style={{ height: 20, backgroundColor: 'var(--color-border-subtle)', borderRadius: 4 }} />
                  <div style={{ height: 20, backgroundColor: 'var(--color-border-subtle)', borderRadius: 4 }} />
                  <div style={{ height: 20, backgroundColor: 'var(--color-border-subtle)', borderRadius: 4 }} />
                  <div style={{ height: 20, backgroundColor: 'var(--color-border-subtle)', borderRadius: 4 }} />
                  <div style={{ height: 20, backgroundColor: 'var(--color-border-subtle)', borderRadius: 4 }} />
                  <div style={{ height: 28, backgroundColor: 'var(--color-border-subtle)', borderRadius: 4 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : classes.length === 0 && !error ? (
        /* State 2: Empty list */
        <div className="portal-card" data-testid="classes-empty">
          <div className="portal-state" style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--portal-salmon)', marginBottom: 12 }}>LỚP HỌC</div>
            <h3 className="portal-state__title" style={{ marginBottom: 6 }}>
              Chưa có lớp học nào
            </h3>
            <p style={{ color: 'var(--color-text-muted)', maxWidth: 460, margin: '0 auto 16px auto' }}>
              Hiện chưa có lớp học nào trong hệ thống. Hãy tạo lớp học mới để bắt đầu sắp xếp lịch tập cho hội viên và huấn luyện viên.
            </p>
            {canManageClasses && (
              <button type="button" className="btn-primary" onClick={handleOpenModal}>
                + Tạo lớp học đầu tiên
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Danh sách lớp học */
        <div className="portal-card portal-card--flush" data-testid="classes-table-wrapper">
          <div className="portal-table-wrapper">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Tên lớp học</th>
                  <th>Bộ môn</th>
                  <th>Huấn luyện viên</th>
                  <th>Phòng tập</th>
                  <th>Lịch học</th>
                  <th>Sức chứa</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((cls) => (
                  <tr key={cls.id}>
                    <td>
                      <strong>{cls.name}</strong>
                      <div className="muted" style={{ marginTop: 2, fontSize: '0.8rem' }}>
                        ID: CLS-{cls.id}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-info">{getDisciplineName(cls)}</span>
                    </td>
                    <td>{getCoachName(cls)}</td>
                    <td>{getRoomName(cls)}</td>
                    <td>{getClassSchedule(cls)}</td>
                    <td>
                      <strong>{cls.capacity} học viên</strong>
                    </td>
                    <td>
                      <span className={`badge ${cls.status?.toUpperCase() === 'ACTIVE' ? 'badge-success' : 'badge-neutral'}`}>
                        {cls.status?.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => setSelectedClassDetail(cls)}
                      >
                        Danh sách
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedClassDetail && (
        <Modal title={`Chi tiết lớp học: ${selectedClassDetail.name}`} onClose={() => setSelectedClassDetail(null)}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="kv-list">
              <div className="kv-row"><span>Mã lớp</span><strong>CLS-{selectedClassDetail.id}</strong></div>
              <div className="kv-row"><span>Bộ môn</span><strong>{getDisciplineName(selectedClassDetail)}</strong></div>
              <div className="kv-row"><span>Huấn luyện viên</span><strong>{getCoachName(selectedClassDetail)}</strong></div>
              <div className="kv-row"><span>Phòng tập</span><strong>{getRoomName(selectedClassDetail)}</strong></div>
              <div className="kv-row"><span>Sức chứa tối đa</span><strong>{selectedClassDetail.capacity} học viên</strong></div>
            </div>
            <div>
              <h4 style={{ margin: '4px 0 8px', fontSize: '0.88rem' }}>Lịch các buổi học đã xếp</h4>
              {sessions.filter((s) => s.classId === selectedClassDetail.id).length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>Chưa có buổi học nào được xếp lịch cho lớp này.</p>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {sessions.filter((s) => s.classId === selectedClassDetail.id).map((s) => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 8, background: 'var(--portal-raised)', border: '1px solid var(--portal-border)' }}>
                      <div>
                        <strong>{s.sessionDate}</strong>
                        <span className="muted" style={{ marginLeft: 8 }}>{s.startTime} – {s.endTime}</span>
                      </div>
                      <span className="badge badge-neutral">{s.status === 'scheduled' ? 'Sắp diễn ra' : s.status === 'completed' ? 'Đã hoàn thành' : 'Đã hủy'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <button type="button" className="btn-secondary" onClick={() => setSelectedClassDetail(null)}>Đóng</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Tạo lớp học và xếp lịch */}
      {showModal && (
        <Modal title="Tạo lớp học & xếp lịch" onClose={handleCloseModal}>
          {catalogsLoading ? <LoadingSkeleton label="Đang tải bộ môn, phòng tập và huấn luyện viên…" count={4} />
            : catalogsError ? <div role="alert"><p>{catalogsError}</p><button type="button" className="btn-secondary" onClick={() => void loadCatalogs()}>Thử lại</button></div>
            : <form onSubmit={handleCreateClass} style={{ display: 'grid', gap: 11 }}>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="class-name">
                Tên lớp học *
              </label>
              <input
                id="class-name"
                type="text"
                required
                autoFocus
                placeholder="Ví dụ: Reformer Pilates Level 2..."
                className="portal-input"
                style={
                  isDuplicateClassName
                    ? { borderColor: 'var(--portal-danger, #fca5a5)', backgroundColor: 'var(--portal-raised)' }
                    : undefined
                }
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (modalError) setModalError(null);
                }}
                disabled={isSubmitting}
              />
              {isDuplicateClassName && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginTop: '5px',
                    color: 'var(--portal-danger, #fca5a5)',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                  }}
                  role="alert"
                  data-testid="duplicate-class-warning"
                >
                  <span style={{ fontWeight: 700 }}>!</span>
                  <span>
                    Tên lớp &quot;{formData.name.trim()}&quot; đã tồn tại trong hệ thống. Vui lòng đặt tên khác!
                  </span>
                </div>
              )}
            </div>

            <div className="grid-2">
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="class-discipline">
                  Bộ môn *
                </label>
                <Select
                  id="class-discipline"
                  className="portal-select"
                  value={formData.disciplineId}
                  onChange={(e) => setFormData({ ...formData, disciplineId: e.target.value })}
                  disabled={isSubmitting}
                >
                  <option value="">-- Chọn bộ môn --</option>
                  {disciplines.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="portal-form-group">
                <label className="portal-label" htmlFor="class-capacity">
                  Sức chứa Tối Đa *
                </label>
                <input
                  id="class-capacity"
                  type="number"
                  min={1}
                  max={100}
                  required
                  className="portal-input"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* BR-02: Dropdown HLV chỉ liệt kê HLV đang active */}
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="class-coach">
                Huấn luyện viên Phụ Trách *
              </label>
              <Select
                id="class-coach"
                className="portal-select"
                value={formData.coachId}
                onChange={(e) => setFormData({ ...formData, coachId: e.target.value })}
                disabled={isSubmitting}
              >
                <option value="">-- Chọn huấn luyện viên --</option>
                {coaches.map((c) => {
                  const genderLabel =
                    c.gender === 'female'
                      ? 'Nữ'
                      : c.gender === 'male'
                      ? 'Nam'
                      : c.gender === 'other'
                      ? 'Khác'
                      : null;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.fullName} {genderLabel ? `(${genderLabel})` : ''} - {c.email}
                    </option>
                  );
                })}
              </Select>
            </div>

            {/* BR-02: Dropdown Phòng chỉ liệt kê phòng available */}
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="class-room">
                Phòng tập *
              </label>
              <Select
                id="class-room"
                className="portal-select"
                value={formData.roomId}
                onChange={(e) => setFormData({ ...formData, roomId: e.target.value })}
                disabled={isSubmitting}
              >
                <option value="">-- Chọn phòng tập --</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} - Sức chứa: {r.capacity} ({r.location || 'Khu trung tâm'})
                  </option>
                ))}
              </Select>
            </div>

            {/* Khung giờ và ngày học */}
            <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-warm)', borderRadius: 8, border: '1px solid var(--color-border-subtle)' }}>
              <strong style={{ display: 'block', marginBottom: 10, fontSize: '0.9rem', color: 'var(--color-text-main)' }}>
                Xếp lịch buổi học đầu tiên
              </strong>

              <div className="grid-2" style={{ marginBottom: 10 }}>
                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="session-date">
                    Ngày Học *
                  </label>
                  <DatePicker
                    id="session-date"
                    required
                    min={getTodayString()}
                    value={formData.sessionDate}
                    onChange={(e) => setFormData({ ...formData, sessionDate: e.target.value })}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="class-level">
                    Cấp Độ
                  </label>
                  <Select
                    id="class-level"
                    className="portal-select"
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                    disabled={isSubmitting}
                  >
                    <option value="all">Mọi cấp độ (All levels)</option>
                    <option value="beginner">Người mới bắt đầu (Beginner)</option>
                    <option value="intermediate">Trung cấp (Intermediate)</option>
                    <option value="advanced">Nâng cao (Advanced)</option>
                  </Select>
                </div>
              </div>

              <div className="grid-2">
                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="session-start">
                    Giờ Bắt Đầu *
                  </label>
                  <TimePicker
                    id="session-start"
                    required
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="session-end">
                    Giờ Kết Thúc *
                  </label>
                  <TimePicker
                    id="session-end"
                    required
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="class-desc">
                Mô Tả / Ghi Chú
              </label>
              <textarea
                id="class-desc"
                rows={2}
                className="portal-textarea"
                placeholder="Ghi chú về trang phục hoặc dụng cụ cần chuẩn bị..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                disabled={isSubmitting}
              />
            </div>

            {/* Hiển thị lỗi form trực tiếp trong Modal */}
            {modalError && (
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'var(--portal-raised)',
                  border: '1px solid var(--portal-danger, #fca5a5)',
                  borderRadius: '6px',
                  color: 'var(--portal-danger, #fca5a5)',
                  fontSize: '0.88rem',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginTop: '4px',
                }}
              >
                <span style={{ fontWeight: 700 }}>!</span>
                <span>{modalError}</span>
              </div>
            )}

            {/* BR-05: Chặn bấm đúp (disable nút khi đang gửi hoặc khi tên bị trùng) */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCloseModal}
                disabled={isSubmitting}
              >
                Hủy Bỏ
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={isSubmitting || isDuplicateClassName}
                data-testid="submit-class-button"
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner" />
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  'Lưu & Xếp Lịch'
                )}
              </button>
            </div>
          </form>}
        </Modal>
      )}
    </div>
  );
}
