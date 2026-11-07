import { staffLocale, staffTranslation, staffMessage, useStaffI18n, type StaffMessage, staffError as errorMessage, staffNotify as notify } from '../operations/staffI18n';
import { coachHistoryStorageKey } from './coachHistoryStorage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { Select } from '../../shared/ui/Select';
import { Modal } from '../../shared/ui/Modal';
import { formatCenterDate, formatTimeRange } from '../../shared/lib/centerTime';
import { useConfirm } from '../../shared/ui/ConfirmDialog';
import {
  attendanceApi,
  type AttendanceStudent,
  type CoachClassSession,
} from './attendanceApi';
import { WeeklyTimetable } from '../schedule/WeeklyTimetable';
import { mondayOf, parseISODate, todayISO } from '../schedule/timetable';
import { coachSessionEvents } from './coachTimetable';
import './coach-attendance.css';

// Chỉ giữ lại 2 trạng thái điểm danh: Có mặt và Vắng mặt (đã bỏ Đi muộn & Có phép)
const STATUS_CONFIG: {
  value: 'present' | 'absent';
  label: string;
  className: string;
  indicatorColor: string;
}[] = [
  { value: 'present', label: 'Có mặt', className: 'is-present', indicatorColor: 'var(--portal-success)' },
  { value: 'absent', label: 'Vắng mặt', className: 'is-absent', indicatorColor: 'var(--portal-danger)' },
];

export interface AttendanceHistoryRecord {
  id: string;
  sessionId: number;
  className: string;
  roomName: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  savedAt: string;
  presentCount: number;
  absentCount: number;
  totalStudents: number;
  students: AttendanceStudent[];
}

export interface EvaluationHistoryRecord {
  id: string;
  sessionId: number;
  className: string;
  roomName: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  savedAt: string;
  averageScore: number;
  totalStudents: number;
  students: AttendanceStudent[];
}


