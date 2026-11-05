import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { Modal } from '../../shared/ui/Modal';
import { DatePicker } from '../../shared/ui/DatePicker';
import { TimePicker } from '../../shared/ui/TimePicker';
import { Select } from '../../shared/ui/Select';
import { notify } from '../../shared/lib/portalNotices';
import { apiFetch, getCurrentUser } from '../../shared/api/client';
import { errorMessage } from '../../shared/lib/errorMessage';
import {
  classesApi,
  type ClassItem,
  type ClassSessionDto as ClassSessionItem,
} from './classesApi';
import { Link } from 'react-router-dom';
import { WeeklyTimetable, type TimetableSlot } from '../schedule/WeeklyTimetable';
import { hhmm, mondayOf, shortDate, todayISO, type TimetableEvent } from '../schedule/timetable';

type DisciplineOption = Awaited<ReturnType<typeof classesApi.getDisciplines>>[number];
type RoomOption = Awaited<ReturnType<typeof classesApi.getAvailableRooms>>[number];
type CoachOption = Awaited<ReturnType<typeof classesApi.getActiveCoaches>>[number];

interface FormState {
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

interface EditClassFormState {
  name: string;
  disciplineId: string;
  coachId: string;
  roomId: string;
  capacity: number;
  level: string;
  description: string;
  status: string;
}

interface RescheduleFormState {
  sessionId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
}

const getTodayString = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const defaultFormData = (): FormState => ({
  name: '',
  disciplineId: '',
  coachId: '',
  roomId: '',
  capacity: 20,
  level: 'all',
  description: '',
  sessionDate: getTodayString(),
  startTime: '08:00',
  endTime: '09:30',
});

export function StaffClassesPage() {
  const currentUser = getCurrentUser();

  // State dữ liệu
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [sessions, setSessions] = useState<ClassSessionItem[]>([]);
  const [disciplines, setDisciplines] = useState<DisciplineOption[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [coaches, setCoaches] = useState<CoachOption[]>([]);

  const [view, setView] = useState<'timetable' | 'list'>('timetable');
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayISO()));
  const [createMode, setCreateMode] = useState<'new' | 'existing'>('new');
  const [existingClassId, setExistingClassId] = useState('');
  const [loading, setLoading] = useState(true);
  const [catalogsLoading, setCatalogsLoading] = useState(true);
  const [catalogsError, setCatalogsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // State Modal Tạo lớp & Form
  const [showModal, setShowModal] = useState<boolean>(false);
  const [selectedClassDetail, setSelectedClassDetail] = useState<ClassItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormState>(defaultFormData);
  const [pendingClassId, setPendingClassId] = useState<number | null>(null);
  const [pendingClassSignature, setPendingClassSignature] = useState<string | null>(null);

  // SCRUM-131: State Modal Sửa thông tin lớp
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [editFormData, setEditFormData] = useState<EditClassFormState>({
    name: '',
    disciplineId: '',
    coachId: '',
    roomId: '',
    capacity: 20,
    level: 'all',
    description: '',
    status: 'active',
  });
  const [editModalError, setEditModalError] = useState<string | null>(null);

  // SCRUM-131: State Modal Đổi lịch học
  const [reschedulingClass, setReschedulingClass] = useState<ClassItem | null>(null);
  const [rescheduleFormData, setRescheduleFormData] = useState<RescheduleFormState>({
    sessionId: '',
    sessionDate: getTodayString(),
    startTime: '08:00',
    endTime: '09:30',
  });
  const [rescheduleModalError, setRescheduleModalError] = useState<string | null>(null);

  // SCRUM-131: State Modal Xóa lớp học an toàn 2 lần (Double Confirm)
  const [deletingClass, setDeletingClass] = useState<ClassItem | null>(null);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<1 | 2>(1);
  const [deleteModalError, setDeleteModalError] = useState<string | null>(null);

  // State Modal Hủy buổi học (Manager)
  const [cancellingSession, setCancellingSession] = useState<ClassSessionItem | null>(null);
  const [cancelSessionReason, setCancelSessionReason] = useState<string>('');
  const [cancelSessionError, setCancelSessionError] = useState<string | null>(null);

  // Kiểm tra trùng tên lớp học theo thời gian thực (không phân biệt hoa thường)
  const normalizedInputName = formData.name.trim().toLowerCase();
  const isDuplicateClassName =
    normalizedInputName.length > 0 &&
    classes.some((cls) => cls.name.trim().toLowerCase() === normalizedInputName);

  const normalizedEditName = editFormData.name.trim().toLowerCase();
  const isDuplicateEditClassName =
    editingClass !== null &&
    normalizedEditName.length > 0 &&
    classes.some(
      (cls) => cls.id !== editingClass.id && cls.name.trim().toLowerCase() === normalizedEditName,
    );

  // SCRUM-132: Phát hiện trùng lịch phòng tập hoặc HLV theo thời gian thực ngay trên form
  const detectRoomOrCoachConflict = useCallback(
    (
      coachIdStr: string,
      roomIdStr: string,
      sessionDate: string,
      startTime: string,
      endTime: string,
      excludeSessionId?: number | null,
    ): string | null => {
      if (!sessionDate || !startTime || !endTime || endTime <= startTime) return null;
      const targetCoachId = coachIdStr ? Number(coachIdStr) : null;
      const targetRoomId = roomIdStr ? Number(roomIdStr) : null;
      const normStart = startTime.slice(0, 5);
      const normEnd = endTime.slice(0, 5);

      for (const s of sessions) {
        if (s.status === 'cancelled') continue;
        if (excludeSessionId && s.id === excludeSessionId) continue;
        if (s.sessionDate !== sessionDate) continue;
        const existStart = s.startTime.slice(0, 5);
        const existEnd = s.endTime.slice(0, 5);
        const overlaps = normStart < existEnd && normEnd > existStart;
        if (!overlaps) continue;

        const sExt = s as ClassSessionItem & {
          roomId?: number;
          roomName?: string;
          coachId?: number;
          coachName?: string;
          className?: string;
        };
        const parentClass = classes.find((c) => c.id === s.classId);
        const sRoomId = sExt.roomId ?? parentClass?.roomId;
        const sCoachId = sExt.coachId ?? parentClass?.coachId;
        const sClassName = sExt.className || parentClass?.name || `Lớp #${s.classId}`;
        const sRoomName =
          sExt.roomName ||
          parentClass?.roomName ||
          rooms.find((r) => r.id === sRoomId)?.name ||
          `#${sRoomId}`;
        const sCoachName =
          sExt.coachName ||
          parentClass?.coachName ||
          coaches.find((c) => c.id === sCoachId)?.fullName ||
          `#${sCoachId}`;

        if (targetRoomId && sRoomId === targetRoomId) {
          return `Trùng lịch phòng tập: Phòng "${sRoomName}" đã có lớp "${sClassName}" hoạt động trong khung giờ ${existStart} – ${existEnd} ngày ${sessionDate}.`;
        }
        if (targetCoachId && sCoachId === targetCoachId) {
          return `Trùng lịch Huấn luyện viên: HLV "${sCoachName}" đã có lịch dạy lớp "${sClassName}" trong khung giờ ${existStart} – ${existEnd} ngày ${sessionDate}.`;
        }
      }
      return null;
    },
    [sessions, classes, rooms, coaches],
  );

  const createScheduleConflictWarning = detectRoomOrCoachConflict(
    formData.coachId,
    formData.roomId,
    formData.sessionDate,
    formData.startTime,
    formData.endTime,
    null,
  );

  const existingClass = createMode === 'existing' && existingClassId
    ? classes.find((cls) => cls.id === Number(existingClassId)) ?? null
    : null;
  const addSessionConflictWarning = existingClass
    ? detectRoomOrCoachConflict(
        String(existingClass.coachId || ''),
        String(existingClass.roomId || ''),
        formData.sessionDate,
        formData.startTime,
        formData.endTime,
        null,
      )
    : null;

  const rescheduleConflictWarning = reschedulingClass
    ? detectRoomOrCoachConflict(
        String(reschedulingClass.coachId || ''),
        String(reschedulingClass.roomId || ''),
        rescheduleFormData.sessionDate,
        rescheduleFormData.startTime,
        rescheduleFormData.endTime,
        rescheduleFormData.sessionId && rescheduleFormData.sessionId !== 'NEW'
          ? Number(rescheduleFormData.sessionId)
          : null,
      )
    : null;

  const editConflictWarning = (() => {
    if (!editingClass) return null;
    const classSessions = sessions.filter(
      (s) => s.classId === editingClass.id && s.status !== 'cancelled',
    );
    for (const cs of classSessions) {
      const conflict = detectRoomOrCoachConflict(
        editFormData.coachId,
        editFormData.roomId,
        cs.sessionDate,
        cs.startTime.slice(0, 5),
        cs.endTime.slice(0, 5),
        cs.id,
      );
      if (conflict) return conflict;
    }
    return null;
  })();

  // BR-01 & SCRUM-131: Phân quyền truy cập và khóa quyền chỉnh sửa trên UI Lễ tân
  // Lễ tân (STAFF) và HLV (COACH) chỉ được XEM lịch học; chỉ CENTER_MANAGER (MANAGER) mới được Tạo/Sửa/Đổi lịch/Xóa
  const allowedRoles = ['MANAGER', 'STAFF', 'COACH'];
  const hasAccess = currentUser && allowedRoles.includes(currentUser.role);
  const isManager = currentUser?.role === 'MANAGER';

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
      setCatalogsError(errorMessage(cause, 'Không thể tải danh mục tạo lớp học.'));
    } finally {
      setCatalogsLoading(false);
    }
  }, []);


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
      const msg = errorMessage(err, 'Không thể tải danh sách lớp học.');
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
              Chỉ Quản lý trung tâm (Center Manager) và Nhân viên được cấp quyền mới có thể truy cập và xem lịch lớp học.
            </p>
            <Link to="/portal" className="btn-secondary">
              Về trang chủ Portal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleOpenModal = (slot?: TimetableSlot) => {
    if (!isManager) return;
    setModalError(null);
    setCreateMode('new');
    setExistingClassId('');
    setPendingClassId(null);
    setPendingClassSignature(null);
    setFormData((prev) => ({
      ...prev,
      disciplineId: prev.disciplineId || (disciplines[0] ? String(disciplines[0].id) : ''),
      roomId: prev.roomId || (rooms[0] ? String(rooms[0].id) : ''),
      coachId: prev.coachId || (coaches[0] ? String(coaches[0].id) : ''),
      sessionDate: slot?.date ?? (prev.sessionDate || getTodayString()),
      startTime: slot?.startTime ?? prev.startTime,
      endTime: slot?.endTime ?? prev.endTime,
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

    if (isSubmitting || !isManager) return;

    if (!formData.name.trim()) {
      const msg = 'Vui lòng nhập tên lớp học.';
      setModalError(msg);
      return;
    }

    if (isDuplicateClassName) {
      const msg = `Tên lớp học "${formData.name.trim()}" đã tồn tại trong hệ thống. Vui lòng chọn tên khác.`;
      setModalError(msg);
      return;
    }

    if (!formData.disciplineId) {
      const msg = 'Vui lòng chọn bộ môn thể thao.';
      setModalError(msg);
      return;
    }

    if (!formData.coachId) {
      const msg = 'Vui lòng chọn huấn luyện viên phụ trách.';
      setModalError(msg);
      return;
    }

    if (!formData.roomId) {
      const msg = 'Vui lòng chọn phòng tập.';
      setModalError(msg);
      return;
    }

    const capacityNum = Number(formData.capacity);
    if (isNaN(capacityNum) || capacityNum <= 0) {
      const msg = 'Sức chứa tối đa (capacity) phải lớn hơn 0.';
      setModalError(msg);
      return;
    }

    const today = getTodayString();
    if (formData.sessionDate < today) {
      const msg = 'Ngày học không được ở trong quá khứ.';
      setModalError(msg);
      return;
    }

    if (formData.endTime <= formData.startTime) {
      const msg = 'Giờ kết thúc phải sau giờ bắt đầu.';
      setModalError(msg);
      return;
    }

    if (createScheduleConflictWarning) {
      setModalError(createScheduleConflictWarning);
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
      const reusedPendingClass = Boolean(targetClassId);

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

      if (reusedPendingClass && targetClassId && formData.sessionDate && formData.startTime && formData.endTime) {
        await classesApi.createSession({
          classId: targetClassId,
          sessionDate: formData.sessionDate,
          startTime: formData.startTime,
          endTime: formData.endTime,
        });
      }

      notify('Đã tạo lớp học và xếp lịch thành công!', 'success');
      setShowModal(false);
      setFormData(defaultFormData());
      setModalError(null);
      setPendingClassId(null);
      setPendingClassSignature(null);
      await loadData();
    } catch (err: unknown) {
      const apiErr = err as { code?: string; message?: string; status?: number };
      const isConflict =
        apiErr?.code === 'error.scheduling.session_conflict' ||
        apiErr?.code === 'SCHEDULE_CONFLICT' ||
        apiErr?.status === 409 ||
        (typeof apiErr?.message === 'string' &&
          (apiErr.message.includes('trùng lịch') ||
            apiErr.message.includes('session_conflict') ||
            apiErr.message.includes('khung giờ')));

      const hasSpecificConflictMsg =
        typeof apiErr?.message === 'string' &&
        (apiErr.message.includes('Trùng lịch phòng tập') ||
          apiErr.message.includes('Trùng lịch Huấn luyện viên') ||
          apiErr.message.includes('Room schedule conflict') ||
          apiErr.message.includes('Coach schedule conflict'));

      const errMessage = hasSpecificConflictMsg
        ? apiErr.message!
        : isConflict
          ? 'Trùng lịch: Huấn luyện viên hoặc phòng học đã có lịch trong khung giờ này. Vui lòng chọn thời gian khác.'
          : apiErr?.message || 'Có lỗi xảy ra khi tạo lớp học.';

      setModalError(errMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Thêm một buổi học mới cho lớp đã có (bấm ô trống trên thời khóa biểu rồi chọn lớp)
  const handleAddSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !isManager) return;
    setModalError(null);
    if (!existingClass) {
      setModalError('Vui lòng chọn lớp học.');
      return;
    }
    if (formData.sessionDate < getTodayString()) {
      setModalError('Ngày học không được ở trong quá khứ.');
      return;
    }
    if (formData.endTime <= formData.startTime) {
      setModalError('Giờ kết thúc phải sau giờ bắt đầu.');
      return;
    }
    if (addSessionConflictWarning) {
      setModalError(addSessionConflictWarning);
      return;
    }
    setIsSubmitting(true);
    try {
      await classesApi.createSession({
        classId: existingClass.id,
        sessionDate: formData.sessionDate,
        startTime: formData.startTime,
        endTime: formData.endTime,
      });
      notify(`Đã thêm buổi học cho lớp "${existingClass.name}".`, 'success');
      setShowModal(false);
      setCreateMode('new');
      setExistingClassId('');
      await loadData();
    } catch (err: unknown) {
      setModalError(errorMessage(err, 'Không thể thêm buổi học.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // SCRUM-131: Mở Modal Sửa lớp học
  const handleOpenEditModal = (cls: ClassItem) => {
    if (!isManager) return;
    setEditModalError(null);
    setEditingClass(cls);
    setEditFormData({
      name: cls.name || '',
      disciplineId: String(cls.disciplineId || ''),
      coachId: String(cls.coachId || ''),
      roomId: String(cls.roomId || ''),
      capacity: cls.capacity || 20,
      level: cls.level || 'all',
      description: cls.description || '',
      status: (cls.status || 'active').toLowerCase(),
    });
  };

  const handleCloseEditModal = () => {
    if (isSubmitting) return;
    setEditModalError(null);
    setEditingClass(null);
  };

  const handleUpdateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass || isSubmitting || !isManager) return;
    setEditModalError(null);

    if (!editFormData.name.trim()) {
      const msg = 'Vui lòng nhập tên lớp học.';
      setEditModalError(msg);
      return;
    }

    if (isDuplicateEditClassName) {
      const msg = `Tên lớp học "${editFormData.name.trim()}" đã tồn tại trong hệ thống.`;
      setEditModalError(msg);
      return;
    }

    const capacityNum = Number(editFormData.capacity);
    if (isNaN(capacityNum) || capacityNum <= 0) {
      const msg = 'Sức chứa tối đa phải lớn hơn 0.';
      setEditModalError(msg);
      return;
    }

    if (editConflictWarning) {
      setEditModalError(editConflictWarning);
      return;
    }

    setIsSubmitting(true);
    try {
      await apiFetch<ClassItem>(`/classes/${editingClass.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editFormData.name.trim(),
          disciplineId: Number(editFormData.disciplineId),
          coachId: Number(editFormData.coachId),
          roomId: Number(editFormData.roomId),
          capacity: capacityNum,
          level: editFormData.level,
          description: editFormData.description.trim() || undefined,
          status: editFormData.status,
        }),
      });
      notify('Đã cập nhật thông tin lớp học thành công!', 'success');
      setEditingClass(null);
      await loadData();
    } catch (err: unknown) {
      const apiErr = err as { code?: string; message?: string; status?: number };
      const hasSpecificConflictMsg =
        typeof apiErr?.message === 'string' &&
        (apiErr.message.includes('Trùng lịch phòng tập') ||
          apiErr.message.includes('Trùng lịch Huấn luyện viên') ||
          apiErr.message.includes('Room schedule conflict') ||
          apiErr.message.includes('Coach schedule conflict'));
      const isConflict =
        apiErr?.code === 'error.scheduling.session_conflict' ||
        apiErr?.code === 'SCHEDULE_CONFLICT' ||
        apiErr?.status === 409;
      const errMessage = hasSpecificConflictMsg
        ? apiErr.message!
        : isConflict
          ? 'Trùng lịch: Huấn luyện viên hoặc phòng tập mới đã có lịch dạy trùng với buổi học của lớp này.'
          : apiErr?.message || 'Không thể cập nhật thông tin lớp học.';
      setEditModalError(errMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // SCRUM-131: Mở Modal Đổi lịch học
  const handleOpenRescheduleModal = (cls: ClassItem, preferredSession?: ClassSessionItem) => {
    if (!isManager) return;
    setRescheduleModalError(null);
    setReschedulingClass(cls);
    const classScheduledSessions = sessions.filter(
      (s) => s.classId === cls.id && s.status !== 'cancelled',
    );
    const targetSession = preferredSession || classScheduledSessions[0];
    setRescheduleFormData({
      sessionId: targetSession ? String(targetSession.id) : 'NEW',
      sessionDate: targetSession ? targetSession.sessionDate : getTodayString(),
      startTime: targetSession ? targetSession.startTime.slice(0, 5) : '08:00',
      endTime: targetSession ? targetSession.endTime.slice(0, 5) : '09:30',
    });
  };

  const handleCloseRescheduleModal = () => {
    if (isSubmitting) return;
    setRescheduleModalError(null);
    setReschedulingClass(null);
  };

  const handleRescheduleSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reschedulingClass || isSubmitting || !isManager) return;
    setRescheduleModalError(null);

    const today = getTodayString();
    if (rescheduleFormData.sessionDate < today) {
      const msg = 'Ngày học mới không được ở trong quá khứ.';
      setRescheduleModalError(msg);
      return;
    }

    if (rescheduleFormData.endTime <= rescheduleFormData.startTime) {
      const msg = 'Giờ kết thúc phải sau giờ bắt đầu.';
      setRescheduleModalError(msg);
      return;
    }

    if (rescheduleConflictWarning) {
      setRescheduleModalError(rescheduleConflictWarning);
      return;
    }

    setIsSubmitting(true);
    try {
      if (!rescheduleFormData.sessionId || rescheduleFormData.sessionId === 'NEW') {
        await classesApi.createSession({
          classId: reschedulingClass.id,
          sessionDate: rescheduleFormData.sessionDate,
          startTime: rescheduleFormData.startTime,
          endTime: rescheduleFormData.endTime,
        });
        notify('Đã xếp lịch buổi học mới thành công!', 'success');
      } else {
        await apiFetch<ClassSessionItem>(
          `/classes/${reschedulingClass.id}/sessions/${rescheduleFormData.sessionId}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              sessionDate: rescheduleFormData.sessionDate,
              startTime: rescheduleFormData.startTime,
              endTime: rescheduleFormData.endTime,
            }),
          },
        );
        notify('Đã đổi lịch buổi học thành công!', 'success');
      }
      setReschedulingClass(null);
      await loadData();
    } catch (err: unknown) {
      const apiErr = err as { code?: string; message?: string; status?: number };
      const hasSpecificConflictMsg =
        typeof apiErr?.message === 'string' &&
        (apiErr.message.includes('Trùng lịch phòng tập') ||
          apiErr.message.includes('Trùng lịch Huấn luyện viên') ||
          apiErr.message.includes('Room schedule conflict') ||
          apiErr.message.includes('Coach schedule conflict'));
      const isConflict =
        apiErr?.code === 'error.scheduling.session_conflict' ||
        apiErr?.code === 'SCHEDULE_CONFLICT' ||
        apiErr?.status === 409 ||
        (typeof apiErr?.message === 'string' && apiErr.message.includes('trùng lịch'));
      const errMessage = hasSpecificConflictMsg
        ? apiErr.message!
        : isConflict
          ? 'Trùng lịch: Huấn luyện viên hoặc phòng học đã có lịch trong khung giờ này. Vui lòng chọn giờ khác.'
          : apiErr?.message || 'Không thể đổi lịch buổi học.';
      setRescheduleModalError(errMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // SCRUM-131: Mở Modal Xóa lớp học (Double Confirm 2 bước)
  const handleOpenDeleteModal = (cls: ClassItem) => {
    if (!isManager) return;
    setDeleteModalError(null);
    setDeleteConfirmStep(1);
    setDeletingClass(cls);
  };

  const handleCloseDeleteModal = () => {
    if (isSubmitting) return;
    setDeleteModalError(null);
    setDeleteConfirmStep(1);
    setDeletingClass(null);
  };

  const handleConfirmDeleteClass = async () => {
    if (!deletingClass || isSubmitting || !isManager) return;
    setDeleteModalError(null);
    setIsSubmitting(true);
    try {
      await apiFetch<void>(`/classes/${deletingClass.id}`, {
        method: 'DELETE',
      });
      notify(`Đã xóa lớp học "${deletingClass.name}" thành công!`, 'success');
      setDeletingClass(null);
      setDeleteConfirmStep(1);
      if (selectedClassDetail?.id === deletingClass.id) {
        setSelectedClassDetail(null);
      }
      await loadData();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      const errMessage = apiErr?.message || 'Không thể xóa lớp học này.';
      setDeleteModalError(errMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenCancelSessionModal = (session: ClassSessionItem) => {
    if (!isManager) return;
    setCancelSessionError(null);
    setCancelSessionReason('');
    setCancellingSession(session);
  };

  const handleCloseCancelSessionModal = () => {
    if (isSubmitting) return;
    setCancelSessionError(null);
    setCancelSessionReason('');
    setCancellingSession(null);
  };

  const handleConfirmCancelSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingSession || isSubmitting || !isManager) return;
    const reason = cancelSessionReason.trim();
    if (!reason) {
      setCancelSessionError('Vui lòng nhập lý do hủy buổi học.');
      return;
    }
    setCancelSessionError(null);
    setIsSubmitting(true);
    try {
      const apiWithCancel = classesApi as { cancelSession?: (id: number, reason: string) => Promise<unknown> };
      if (typeof apiWithCancel.cancelSession === 'function') {
        await apiWithCancel.cancelSession(cancellingSession.id, reason);
      } else {
        await apiFetch<ClassSessionItem>(`/classes/sessions/${cancellingSession.id}/cancel`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
      }
      notify('Đã hủy buổi học thành công!', 'success');
      setCancellingSession(null);
      setCancelSessionReason('');
      await loadData();
    } catch (err: unknown) {
      setCancelSessionError(errorMessage(err, 'Không thể hủy buổi học này.'));
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
    const classSessions = sessions.filter((s) => s.classId === cls.id && s.status !== 'cancelled');
    if (classSessions.length > 0) {
      const first = classSessions[0];
      return `${first.sessionDate} (${first.startTime.slice(0, 5)} - ${first.endTime.slice(0, 5)})`;
    }
    return 'Chưa có lịch';
  };

  const nowForTone = new Date();
  const nowTime = `${String(nowForTone.getHours()).padStart(2, '0')}:${String(nowForTone.getMinutes()).padStart(2, '0')}`;
  const timetableEvents: TimetableEvent[] = sessions.map((session) => {
    const cls = classes.find((item) => item.id === session.classId);
    const name = session.className || cls?.name || `Lớp #${session.classId}`;
    const room = session.roomName || cls?.roomName;
    const coach = session.coachName || cls?.coachName;
    const capacity = session.capacity ?? cls?.capacity;
    const booked = session.bookedCount ?? 0;
    const past = session.sessionDate < todayISO()
      || (session.sessionDate === todayISO() && hhmm(session.endTime) <= nowTime);
    const tone: TimetableEvent['tone'] = session.status === 'cancelled' ? 'cancelled'
      : past ? 'past'
      : capacity !== undefined && booked >= capacity ? 'full'
      : 'open';
    const seats = capacity !== undefined ? `${booked}/${capacity} chỗ` : undefined;
    const statusText = tone === 'cancelled' ? 'đã hủy' : tone === 'past' ? 'đã qua' : tone === 'full' ? 'đã đầy' : 'còn chỗ';
    return {
      id: String(session.id),
      date: session.sessionDate,
      startTime: session.startTime,
      endTime: session.endTime,
      title: name,
      meta: [room, coach].filter(Boolean).join(' · ') || undefined,
      badge: tone === 'cancelled' ? 'Đã hủy' : tone === 'full' ? 'Đầy' : capacity !== undefined ? `${booked}/${capacity}` : undefined,
      tone,
      ariaLabel: `${name}, ${shortDate(session.sessionDate)} ${hhmm(session.startTime)}–${hhmm(session.endTime)}${room ? `, ${room}` : ''}${seats ? `, ${seats}` : ''}, ${statusText}. Bấm để xem chi tiết lớp`,
    };
  });

  const openSessionDetail = (sessionId: string) => {
    const session = sessions.find((item) => String(item.id) === sessionId);
    const cls = session ? classes.find((item) => item.id === session.classId) : undefined;
    if (cls) setSelectedClassDetail(cls);
  };

  return (
    <div className="portal-container">
      <PageHeader
        eyebrow="Huấn luyện"
        title={isManager ? 'Quản lý lớp học & xếp lịch' : 'Lịch học trung tâm'}
        subtitle={
          !isManager
            ? 'Chế độ xem lịch học dành cho Lễ tân & Huấn luyện viên (Chỉ Quản lý trung tâm mới được tạo, sửa, đổi lịch hoặc xóa lớp học).'
            : undefined
        }
        actions={
          isManager ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleOpenModal()}
              data-testid="create-class-button"
            >
              Tạo lớp học &amp; xếp lịch
            </button>
          ) : (
            <span className="badge badge-neutral" data-testid="read-only-schedule-badge">
              Chế độ chỉ xem lịch học
            </span>
          )
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

      <div className="portal-tabs" role="tablist" aria-label="Chế độ xem lịch học" style={{ marginBottom: 18 }}>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'timetable'}
          className={`portal-tab ${view === 'timetable' ? 'active' : ''}`}
          onClick={() => setView('timetable')}
          data-testid="view-timetable"
        >
          Thời khóa biểu tuần
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'list'}
          className={`portal-tab ${view === 'list' ? 'active' : ''}`}
          onClick={() => setView('list')}
          data-testid="view-list"
        >
          Danh sách lớp
        </button>
      </div>

      {view === 'timetable' ? (
        <WeeklyTimetable
          label="Thời khóa biểu tuần của trung tâm"
          weekStart={weekStart}
          events={timetableEvents}
          loading={loading}
          onWeekChange={setWeekStart}
          onEventClick={openSessionDetail}
          onSlotClick={isManager ? (slot) => { if (!catalogsLoading) handleOpenModal(slot); } : undefined}
          slotActionLabel="bấm để tạo lịch"
          legendNote="Số trên khối: đã đặt / sức chứa"
          legend={[
            ...(isManager ? [{ tone: 'free' as const, label: 'Ô trống: bấm để tạo lịch' }] : []),
            { tone: 'open', label: 'Có lịch, còn chỗ' },
            { tone: 'full', label: 'Đã đầy' },
            { tone: 'past', label: 'Đã qua' },
            { tone: 'cancelled', label: 'Đã hủy' },
          ]}
        />
      ) : loading ? (
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
                    borderBottom: '1px solid var(--portal-border)',
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
              {isManager
                ? 'Hiện chưa có lớp học nào trong hệ thống. Hãy tạo lớp học mới để bắt đầu sắp xếp lịch tập cho hội viên và huấn luyện viên.'
                : 'Hiện chưa có lớp học nào được xếp lịch trong hệ thống.'}
            </p>
            {isManager && (
              <button type="button" className="btn-primary" onClick={() => handleOpenModal()}>
                Tạo lớp học đầu tiên
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
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => setSelectedClassDetail(cls)}
                          data-testid={`view-class-${cls.id}`}
                        >
                          Xem lịch
                        </button>
                        {isManager && (
                          <>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => handleOpenEditModal(cls)}
                              data-testid={`edit-class-${cls.id}`}
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => handleOpenRescheduleModal(cls)}
                              data-testid={`reschedule-class-${cls.id}`}
                            >
                              Đổi lịch
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              style={{
                                color: 'var(--portal-danger, #fca5a5)',
                                borderColor: 'color-mix(in srgb, var(--portal-danger) 35%, transparent)',
                              }}
                              onClick={() => handleOpenDeleteModal(cls)}
                              data-testid={`delete-class-${cls.id}`}
                            >
                              Xóa
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Chi tiết lớp học & lịch các buổi học */}
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
                        <span className="muted" style={{ marginLeft: 8 }}>{s.startTime.slice(0, 5)} – {s.endTime.slice(0, 5)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="badge badge-neutral">
                          {s.status === 'scheduled' ? 'Sắp diễn ra' : s.status === 'completed' ? 'Đã hoàn thành' : 'Đã hủy'}
                        </span>
                        {isManager && s.status === 'scheduled' && (
                          <>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => {
                                const cls = selectedClassDetail;
                                setSelectedClassDetail(null);
                                handleOpenRescheduleModal(cls, s);
                              }}
                            >
                              Đổi lịch
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              style={{ color: 'var(--portal-danger, #fca5a5)' }}
                              onClick={() => handleOpenCancelSessionModal(s)}
                              data-testid={`cancel-session-${s.id}`}
                            >
                              Hủy buổi
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              {isManager ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      const cls = selectedClassDetail;
                      setSelectedClassDetail(null);
                      handleOpenEditModal(cls);
                    }}
                  >
                    Sửa thông tin lớp
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    style={{ color: 'var(--portal-danger, #fca5a5)' }}
                    onClick={() => {
                      const cls = selectedClassDetail;
                      setSelectedClassDetail(null);
                      handleOpenDeleteModal(cls);
                    }}
                  >
                    Xóa lớp học
                  </button>
                </div>
              ) : (
                <div />
              )}
              <button type="button" className="btn-secondary" onClick={() => setSelectedClassDetail(null)}>Đóng</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Hủy buổi học (Manager Only) */}
      {isManager && cancellingSession && (
        <Modal
          title={`Hủy buổi học: ${cancellingSession.sessionDate} (${cancellingSession.startTime.slice(0, 5)} – ${cancellingSession.endTime.slice(0, 5)})`}
          onClose={handleCloseCancelSessionModal}
        >
          <form onSubmit={handleConfirmCancelSession} style={{ display: 'grid', gap: 12 }}>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="cancel-session-reason">
                Lý do hủy buổi học *
              </label>
              <textarea
                id="cancel-session-reason"
                rows={3}
                required
                className="portal-textarea"
                placeholder="Nhập lý do hủy buổi học để thông báo cho học viên..."
                value={cancelSessionReason}
                onChange={(e) => setCancelSessionReason(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            {cancelSessionError && (
              <div role="alert" style={{ color: 'var(--portal-danger, #fca5a5)', fontSize: '0.88rem' }}>
                {cancelSessionError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn-secondary" onClick={handleCloseCancelSessionModal} disabled={isSubmitting}>
                Quay lại
              </button>
              <button type="submit" className="btn-danger" disabled={isSubmitting} data-testid="confirm-cancel-session-btn">
                {isSubmitting ? 'Đang hủy...' : 'Xác nhận hủy buổi'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* SCRUM-131 Modal: Chỉnh sửa thông tin lớp học (Manager Only) */}
      {isManager && editingClass && (
        <Modal title={`Chỉnh sửa lớp học: ${editingClass.name}`} onClose={handleCloseEditModal}>
          <form onSubmit={handleUpdateClass} style={{ display: 'grid', gap: 12 }}>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="edit-class-name">
                Tên lớp học *
              </label>
              <input
                id="edit-class-name"
                type="text"
                required
                className="portal-input"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                disabled={isSubmitting}
              />
              {isDuplicateEditClassName && (
                <div style={{ color: 'var(--portal-danger, #fca5a5)', fontSize: '0.84rem', marginTop: 4 }}>
                  Tên lớp học này đã tồn tại trong hệ thống.
                </div>
              )}
            </div>

            <div className="grid-2">
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="edit-class-discipline">
                  Bộ môn *
                </label>
                <Select
                  id="edit-class-discipline"
                  className="portal-select"
                  value={editFormData.disciplineId}
                  onChange={(e) => setEditFormData({ ...editFormData, disciplineId: e.target.value })}
                  disabled={isSubmitting}
                >
                  {disciplines.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="portal-form-group">
                <label className="portal-label" htmlFor="edit-class-capacity">
                  Sức chứa tối đa *
                </label>
                <input
                  id="edit-class-capacity"
                  type="number"
                  min={1}
                  max={100}
                  required
                  className="portal-input"
                  value={editFormData.capacity}
                  onChange={(e) => setEditFormData({ ...editFormData, capacity: Number(e.target.value) })}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="edit-class-coach">
                Huấn luyện viên phụ trách *
              </label>
              <Select
                id="edit-class-coach"
                className="portal-select"
                value={editFormData.coachId}
                onChange={(e) => setEditFormData({ ...editFormData, coachId: e.target.value })}
                disabled={isSubmitting}
              >
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.email})
                  </option>
                ))}
              </Select>
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="edit-class-room">
                Phòng tập *
              </label>
              <Select
                id="edit-class-room"
                className="portal-select"
                value={editFormData.roomId}
                onChange={(e) => setEditFormData({ ...editFormData, roomId: e.target.value })}
                disabled={isSubmitting}
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} - Sức chứa: {r.capacity} ({r.location || 'Khu trung tâm'})
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid-2">
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="edit-class-level">
                  Cấp độ
                </label>
                <Select
                  id="edit-class-level"
                  className="portal-select"
                  value={editFormData.level}
                  onChange={(e) => setEditFormData({ ...editFormData, level: e.target.value })}
                  disabled={isSubmitting}
                >
                  <option value="all">Mọi cấp độ (All levels)</option>
                  <option value="beginner">Người mới bắt đầu (Beginner)</option>
                  <option value="intermediate">Trung cấp (Intermediate)</option>
                  <option value="advanced">Nâng cao (Advanced)</option>
                </Select>
              </div>

              <div className="portal-form-group">
                <label className="portal-label" htmlFor="edit-class-status">
                  Trạng thái lớp
                </label>
                <Select
                  id="edit-class-status"
                  className="portal-select"
                  value={editFormData.status}
                  onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                  disabled={isSubmitting}
                >
                  <option value="active">Đang hoạt động (Active)</option>
                  <option value="cancelled">Tạm ngưng / Đã hủy (Cancelled)</option>
                  <option value="archived">Lưu trữ (Archived)</option>
                </Select>
              </div>
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="edit-class-desc">
                Mô tả / Ghi chú
              </label>
              <textarea
                id="edit-class-desc"
                rows={2}
                className="portal-textarea"
                value={editFormData.description}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                disabled={isSubmitting}
              />
            </div>

            {(editModalError || editConflictWarning) && (
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'var(--portal-raised)',
                  border: '1px solid var(--portal-danger, #fca5a5)',
                  borderRadius: '6px',
                  color: 'var(--portal-danger, #fca5a5)',
                  fontSize: '0.88rem',
                }}
                role="alert"
                data-testid="edit-schedule-conflict-warning"
              >
                {editModalError || editConflictWarning}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button type="button" className="btn-secondary" onClick={handleCloseEditModal} disabled={isSubmitting}>
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={isSubmitting || isDuplicateEditClassName || Boolean(editConflictWarning)}
                data-testid="submit-edit-class-button"
              >
                {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* SCRUM-131 Modal: Đổi lịch buổi học (Manager Only) */}
      {isManager && reschedulingClass && (
        <Modal title={`Đổi lịch học: ${reschedulingClass.name}`} onClose={handleCloseRescheduleModal}>
          <form onSubmit={handleRescheduleSession} style={{ display: 'grid', gap: 12 }}>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="reschedule-session-select">
                Chọn buổi học cần đổi lịch
              </label>
              <Select
                id="reschedule-session-select"
                className="portal-select"
                value={rescheduleFormData.sessionId}
                onChange={(e) => {
                  const val = e.target.value;
                  const found = sessions.find((s) => String(s.id) === val);
                  setRescheduleFormData({
                    sessionId: val,
                    sessionDate: found ? found.sessionDate : getTodayString(),
                    startTime: found ? found.startTime.slice(0, 5) : '08:00',
                    endTime: found ? found.endTime.slice(0, 5) : '09:30',
                  });
                }}
                disabled={isSubmitting}
              >
                {sessions
                  .filter((s) => s.classId === reschedulingClass.id && s.status !== 'cancelled')
                  .map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      Buổi #{s.id}: {s.sessionDate} ({s.startTime.slice(0, 5)} – {s.endTime.slice(0, 5)})
                    </option>
                  ))}
                <option value="NEW">+ Xếp thêm buổi học mới cho lớp này</option>
              </Select>
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="reschedule-date">
                Ngày học mới *
              </label>
              <DatePicker
                id="reschedule-date"
                required
                min={getTodayString()}
                value={rescheduleFormData.sessionDate}
                onChange={(e) => setRescheduleFormData({ ...rescheduleFormData, sessionDate: e.target.value })}
                disabled={isSubmitting}
              />
            </div>

            <div className="grid-2">
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="reschedule-start">
                  Giờ bắt đầu mới *
                </label>
                <TimePicker
                  id="reschedule-start"
                  required
                  value={rescheduleFormData.startTime}
                  onChange={(e) => setRescheduleFormData({ ...rescheduleFormData, startTime: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>

              <div className="portal-form-group">
                <label className="portal-label" htmlFor="reschedule-end">
                  Giờ kết thúc mới *
                </label>
                <TimePicker
                  id="reschedule-end"
                  required
                  value={rescheduleFormData.endTime}
                  onChange={(e) => setRescheduleFormData({ ...rescheduleFormData, endTime: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {(rescheduleModalError || rescheduleConflictWarning) && (
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'var(--portal-raised)',
                  border: '1px solid var(--portal-danger, #fca5a5)',
                  borderRadius: '6px',
                  color: 'var(--portal-danger, #fca5a5)',
                  fontSize: '0.88rem',
                }}
                role="alert"
                data-testid="reschedule-conflict-warning"
              >
                {rescheduleModalError || rescheduleConflictWarning}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button type="button" className="btn-secondary" onClick={handleCloseRescheduleModal} disabled={isSubmitting}>
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={isSubmitting || Boolean(rescheduleConflictWarning)}
                data-testid="submit-reschedule-button"
              >
                {isSubmitting ? 'Đang cập nhật...' : 'Xác nhận đổi lịch'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* SCRUM-131 Modal: Xác nhận xóa lớp học 2 lần (Double Confirm) */}
      {isManager && deletingClass && (
        <Modal
          title={
            deleteConfirmStep === 1
              ? 'Xác nhận xóa lớp học (Bước 1/2)'
              : 'Xác nhận xóa vĩnh viễn (Bước 2/2)'
          }
          onClose={handleCloseDeleteModal}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="kv-list">
              <div className="kv-row"><span>Tên lớp học</span><strong>{deletingClass.name}</strong></div>
              <div className="kv-row"><span>Mã lớp</span><strong>CLS-{deletingClass.id}</strong></div>
              <div className="kv-row"><span>Bộ môn</span><strong>{getDisciplineName(deletingClass)}</strong></div>
              <div className="kv-row"><span>Huấn luyện viên</span><strong>{getCoachName(deletingClass)}</strong></div>
              <div className="kv-row">
                <span>Số buổi học liên quan</span>
                <strong>{sessions.filter((s) => s.classId === deletingClass.id).length} buổi</strong>
              </div>
            </div>

            {deleteConfirmStep === 1 ? (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  backgroundColor: 'var(--portal-raised)',
                  border: '1px solid var(--portal-border)',
                  lineHeight: 1.5,
                }}
                data-testid="delete-step-1-box"
              >
                Bạn đang yêu cầu xóa lớp học <strong>{deletingClass.name}</strong>. Nếu đây là lớp học tạo nhầm và bạn muốn xóa khỏi hệ thống, vui lòng bấm <strong>&quot;Tiếp tục xác nhận lần 2&quot;</strong> để chuyển sang bước xác nhận cuối cùng.
              </div>
            ) : (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: 8,
                  backgroundColor: 'color-mix(in srgb, var(--portal-danger) 12%, transparent)',
                  border: '1px solid var(--portal-danger, #fca5a5)',
                  color: 'var(--portal-danger, #fca5a5)',
                  lineHeight: 1.5,
                  fontWeight: 500,
                }}
                data-testid="delete-step-2-box"
              >
                <strong>CẢNH BÁO XÁC NHẬN LẦN 2 (DOUBLE CONFIRM):</strong>
                <div style={{ marginTop: 6 }}>
                  Thao tác này sẽ xóa vĩnh viễn lớp học <strong>{deletingClass.name}</strong> cùng toàn bộ các buổi học và danh sách đăng ký/chờ liên quan. Hành động này <strong>không thể hoàn tác</strong>. Bạn có chắc chắn đồng ý xóa?
                </div>
              </div>
            )}

            {deleteModalError && (
              <div style={{ color: 'var(--portal-danger, #fca5a5)', fontSize: '0.88rem' }}>
                {deleteModalError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
              {deleteConfirmStep === 1 ? (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleCloseDeleteModal}
                    disabled={isSubmitting}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setDeleteConfirmStep(2)}
                    data-testid="delete-confirm-step1-btn"
                  >
                    Tiếp tục xác nhận lần 2
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setDeleteConfirmStep(1)}
                    disabled={isSubmitting}
                  >
                    Quay lại bước 1
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={handleConfirmDeleteClass}
                    disabled={isSubmitting}
                    data-testid="delete-confirm-step2-btn"
                  >
                    {isSubmitting ? 'Đang xóa...' : 'Xác nhận xóa vĩnh viễn'}
                  </button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Tạo lớp học và xếp lịch (Manager Only) */}
      {isManager && showModal && (
        <Modal title={createMode === 'existing' ? 'Thêm buổi học cho lớp' : 'Tạo lớp học & xếp lịch'} onClose={handleCloseModal}>
          <div className="filter-chips" role="group" aria-label="Kiểu tạo lịch" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`filter-chip ${createMode === 'new' ? 'is-active' : ''}`}
              aria-pressed={createMode === 'new'}
              onClick={() => { setCreateMode('new'); setModalError(null); }}
              disabled={isSubmitting}
            >
              Lớp mới
            </button>
            <button
              type="button"
              className={`filter-chip ${createMode === 'existing' ? 'is-active' : ''}`}
              aria-pressed={createMode === 'existing'}
              onClick={() => { setCreateMode('existing'); setModalError(null); }}
              disabled={isSubmitting || classes.length === 0}
            >
              Thêm buổi cho lớp có sẵn
            </button>
          </div>
          {createMode === 'existing' ? (
            <form onSubmit={handleAddSession} style={{ display: 'grid', gap: 11 }}>
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="existing-class">Lớp học *</label>
                <Select
                  id="existing-class"
                  className="portal-select"
                  value={existingClassId}
                  onChange={(e) => { setExistingClassId(e.target.value); setModalError(null); }}
                  disabled={isSubmitting}
                >
                  <option value="">-- Chọn lớp học --</option>
                  {classes.filter((cls) => (cls.status || '').toUpperCase() === 'ACTIVE').map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} · {cls.roomName ?? `Phòng #${cls.roomId}`}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="add-session-date">Ngày học *</label>
                <DatePicker
                  id="add-session-date"
                  required
                  min={getTodayString()}
                  value={formData.sessionDate}
                  onChange={(e) => setFormData({ ...formData, sessionDate: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
              <div className="grid-2">
                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="add-session-start">Giờ bắt đầu *</label>
                  <TimePicker
                    id="add-session-start"
                    required
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="add-session-end">Giờ kết thúc *</label>
                  <TimePicker
                    id="add-session-end"
                    required
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
              {(modalError || addSessionConflictWarning) && (
                <div className="form-error" role="alert" data-testid="add-session-error">
                  {modalError || addSessionConflictWarning}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" className="btn-secondary" onClick={handleCloseModal} disabled={isSubmitting}>
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmitting || !existingClass || Boolean(addSessionConflictWarning)}
                  data-testid="submit-add-session-button"
                >
                  {isSubmitting ? 'Đang lưu...' : 'Thêm buổi học'}
                </button>
              </div>
            </form>
          ) : catalogsLoading ? <LoadingSkeleton label="Đang tải bộ môn, phòng tập và huấn luyện viên…" count={4} />
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
                placeholder="Ví dụ: Gym cơ bản, Bơi sải nâng cao..."
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
                    Giờ bắt đầu *
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
                    Giờ kết thúc *
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

            {/* Hiển thị lỗi form hoặc cảnh báo trùng lịch trực tiếp trong Modal */}
            {(modalError || createScheduleConflictWarning) && (
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
                role="alert"
                data-testid="schedule-conflict-warning"
              >
                <span style={{ fontWeight: 700 }}>!</span>
                <span>{modalError || createScheduleConflictWarning}</span>
              </div>
            )}

            {/* BR-05: Chặn bấm đúp (disable nút khi đang gửi hoặc khi tên/lịch bị trùng) */}
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
                disabled={isSubmitting || isDuplicateClassName || Boolean(createScheduleConflictWarning)}
                data-testid="submit-class-button"
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner" />
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  'Lưu & xếp lịch'
                )}
              </button>
            </div>
          </form>}
        </Modal>
      )}
    </div>
  );
}