export function CoachAttendancePage() {
  const { t } = useStaffI18n();
  const STORAGE_KEY_HISTORY = coachHistoryStorageKey('attendance');
  const STORAGE_KEY_EVAL_HISTORY = coachHistoryStorageKey('evaluation');
  const [activeTab, setActiveTab] = useState<'attendance' | 'evaluation' | 'attendance-history' | 'eval-history'>('attendance');
  const [sessions, setSessions] = useState<CoachClassSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [loadedSessionId, setLoadedSessionId] = useState<number | null>(null);
  const [rosterError, setRosterError] = useState<StaffMessage | null>(null);
  const [students, setStudents] = useState<AttendanceStudent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savingEvaluation, setSavingEvaluation] = useState<boolean>(false);

  // Modal sửa điểm danh giữa màn hình (ở lại tab Lịch sử)
  const [editingAttendanceRecord, setEditingAttendanceRecord] = useState<AttendanceHistoryRecord | null>(null);

  // Modal sửa đánh giá giữa màn hình (ở lại tab Lịch sử)
  const [editingEvalRecord, setEditingEvalRecord] = useState<EvaluationHistoryRecord | null>(null);

  const [sessionsError, setSessionsError] = useState<StaffMessage | null>(null);
  const [sessionsAttempt, setSessionsAttempt] = useState(0);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayISO()));
  const [classFilter, setClassFilter] = useState('ALL');
  const headerRef = useRef<HTMLDivElement>(null);
  const [confirm, confirmDialog] = useConfirm();
  const showCenterNotification = useCallback((msg: string = 'Cập nhật thành công') => notify(msg, 'success'), []);

  // Lịch sử điểm danh (hỗ trợ lưu, sửa trong popup, xoá)
  const [history, setHistory] = useState<AttendanceHistoryRecord[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_HISTORY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {// Fallback
    }
    return [];
  });

  // Lịch sử đánh giá học viên (hỗ trợ lưu, sửa trong popup, xoá)
  const [evalHistory, setEvalHistory] = useState<EvaluationHistoryRecord[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_EVAL_HISTORY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {// Fallback
    }
    return [];
  });

  // Đồng bộ lịch sử điểm danh vào localStorage
  const saveHistoryToStorage = (updated: AttendanceHistoryRecord[]) => {
    setHistory(updated);
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated));
    } catch {// ignore
    }
  };

  // Đồng bộ lịch sử đánh giá vào localStorage
  const saveEvalHistoryToStorage = (updated: EvaluationHistoryRecord[]) => {
    setEvalHistory(updated);
    try {
      localStorage.setItem(STORAGE_KEY_EVAL_HISTORY, JSON.stringify(updated));
    } catch {// ignore
    }
  };

  // Load danh sách buổi học của HLV
  useEffect(() => {
    let mounted = true;
    const fetchSessions = async () => {
      setLoading(true);
      setSessionsError(null);
      try {
        const data = await attendanceApi.getCoachSessions();
        if (mounted) {
          setSessions(data);
          if (data.length > 0) {
            // Mở sẵn buổi gần hôm nay nhất (ưu tiên buổi đã có học viên) và tuần chứa buổi đó.
            const withStudents = data.filter((s) => (s.bookedCount ?? 0) > 0);
            const pool = withStudents.length > 0 ? withStudents : data;
            const today = parseISODate(todayISO()).getTime();
            const distance = (s: CoachClassSession) => Math.abs(parseISODate(s.sessionDate).getTime() - today);
            const preferred = pool.reduce((best, s) => (distance(s) < distance(best) ? s : best), pool[0]);
            setSelectedSessionId((prev) => (prev === null ? preferred.id : prev));
            setWeekStart(mondayOf(preferred.sessionDate));
          }
        }
      } catch {if (mounted) setSessionsError('Không thể tải danh sách buổi học của bạn.');
      } finally {
        if (mounted) { setLoading(false); setSessionsLoaded(true); }
      }
    };

    fetchSessions();
    return () => {
      mounted = false;
    };
  }, [sessionsAttempt]);

  // Load danh sách học viên khi chọn buổi học khác
  useEffect(() => {
    if (!selectedSessionId) return;

    let mounted = true;
    const fetchStudents = async () => {
      setLoading(true);
      setStudents([]);
      setLoadedSessionId(null);
      setRosterError(null);
      try {
        const list = await attendanceApi.getSessionStudents(selectedSessionId);
        if (mounted) {
          // Chuẩn hóa trạng thái: chỉ giữ 'present' hoặc 'absent'
          const normalized = list.map((item) => ({
            ...item,
            status: (item.status === 'present' ? 'present' : 'absent') as 'present' | 'absent',
            progressScore: item.progressScore || 80,
            notes: item.notes || '',
          }));
          setStudents(normalized);
          setLoadedSessionId(selectedSessionId);
        }
      } catch {if (mounted) {
          setRosterError('Không thể tải danh sách học viên của buổi học. Vui lòng chọn lại buổi học.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchStudents();
    return () => {
      mounted = false;
    };
  }, [selectedSessionId]);

  const rosterReady = selectedSessionId !== null && loadedSessionId === selectedSessionId && !loading && !rosterError;

  const activeSession = useMemo(() => {
    return sessions.find((s) => s.id === selectedSessionId) ;
  }, [sessions, selectedSessionId]);

  // Kiểm tra buổi hiện tại đã được lưu hay chưa
  const currentSavedRecord = useMemo(() => {
    return history.find((h) => h.sessionId === selectedSessionId);
  }, [history, selectedSessionId]);

  // Cập nhật trạng thái điểm danh cho 1 học viên (chỉ có Có mặt hoặc Vắng mặt)
  const handleUpdateStatus = (studentId: number, status: 'present' | 'absent') => {
    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, status } : s))
    );
  };

  // Cập nhật thang điểm tiến bộ (tab Đánh giá)
  const handleUpdateScore = (studentId: number, score: number) => {
    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, progressScore: score } : s))
    );
  };

  // Cập nhật nhận xét kỹ thuật (tab Đánh giá)
  const handleUpdateNotes = (studentId: number, notes: string) => {
    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, notes } : s))
    );
  };

  // Điểm danh nhanh: Đặt tất cả thành Có mặt
  const handleMarkAllPresent = () => {
    setStudents((prev) => prev.map((s) => ({ ...s, status: 'present' })));
  };

  // Lưu hoặc Cập nhật điểm danh (Tab Điểm danh)
  const handleSaveAttendance = async () => {
    if (!selectedSessionId || !activeSession || !rosterReady || saving || savingEvaluation) {
      notify('Vui lòng chọn buổi học cần lưu điểm danh.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = students.map((s) => ({
        memberId: s.memberId,
        status: s.status,
        progressScore: s.progressScore,
        notes: s.notes.trim(),
      }));

      await attendanceApi.saveBatchAttendance(selectedSessionId, payload);

      const presentCount = students.filter((s) => s.status === 'present').length;
      const absentCount = students.filter((s) => s.status === 'absent').length;
      const nowFormatted = new Date().toLocaleString(staffLocale(), {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      const updatedHistoryItem: AttendanceHistoryRecord = {
        id: `hist-${selectedSessionId}-${Date.now()}`,
        sessionId: selectedSessionId,
        className: activeSession.className,
        roomName: activeSession.roomName,
        sessionDate: activeSession.sessionDate,
        startTime: activeSession.startTime,
        endTime: activeSession.endTime,
        savedAt: nowFormatted,
        presentCount,
        absentCount,
        totalStudents: students.length,
        students: [...students],
      };

      const filtered = history.filter((h) => h.sessionId !== selectedSessionId);
      const newHistory = [updatedHistoryItem, ...filtered];
      saveHistoryToStorage(newHistory);

      showCenterNotification(
        currentSavedRecord
          ? 'Đã cập nhật lại điểm danh thành công!'
          : 'Lưu điểm danh thành công!'
      );
    } catch (err) { notify(errorMessage(err, 'Có lỗi xảy ra khi lưu điểm danh. Vui lòng thử lại.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // Lưu Đánh giá học viên (Tab Đánh giá riêng)
  const handleSaveEvaluations = async () => {
    if (!selectedSessionId || !activeSession || !rosterReady || saving || savingEvaluation) {
      notify('Vui lòng chọn buổi học cần lưu đánh giá.', 'error');
      return;
    }

    setSavingEvaluation(true);
    try {
      const payload = students.map((s) => ({
        memberId: s.memberId,
        status: s.status,
        progressScore: s.progressScore,
        notes: s.notes.trim(),
      }));

      await attendanceApi.saveBatchAttendance(selectedSessionId, payload, true);

      const totalScore = students.reduce((acc, s) => acc + (s.progressScore || 80), 0);
      const averageScore = students.length > 0 ? Math.round(totalScore / students.length) : 0;
      const nowFormatted = new Date().toLocaleString(staffLocale(), {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      const updatedEvalItem: EvaluationHistoryRecord = {
        id: `eval-${selectedSessionId}-${Date.now()}`,
        sessionId: selectedSessionId,
        className: activeSession.className,
        roomName: activeSession.roomName,
        sessionDate: activeSession.sessionDate,
        startTime: activeSession.startTime,
        endTime: activeSession.endTime,
        savedAt: nowFormatted,
        averageScore,
        totalStudents: students.length,
        students: [...students],
      };

      const filtered = evalHistory.filter((h) => h.sessionId !== selectedSessionId);
      const newEvalHistory = [updatedEvalItem, ...filtered];
      saveEvalHistoryToStorage(newEvalHistory);

      showCenterNotification('Đã gửi đánh giá tiến độ và thông báo đến học viên.');
    } catch (err) { notify(errorMessage(err, 'Có lỗi xảy ra khi lưu đánh giá. Vui lòng thử lại.'), 'error');
    } finally {
      setSavingEvaluation(false);
    }
  };

  // Xoá điểm danh buổi hiện tại
  const confirmHide = () => confirm({
    title: staffMessage('Ẩn bản ghi?', staffTranslation('Ẩn bản ghi?')),
    message: staffMessage('Bản ghi chỉ bị ẩn trên trình duyệt này. Dữ liệu đã lưu trên hệ thống vẫn được giữ nguyên.', staffTranslation('Bản ghi chỉ bị ẩn trên trình duyệt này. Dữ liệu đã lưu trên hệ thống vẫn được giữ nguyên.')),
    confirmLabel: staffMessage('Ẩn bản ghi', staffTranslation('Ẩn bản ghi')),
  });

  const handleDeleteCurrentAttendance = async () => {
    if (!selectedSessionId || !(await confirmHide())) return;
    const filtered = history.filter((h) => h.sessionId !== selectedSessionId);
    saveHistoryToStorage(filtered);
  };

  // Mở modal sửa điểm danh trực tiếp giữa màn hình (Không chuyển tab)
  const handleOpenEditAttendanceModal = (record: AttendanceHistoryRecord) => {
    setEditingAttendanceRecord({
      ...record,
      students: record.students.map((s) => ({ ...s })),
    });
  };

  // Thay đổi trạng thái học viên trong Modal sửa điểm danh
  const handleUpdateModalAttendanceStatus = (studentId: number, status: 'present' | 'absent') => {
    if (!editingAttendanceRecord) return;
    setEditingAttendanceRecord({
      ...editingAttendanceRecord,
      students: editingAttendanceRecord.students.map((s) =>
        s.id === studentId ? { ...s, status } : s
      ),
    });
  };

  // Lưu cập nhật từ Modal sửa điểm danh
  const handleSaveModalAttendance = async () => {
    if (!editingAttendanceRecord) return;
    setSaving(true);
    try {
      const latest = await attendanceApi.getSessionStudents(editingAttendanceRecord.sessionId);
      const latestByMember = new Map(latest.map(student => [student.memberId, student]));
      const updatedStudents = editingAttendanceRecord.students.map(student => {
        const current = latestByMember.get(student.memberId);
        return {
          ...student,
          progressScore: current?.progressScore ?? student.progressScore,
          notes: current?.notes ?? student.notes,
        };
      });
      await attendanceApi.saveBatchAttendance(editingAttendanceRecord.sessionId, updatedStudents.map(student => ({
        memberId: student.memberId,
        status: student.status,
        progressScore: student.progressScore,
        notes: student.notes.trim(),
      })));

      const presentCount = editingAttendanceRecord.students.filter((s) => s.status === 'present').length;
      const absentCount = editingAttendanceRecord.students.filter((s) => s.status === 'absent').length;
      const nowFormatted = new Date().toLocaleString(staffLocale(), {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      const updatedRecord: AttendanceHistoryRecord = {
        ...editingAttendanceRecord,
        students: updatedStudents,
        presentCount,
        absentCount,
        savedAt: nowFormatted,
      };

      const newHistory = history.map((h) =>
        h.id === updatedRecord.id ? updatedRecord : h
      );
      saveHistoryToStorage(newHistory);

      if (selectedSessionId === updatedRecord.sessionId) {
        setStudents(updatedRecord.students);
      }

      setEditingAttendanceRecord(null);
      showCenterNotification('Cập nhật thành công');
    } catch {notify('Không thể lưu cập nhật. Vui lòng thử lại.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Mở modal sửa đánh giá trực tiếp giữa màn hình (Không chuyển tab)
  const handleOpenEditEvalModal = (record: EvaluationHistoryRecord) => {
    setEditingEvalRecord({
      ...record,
      students: record.students.map((s) => ({ ...s })),
    });
  };

  // Cập nhật điểm trong Modal sửa đánh giá
  const handleUpdateModalEvalScore = (studentId: number, score: number) => {
    if (!editingEvalRecord) return;
    setEditingEvalRecord({
      ...editingEvalRecord,
      students: editingEvalRecord.students.map((s) =>
        s.id === studentId ? { ...s, progressScore: score } : s
      ),
    });
  };

  // Cập nhật nhận xét trong Modal sửa đánh giá
  const handleUpdateModalEvalNotes = (studentId: number, notes: string) => {
    if (!editingEvalRecord) return;
    setEditingEvalRecord({
      ...editingEvalRecord,
      students: editingEvalRecord.students.map((s) =>
        s.id === studentId ? { ...s, notes } : s
      ),
    });
  };

  // Lưu cập nhật từ Modal sửa đánh giá
  const handleSaveModalEval = async () => {
    if (!editingEvalRecord) return;
    setSaving(true);
    try {
      const latest = await attendanceApi.getSessionStudents(editingEvalRecord.sessionId);
      const latestByMember = new Map(latest.map(student => [student.memberId, student]));
      const updatedStudents = editingEvalRecord.students.map(student => {
        const current = latestByMember.get(student.memberId);
        return { ...student, status: current?.status ?? student.status };
      });
      await attendanceApi.saveBatchAttendance(editingEvalRecord.sessionId, updatedStudents.map(student => ({
        memberId: student.memberId,
        status: student.status,
        progressScore: student.progressScore,
        notes: student.notes.trim(),
      })), true);

      const totalScore = editingEvalRecord.students.reduce((acc, s) => acc + (s.progressScore || 80), 0);
      const averageScore =
        editingEvalRecord.students.length > 0
          ? Math.round(totalScore / editingEvalRecord.students.length)
          : 0;
      const nowFormatted = new Date().toLocaleString(staffLocale(), {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      const updatedRecord: EvaluationHistoryRecord = {
        ...editingEvalRecord,
        students: updatedStudents,
        averageScore,
        savedAt: nowFormatted,
      };

      const newEvalHistory = evalHistory.map((h) =>
        h.id === updatedRecord.id ? updatedRecord : h
      );
      saveEvalHistoryToStorage(newEvalHistory);

      if (selectedSessionId === updatedRecord.sessionId) {
        setStudents(updatedRecord.students);
      }

      setEditingEvalRecord(null);
      showCenterNotification('Cập nhật thành công');
    } catch {notify('Không thể lưu cập nhật. Vui lòng thử lại.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Xoá bản ghi trong Lịch sử điểm danh
  const handleDeleteFromHistory = async (recordId: string) => {
    if (!(await confirmHide())) return;
    const updated = history.filter((h) => h.id !== recordId);
    saveHistoryToStorage(updated);
  };

  // Xoá bản ghi trong Lịch sử đánh giá
  const handleDeleteFromEvalHistory = async (recordId: string) => {
    if (!(await confirmHide())) return;
    const updated = evalHistory.filter((h) => h.id !== recordId);
    saveEvalHistoryToStorage(updated);
  };

  // Thống kê nhanh trạng thái (chỉ Có mặt và Vắng mặt)
  const summaryCounts = useMemo(() => {
    const present = students.filter((s) => s.status === 'present').length;
    const absent = students.filter((s) => s.status === 'absent').length;
    const total = students.length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    return { present, absent, total, rate };
  }, [students]);

  return (
    <div data-i18n-managed className="coach-attendance-page portal-container">
      <PageHeader
        eyebrow={t("Huấn luyện viên")}
        title={
          activeTab === 'evaluation'
            ? t('Đánh giá tiến bộ học viên')
            : activeTab === 'attendance-history'
            ? t('Lịch sử điểm danh lớp học')
            : activeTab === 'eval-history'
            ? t('Lịch sử đánh giá học viên')
            : t('Điểm danh buổi học')
        }
      />

      {/* Tabs chuyển đổi giữa 4 mục: Điểm danh, Đánh giá, Lịch sử điểm danh, Lịch sử đánh giá */}
      <div className="attendance-nav-tabs">
        <button
          type="button"
          className={`attendance-tab-btn ${activeTab === 'attendance' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('attendance')}
        >
          {t("Điểm danh buổi học")}</button>
        <button
          type="button"
          className={`attendance-tab-btn ${activeTab === 'evaluation' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('evaluation')}
        >
          {t("Đánh giá học viên")}</button>
        <button
          type="button"
          className={`attendance-tab-btn ${activeTab === 'attendance-history' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('attendance-history')}
        >
          {t("Lịch sử điểm danh (")}{history.length})
        </button>
        <button
          type="button"
          className={`attendance-tab-btn ${activeTab === 'eval-history' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('eval-history')}
        >
          {t("Lịch sử đánh giá (")}{evalHistory.length})
        </button>
      </div>

      {sessionsError && (activeTab === 'attendance' || activeTab === 'evaluation') && (
        <div data-i18n-managed className="coach-error-box" role="alert">
          {t(sessionsError)}{' '}
          <button type="button" className="btn-secondary btn-sm" onClick={() => setSessionsAttempt((n) => n + 1)}>{t("Thử lại")}</button>
        </div>
      )}

      {/* Chọn buổi học trên thời khóa biểu tuần (Dùng cho tab Điểm danh & Đánh giá) */}
      {!sessionsError && (activeTab === 'attendance' || activeTab === 'evaluation') && (
        <WeeklyTimetable
          label={t("Thời khóa biểu buổi dạy cần điểm danh")}
          weekStart={weekStart}
          events={coachSessionEvents(
            sessions.filter((s) => classFilter === 'ALL' || s.className === classFilter),
            'attendance',
            new Set(history.map((h) => Number(h.sessionId))),
          )}
          loading={!sessionsLoaded}
          selectedId={selectedSessionId === null ? undefined : String(selectedSessionId)}
          disabled={saving || savingEvaluation}
          onWeekChange={setWeekStart}
          onEventClick={(id) => {
            setSelectedSessionId(Number(id));
            // Bảng cao hơn một màn hình: đưa thông tin buổi và danh sách học viên vào tầm nhìn.
            const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            headerRef.current?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
          }}
          emptyLabel={t("Tuần này bạn chưa có buổi dạy nào.")}
          toolbar={
            <div className="attendance-class-filter">
              <Select
                className="portal-select"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                aria-label={t("Lọc theo lớp")}
              >
                <option value="ALL">{t("Tất cả lớp")}</option>
                {[...new Set(sessions.map((s) => s.className))].sort((a, b) => a.localeCompare(b)).map((name) => (
                  <option data-i18n-managed key={name} value={name}>{name}</option>
                ))}
              </Select>
            </div>
          }
          legend={[
            { tone: 'open', label: t('Sắp diễn ra') },
            { tone: 'full', label: t('Đã diễn ra, chưa điểm danh') },
            { tone: 'mine', label: t('Đã điểm danh') },
            { tone: 'cancelled', label: t('Đã hủy') },
          ]}
        />
      )}

      {/* Header Selector & Session Info (Dùng cho tab Điểm danh & Đánh giá) */}
      {!sessionsError && (activeTab === 'attendance' || activeTab === 'evaluation') && (
        <div data-i18n-managed className="attendance-header-card" ref={headerRef}>
          <div className="attendance-session-meta">
            <div className="session-title-wrap">
              <h3 className="session-name-title">
                {activeSession?.className || t('Buổi tập Huấn luyện viên')}
              </h3>
              {currentSavedRecord ? (
                <span data-i18n-managed className="session-status-badge is-saved">
                  {t("Đã lưu điểm danh lúc ")}{currentSavedRecord.savedAt}
                </span>
              ) : (
                <span data-i18n-managed className="session-status-badge is-pending">
                  {t("Chưa lưu điểm danh")}</span>
              )}
            </div>
            <div className="session-details-row">
              <span>
                {t("Phòng: ")}<strong>{activeSession?.roomName || t('Studio chính')}</strong>
              </span>
              <span>
                {t("Ngày: ")}<strong>{activeSession ? formatCenterDate(activeSession.sessionDate) : '—'}</strong>
              </span>
              <span>
                {t("Giờ: ")}<strong>{activeSession ? formatTimeRange(activeSession.startTime, activeSession.endTime) : '—'}</strong>
              </span>
              <span>
                {t("Đã đăng ký: ")}<strong>{students.length} {t(" học viên")}</strong>
              </span>
              {activeSession?.disciplineName && (
                <span data-i18n-managed>
                  {t("Bộ môn: ")}<strong>{activeSession.disciplineName}</strong>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {rosterError && (activeTab === 'attendance' || activeTab === 'evaluation') && (
        <div data-i18n-managed className="coach-error-box" role="alert">{t(rosterError)}</div>
      )}

      {/* =========================================================================
          TAB 1: ĐIỂM DANH BUỔI HỌC (Thuần túy điểm danh Có mặt / Vắng mặt)
          ========================================================================= */}
      {activeTab === 'attendance' && (
        <>
          {/* Quick Summary: Chỉ giữ Có mặt và Vắng mặt */}
          <div data-i18n-managed className="attendance-quick-summary">
            <div className="summary-pill-card is-present">
              <span className="pill-label">{t("Có mặt")}</span>
              <span className="pill-value">{summaryCounts.present}</span>
            </div>
            <div className="summary-pill-card is-absent">
              <span className="pill-label">{t("Vắng mặt")}</span>
              <span className="pill-value">{summaryCounts.absent}</span>
            </div>
            <div className="summary-pill-card">
              <span className="pill-label">{t("Tổng học viên")}</span>
              <span className="pill-value">{summaryCounts.total}</span>
            </div>
            <div className="summary-pill-card">
              <span className="pill-label">{t("Tỷ lệ chuyên cần")}</span>
              <span className="pill-value" style={{ color: 'var(--portal-salmon)' }}>
                {summaryCounts.rate}%
              </span>
            </div>
          </div>

          {/* Toolbar */}
          <div data-i18n-managed className="attendance-toolbar">
            <span style={{ fontSize: '0.9rem', color: 'var(--portal-muted)' }}>
              {t("Danh sách ")}<strong>{students.length}</strong> {t(" học viên đã ghi danh:")}</span>
            <div className="toolbar-btn-group">
              <button
                type="button"
                className="btn-quick-present"
                onClick={handleMarkAllPresent}
                disabled={!rosterReady || saving || savingEvaluation || students.length === 0}
              >
                {t("Điểm danh nhanh tất cả Có mặt")}</button>
              {currentSavedRecord && (
                <button data-i18n-managed
                  type="button"
                  className="btn-delete-attendance"
                  onClick={handleDeleteCurrentAttendance}
                  title={t("Ẩn bản ghi trên trình duyệt này")}
                >
                  {t("Ẩn trên trình duyệt này")}</button>
              )}
            </div>
          </div>

          {/* Danh sách học viên ĐIỂM DANH */}
          {loading ? (
            <LoadingSkeleton label={t("Đang tải danh sách học viên buổi học…")} count={5} />
          ) : students.length === 0 ? (
            <div data-i18n-managed style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-muted)' }}>
              <p>{t("Chưa có học viên nào book buổi học này.")}</p>
            </div>
          ) : (
            <div data-i18n-managed className="attendance-students-list">
              {students.map((student) => {
                return (
                  <div data-i18n-managed key={student.id} className="attendance-student-card">
                    <div className="student-card-top-row">
                      <div className="student-identity-group">
                        <div className="student-avatar-circle">
                          {student.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div className="student-meta-text">
                          <h4 className="student-full-name">{student.fullName}</h4>
                          <span className="student-code-badge">{student.membershipCode}</span>
                        </div>
                      </div>

                      {/* Chỉ có Radio chọn Có mặt / Vắng mặt */}
                      <div
                        className="attendance-radio-group"
                        role="radiogroup"
                        aria-label={t(`Trạng thái điểm danh của ${student.fullName}`, `Attendance status for ${student.fullName}`)}
                      >
                        {STATUS_CONFIG.map((cfg) => {
                          const isSelected = student.status === cfg.value;
                          return (
                            <label data-i18n-managed
                              key={cfg.value}
                              className={`radio-status-label ${cfg.className} ${isSelected ? 'is-active' : ''}`}
                            >
                              <input data-i18n-managed
                                type="radio"
                                name={`attendance-status-${student.id}`}
                                value={cfg.value}
                                checked={isSelected}
                                onChange={() => handleUpdateStatus(student.id, cfg.value)}
                              />
                              <span data-i18n-managed
                                style={{
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  backgroundColor: cfg.indicatorColor,
                                  display: 'inline-block',
                                }}
                              />
                              {t(cfg.label)}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom Save Action */}
          <div data-i18n-managed className="attendance-bottom-actions">
            <button
              type="button"
              className="btn-batch-save"
              onClick={handleSaveAttendance}
              disabled={saving || savingEvaluation || !rosterReady || students.length === 0}
            >
              {saving
                ? t('Đang lưu...')
                : currentSavedRecord
                ? t('Cập nhật điểm danh')
                : t('Lưu điểm danh')}
            </button>
          </div>
        </>
      )}

      {/* =========================================================================
          TAB 2: ĐÁNH GIÁ HỌC VIÊN TÁCH RIÊNG (Chuyên biệt cho Chấm điểm & Nhận xét)
          ========================================================================= */}
      {activeTab === 'evaluation' && (
        <div data-i18n-managed className="attendance-evaluation-section">
          <div className="evaluation-section-header">
            <div>
              <h3 className="section-title">{t("Đánh giá tiến bộ kỹ thuật học viên")}</h3>
            </div>
          </div>

          {loading ? (
            <LoadingSkeleton label={t("Đang tải danh sách học viên…")} variant="cards" count={3} />
          ) : students.length === 0 ? (
            <div data-i18n-managed className="attendance-empty-state">
              <p>{t("Chưa có học viên nào trong buổi học này để đánh giá.")}</p>
            </div>
          ) : (
            <div data-i18n-managed className="evaluation-cards-list">
              {students.map((student) => {
                return (
                  <div data-i18n-managed key={student.id} className="evaluation-card">
                    <div className="evaluation-card-header">
                      <div className="student-identity-group">
                        <div className="student-avatar-circle">
                          {student.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div className="student-meta-text">
                          <h4 className="student-full-name">{student.fullName}</h4>
                          <span className="student-code-badge">{student.membershipCode}</span>
                        </div>
                      </div>

                      <div className="evaluation-status-tag">
                        <span className={`status-pill ${student.status === 'present' ? 'is-present' : 'is-absent'}`}>
                          {student.status === 'present' ? t('Có mặt') : t('Vắng mặt')}
                        </span>
                      </div>
                    </div>

                    <div className="evaluation-card-body">
                      {/* Thang điểm tiến bộ */}
                      <div className="eval-form-row">
                        <div className="eval-slider-header">
                          <span className="eval-label">{t("Thang điểm tiến bộ (Progress Score):")}</span>
                          <span className="score-badge">{student.progressScore || 80}/100</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          className="eval-score-slider"
                          value={student.progressScore || 80}
                          onChange={(e) => handleUpdateScore(student.id, Number(e.target.value))}
                          aria-label={t(`Điểm tiến bộ của ${student.fullName}`, `Progress score for ${student.fullName}`)}
                        />
                      </div>

                      {/* Ô nhận xét kỹ thuật */}
                      <div className="eval-form-row">
                        <label className="eval-label" htmlFor={`notes-${student.id}`}>
                          {t("Nhận xét kỹ thuật, động tác và lưu ý sức khỏe:")}</label>
                        <textarea
                          id={`notes-${student.id}`}
                          className="eval-comment-textarea"
                          rows={2}
                          placeholder={t("Ví dụ: Kiểm soát cơ lõi tốt, giữ thẳng lưng khi thực hiện động tác kéo cáp...")}
                          value={student.notes}
                          onChange={(e) => handleUpdateNotes(student.id, e.target.value)}
                          aria-label={t(`Nhận xét kỹ thuật của ${student.fullName}`, `Technical feedback for ${student.fullName}`)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom Save Evaluations Action */}
          <div className="attendance-bottom-actions">
            <button
              type="button"
              className="btn-batch-save"
              onClick={handleSaveEvaluations}
              disabled={saving || savingEvaluation || !rosterReady || students.length === 0}
            >
              {savingEvaluation ? t('Đang lưu đánh giá...') : t('Lưu tất cả đánh giá')}
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: LỊCH SỬ ĐIỂM DANH (Sửa trực tiếp bằng khung giữa màn hình, không nhảy tab)
          ========================================================================= */}
      {activeTab === 'attendance-history' && (
        <div data-i18n-managed className="attendance-history-section">
          <div className="history-header-bar">
            <div>
              <h3 className="section-title">{t("Lịch sử các buổi đã điểm danh")}</h3>
            </div>
          </div>

          {history.length === 0 ? (
            <div data-i18n-managed className="attendance-empty-state">
              <p>{t("Chưa có lịch sử điểm danh nào được lưu.")}</p>
            </div>
          ) : (
            <div data-i18n-managed className="history-cards-grid">
              {history.map((record) => {
                const rate =
                  record.totalStudents > 0
                    ? Math.round((record.presentCount / record.totalStudents) * 100)
                    : 0;

                return (
                  <div data-i18n-managed key={record.id} className="history-record-card">
                    <div className="history-card-header">
                      <div>
                        <h4 className="history-class-name">{record.className}</h4>
                        <div className="history-meta-sub">
                          <span>{t("Phòng: ")}{record.roomName}</span>
                          <span>•</span>
                          <span>
                            {formatTimeRange(record.startTime, record.endTime)}
                          </span>
                          <span>•</span>
                          <span>{t("Ngày: ")}{record.sessionDate}</span>
                        </div>
                      </div>
                      <span className="history-saved-badge">{t("Đã lưu: ")}{record.savedAt}</span>
                    </div>

                    <div className="history-stat-row">
                      <div className="stat-pill is-present">
                        <span className="stat-label">{t("Có mặt:")}</span>
                        <span className="stat-num">{record.presentCount}</span>
                      </div>
                      <div className="stat-pill is-absent">
                        <span className="stat-label">{t("Vắng mặt:")}</span>
                        <span className="stat-num">{record.absentCount}</span>
                      </div>
                      <div className="stat-pill is-total">
                        <span className="stat-label">{t("Tổng học viên:")}</span>
                        <span className="stat-num">{record.totalStudents}</span>
                      </div>
                      <div className="stat-pill is-rate">
                        <span className="stat-label">{t("Tỷ lệ:")}</span>
                        <span className="stat-num">{rate}%</span>
                      </div>
                    </div>

                    <div className="history-actions-row">
                      <button
                        type="button"
                        className="btn-history-edit"
                        onClick={() => handleOpenEditAttendanceModal(record)}
                      >
                        {t("Sửa điểm danh")}</button>
                      <button
                        type="button"
                        className="btn-history-delete"
                        onClick={() => handleDeleteFromHistory(record.id)}
                      >
                  {t("Ẩn trên trình duyệt này")}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 4: LỊCH SỬ ĐÁNH GIÁ (Mới bổ sung theo yêu cầu)
          ========================================================================= */}
      {activeTab === 'eval-history' && (
        <div data-i18n-managed className="attendance-history-section">
          <div className="history-header-bar">
            <div>
              <h3 className="section-title">{t("Lịch sử đánh giá tiến bộ học viên")}</h3>
            </div>
          </div>

          {evalHistory.length === 0 ? (
            <div data-i18n-managed className="attendance-empty-state">
              <p>{t("Chưa có lịch sử đánh giá nào được lưu.")}</p>
            </div>
          ) : (
            <div data-i18n-managed className="history-cards-grid">
              {evalHistory.map((record) => {
                return (
                  <div data-i18n-managed key={record.id} className="history-record-card">
                    <div className="history-card-header">
                      <div>
                        <h4 className="history-class-name">{record.className}</h4>
                        <div className="history-meta-sub">
                          <span>{t("Phòng: ")}{record.roomName}</span>
                          <span>•</span>
                          <span>
                            {formatTimeRange(record.startTime, record.endTime)}
                          </span>
                          <span>•</span>
                          <span>{t("Ngày: ")}{record.sessionDate}</span>
                        </div>
                      </div>
                      <span className="history-saved-badge">{t("Đã đánh giá: ")}{record.savedAt}</span>
                    </div>

                    <div className="history-stat-row">
                      <div className="stat-pill is-rate">
                        <span className="stat-label">{t("Điểm trung bình lớp:")}</span>
                        <span className="stat-num">{record.averageScore}/100</span>
                      </div>
                      <div className="stat-pill is-total">
                        <span className="stat-label">{t("Đã đánh giá:")}</span>
                        <span className="stat-num">{record.totalStudents} {t(" học viên")}</span>
                      </div>
                    </div>

                    <div className="history-actions-row">
                      <button
                        type="button"
                        className="btn-history-edit"
                        onClick={() => handleOpenEditEvalModal(record)}
                      >
                        {t("Sửa đánh giá")}</button>
                      <button
                        type="button"
                        className="btn-history-delete"
                        onClick={() => handleDeleteFromEvalHistory(record.id)}
                      >
                  {t("Ẩn trên trình duyệt này")}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          MODAL SỬA ĐIỂM DANH NGAY GIỮA MÀN HÌNH (Không chuyển tab)
          ========================================================================= */}
      {editingAttendanceRecord && (
        <Modal
          title={t(`Sửa điểm danh: ${editingAttendanceRecord.className}`, `Edit attendance: ${editingAttendanceRecord.className}`)}
          busy={saving}
          onClose={() => setEditingAttendanceRecord(null)}
        >
          <div className="modal-edit-container">
            <div className="modal-record-meta-bar">
              <span>{t("Phòng: ")}<strong>{editingAttendanceRecord.roomName}</strong></span>
              <span>{t("Giờ: ")}<strong>{formatTimeRange(editingAttendanceRecord.startTime, editingAttendanceRecord.endTime)}</strong></span>
              <span>{t("Ngày: ")}<strong>{editingAttendanceRecord.sessionDate}</strong></span>
            </div>

            <div className="modal-students-edit-list">
              {editingAttendanceRecord.students.map((student) => {
                return (
                  <div data-i18n-managed key={student.id} className="modal-student-edit-item">
                    <div className="student-identity-group">
                      <div className="student-avatar-circle">
                        {student.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div className="student-meta-text">
                        <h4 className="student-full-name">{student.fullName}</h4>
                        <span className="student-code-badge">{student.membershipCode}</span>
                      </div>
                    </div>

                    {/* Radio 2 trạng thái: Có mặt / Vắng mặt */}
                    <div className="attendance-radio-group">
                      {STATUS_CONFIG.map((cfg) => {
                        const isSelected = student.status === cfg.value;
                        return (
                          <label data-i18n-managed
                            key={cfg.value}
                            className={`radio-status-label ${cfg.className} ${isSelected ? 'is-active' : ''}`}
                          >
                            <input data-i18n-managed
                              type="radio"
                              name={`modal-status-${student.id}`}
                              value={cfg.value}
                              checked={isSelected}
                              onChange={() => handleUpdateModalAttendanceStatus(student.id, cfg.value)}
                            />
                            <span data-i18n-managed
                              style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: cfg.indicatorColor,
                                display: 'inline-block',
                              }}
                            />
                            {t(cfg.label)}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="modal-footer-actions">
              <button
                type="button"
                className="btn-modal-cancel"
                disabled={saving}
                onClick={() => setEditingAttendanceRecord(null)}
              >
                {t("Hủy bỏ")}</button>
              <button
                type="button"
                className="btn-modal-save"
                disabled={saving}
                onClick={handleSaveModalAttendance}
              >
                {t("Lưu cập nhật")}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* =========================================================================
          MODAL SỬA ĐÁNH GIÁ NGAY GIỮA MÀN HÌNH (Không chuyển tab)
          ========================================================================= */}
      {editingEvalRecord && (
        <Modal
          title={t(`Sửa đánh giá tiến bộ: ${editingEvalRecord.className}`, `Edit progress evaluation: ${editingEvalRecord.className}`)}
          busy={saving}
          onClose={() => setEditingEvalRecord(null)}
        >
          <div className="modal-edit-container">
            <div className="modal-record-meta-bar">
              <span>{t("Phòng: ")}<strong>{editingEvalRecord.roomName}</strong></span>
              <span>{t("Giờ: ")}<strong>{formatTimeRange(editingEvalRecord.startTime, editingEvalRecord.endTime)}</strong></span>
              <span>{t("Ngày: ")}<strong>{editingEvalRecord.sessionDate}</strong></span>
            </div>

            <div className="modal-students-edit-list">
              {editingEvalRecord.students.map((student) => {
                return (
                  <div data-i18n-managed key={student.id} className="modal-eval-student-item">
                    <div className="evaluation-card-header">
                      <div className="student-identity-group">
                        <div className="student-avatar-circle">
                          {student.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div className="student-meta-text">
                          <h4 className="student-full-name">{student.fullName}</h4>
                          <span className="student-code-badge">{student.membershipCode}</span>
                        </div>
                      </div>
                      <span className={`status-pill ${student.status === 'present' ? 'is-present' : 'is-absent'}`}>
                        {student.status === 'present' ? t('Có mặt') : t('Vắng mặt')}
                      </span>
                    </div>

                    <div className="eval-form-row" style={{ marginTop: '10px' }}>
                      <div className="eval-slider-header">
                        <span className="eval-label">{t("Thang điểm tiến bộ:")}</span>
                        <span className="score-badge">{student.progressScore || 80}/100</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="100"
                        className="eval-score-slider"
                        value={student.progressScore || 80}
                        onChange={(e) => handleUpdateModalEvalScore(student.id, Number(e.target.value))}
                        aria-label={t(`Điểm tiến bộ của ${student.fullName}`, `Progress score for ${student.fullName}`)}
                      />
                    </div>

                    <div className="eval-form-row">
                      <label className="eval-label" htmlFor={`modal-notes-${student.id}`}>
                        {t("Nhận xét kỹ thuật:")}</label>
                      <textarea
                        id={`modal-notes-${student.id}`}
                        className="eval-comment-textarea"
                        rows={2}
                        value={student.notes}
                        onChange={(e) => handleUpdateModalEvalNotes(student.id, e.target.value)}
                        aria-label={t(`Nhận xét kỹ thuật của ${student.fullName}`, `Technical feedback for ${student.fullName}`)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="modal-footer-actions">
              <button
                type="button"
                className="btn-modal-cancel"
                disabled={saving}
                onClick={() => setEditingEvalRecord(null)}
              >
                {t("Hủy bỏ")}</button>
              <button
                type="button"
                className="btn-modal-save"
                disabled={saving}
                onClick={handleSaveModalEval}
              >
                {t("Lưu cập nhật")}</button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDialog}
    </div>
  );
}
