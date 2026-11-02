import { coachHistoryStorageKey } from './coachHistoryStorage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCurrentUser } from '../../shared/api/client';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { Modal } from '../../shared/ui/Modal';
import { Select } from '../../shared/ui/Select';
import {
  coachingApi,
  type CoachSession,
  type EnrolledStudent,
} from './coachingApi';
import './coach-classes.css';

interface StoredAttendanceStudent {
  id: number | string;
  memberId: number;
  fullName: string;
  membershipCode: string;
  status: 'present' | 'absent';
  notes: string;
}

interface StoredAttendanceSession {
  sessionId: number | string;
  savedAt: string;
  presentCount: number;
  absentCount: number;
  totalStudents: number;
  rate: number;
  students: StoredAttendanceStudent[];
}

interface StoredEvaluationStudent {
  id: number | string;
  memberId: number;
  fullName: string;
  membershipCode: string;
  progressScore: number;
  notes: string;
}

interface StoredEvaluationSession {
  sessionId: number | string;
  savedAt: string;
  averageScore: number;
  totalStudents: number;
  students: StoredEvaluationStudent[];
}


function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatYmd(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DAY_NAMES = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];

export function CoachClassesPage() {
  const currentUser = getCurrentUser();

  // Tab chuyển đổi: 'schedule' (Thời khóa biểu) hoặc 'students' (Học viên phụ trách)
  const [activeTab, setActiveTab] = useState<'schedule' | 'students'>('schedule');

  const [currentMonday, setCurrentMonday] = useState<Date>(() => getWeekMonday(new Date()));
  const [selectedDayOffset, setSelectedDayOffset] = useState<number>(0);
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Tab Học viên phụ trách
  const [allStudents, setAllStudents] = useState<EnrolledStudent[]>([]);
  const [allStudentsError, setAllStudentsError] = useState<string | null>(null);
  const [allStudentsLoading, setAllStudentsLoading] = useState<boolean>(false);
  const [allStudentsSearch, setAllStudentsSearch] = useState<string>('');
  const [allStudentsLevelFilter, setAllStudentsLevelFilter] = useState<string>('all');

  // Modal xem danh sách học viên theo từng buổi học
  const [activeSession, setActiveSession] = useState<CoachSession | null>(null);
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState<boolean>(false);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [selectedFitnessFilter, setSelectedFitnessFilter] = useState<string>('all');
  const [modalViewMode, setModalViewMode] = useState<'students' | 'attendance' | 'evaluation'>('students');

  // Lấy dữ liệu điểm danh của buổi học (từ localStorage của tài khoản hiện tại)
  const sessionAttendanceData = useMemo(() => {
    if (!activeSession) return null;
    try {
      const stored = localStorage.getItem(coachHistoryStorageKey('attendance'));
      if (stored) {
        const historyList = JSON.parse(stored);
        const found = historyList.find((h: StoredAttendanceSession) => h.sessionId === activeSession.id);
        if (found) return { ...found, rate: found.totalStudents > 0 ? Math.round(found.presentCount / found.totalStudents * 100) : 0 };
      }
    } catch {
      // ignore
    }

    return null;
  }, [activeSession]);

  // Lấy dữ liệu đánh giá của buổi học (từ localStorage của tài khoản hiện tại)
  const sessionEvaluationData = useMemo(() => {
    if (!activeSession) return null;
    try {
      const stored = localStorage.getItem(coachHistoryStorageKey('evaluation'));
      if (stored) {
        const historyList = JSON.parse(stored);
        const found = historyList.find((h: StoredEvaluationSession) => h.sessionId === activeSession.id);
        if (found) return found;
      }
    } catch {
      // ignore
    }

    return null;
  }, [activeSession]);

  const filteredAttendanceStudents = useMemo(() => {
    if (!sessionAttendanceData) return [];
    return sessionAttendanceData.students.filter((st: StoredAttendanceStudent) => {
      const q = studentSearch.trim().toLowerCase();
      return (
        !q ||
        st.fullName.toLowerCase().includes(q) ||
        st.membershipCode.toLowerCase().includes(q) ||
        (st.status === 'present' ? 'có mặt' : 'vắng mặt').includes(q)
      );
    });
  }, [sessionAttendanceData, studentSearch]);

  const filteredEvalStudents = useMemo(() => {
    if (!sessionEvaluationData) return [];
    return sessionEvaluationData.students.filter((st: StoredEvaluationStudent) => {
      const q = studentSearch.trim().toLowerCase();
      return (
        !q ||
        st.fullName.toLowerCase().includes(q) ||
        st.membershipCode.toLowerCase().includes(q) ||
        (st.notes && st.notes.toLowerCase().includes(q))
      );
    });
  }, [sessionEvaluationData, studentSearch]);

  // Tải danh sách toàn bộ học viên phụ trách
  useEffect(() => {
    let mounted = true;
    const fetchAllStudents = async () => {
      setAllStudentsLoading(true);
      setAllStudentsError(null);
      try {
        const res = await coachingApi.getAllAssignedStudents();
        if (mounted) setAllStudents(res);
      } catch {
        if (mounted) setAllStudentsError('Không thể tải danh sách học viên phụ trách.');
      } finally {
        if (mounted) setAllStudentsLoading(false);
      }
    };
    void fetchAllStudents();
    return () => {
      mounted = false;
    };
  }, [currentUser?.id]);

  const filteredAllStudents = useMemo(() => {
    return allStudents.filter((st) => {
      const q = allStudentsSearch.trim().toLowerCase();
      const matchSearch =
        !q ||
        st.fullName.toLowerCase().includes(q) ||
        st.membershipCode.toLowerCase().includes(q) ||
        (st.phone && st.phone.includes(q)) ||
        st.email.toLowerCase().includes(q);
      const matchLevel =
        allStudentsLevelFilter === 'all' || st.fitnessLevel === allStudentsLevelFilter;
      return matchSearch && matchLevel;
    });
  }, [allStudents, allStudentsSearch, allStudentsLevelFilter]);

  const daysOfWeek = useMemo(() => {
    return Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date(currentMonday);
      d.setDate(d.getDate() + idx);
      return {
        idx,
        name: DAY_NAMES[idx],
        dateStr: formatYmd(d),
        displayDate: `${d.getDate()}/${d.getMonth() + 1}`,
        rawDate: d,
      };
    });
  }, [currentMonday]);

  const selectedDateStr = daysOfWeek[selectedDayOffset]?.dateStr;

  const loadWeeklySessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const mondayStr = formatYmd(currentMonday);
      const res = await coachingApi.getCoachWeeklySchedule(mondayStr);
      setSessions(res);
    } catch {
      setError('Không thể tải lịch dạy của tuần này. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [currentMonday]);

  useEffect(() => {
    void loadWeeklySessions();
  }, [loadWeeklySessions]);

  const handlePrevWeek = () => {
    setCurrentMonday((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const handleNextWeek = () => {
    setCurrentMonday((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const handleThisWeek = () => {
    const todayMonday = getWeekMonday(new Date());
    setCurrentMonday(todayMonday);
    const today = new Date();
    const dayOfWeek = today.getDay();
    setSelectedDayOffset(dayOfWeek === 0 ? 6 : dayOfWeek - 1);
  };

  const dailySessions = useMemo(() => {
    return sessions.filter((s) => s.sessionDate === selectedDateStr);
  }, [sessions, selectedDateStr]);

  const handleOpenStudentsModal = async (session: CoachSession) => {
    setActiveSession(session);
    setStudentsLoading(true);
    setStudents([]);
    setStudentsError(null);
    setStudentSearch('');
    setSelectedFitnessFilter('all');
    setModalViewMode('students');
    try {
      const res = await coachingApi.getSessionStudents(session.id, session.classId);
      setStudents(res);
    } catch {
      setStudentsError('Không thể tải danh sách học viên buổi học này.');
    } finally {
      setStudentsLoading(false);
    }
  };

  const handleCloseModal = () => {
    setActiveSession(null);
    setStudents([]);
  };

  const filteredStudents = useMemo(() => {
    return students.filter((st) => {
      const matchSearch =
        st.fullName.toLowerCase().includes(studentSearch.toLowerCase()) ||
        (st.membershipCode ?? '').toLowerCase().includes(studentSearch.toLowerCase()) ||
        (st.phone && st.phone.includes(studentSearch));
      const matchLevel =
        selectedFitnessFilter === 'all' || st.fitnessLevel === selectedFitnessFilter;
      return matchSearch && matchLevel;
    });
  }, [students, studentSearch, selectedFitnessFilter]);

  const weekRangeLabel = useMemo(() => {
    const sunday = new Date(currentMonday);
    sunday.setDate(sunday.getDate() + 6);
    return `${currentMonday.getDate()}/${currentMonday.getMonth() + 1} - ${sunday.getDate()}/${sunday.getMonth() + 1}/${sunday.getFullYear()}`;
  }, [currentMonday]);

  return (
    <div className="portal-container coach-page">
      <PageHeader
        eyebrow="Huấn luyện viên"
        title="Thời Khóa Biểu & Học Viên Phụ Trách"
        subtitle={
          activeTab === 'schedule'
            ? `HLV: ${currentUser?.name || 'Huấn luyện viên'} | Theo dõi lịch đứng lớp theo ngày và tuần.`
            : `HLV: ${currentUser?.name || 'Huấn luyện viên'} | Quản lý thông tin sức khỏe, mục tiêu thể lực và thông tin liên hệ của học viên.`
        }
      />

      {/* Phân hệ Tab: Thời khóa biểu vs Học viên phụ trách */}
      <div className="coach-nav-tabs" role="tablist" aria-label="Phân hệ chức năng HLV">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'schedule'}
          className={`coach-tab-btn ${activeTab === 'schedule' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          Thời khóa biểu
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'students'}
          className={`coach-tab-btn ${activeTab === 'students' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('students')}
        >
          Học viên phụ trách
        </button>
      </div>

      {/* ====================================================================
          TAB 1: THỜI KHÓA BIỂU
          ==================================================================== */}
      {activeTab === 'schedule' && (
        <>
          <div className="coach-week-bar">
            <div className="coach-week-nav">
              <span className="coach-week-range">Tuần {weekRangeLabel}</span>
            </div>
            <div className="coach-week-actions">
              <button
                type="button"
                className="btn-nav-week"
                onClick={handlePrevWeek}
                aria-label="Tuần trước"
              >
                ← Tuần trước
              </button>
              <button
                type="button"
                className="btn-nav-week is-today"
                onClick={handleThisWeek}
              >
                Tuần hiện tại
              </button>
              <button
                type="button"
                className="btn-nav-week"
                onClick={handleNextWeek}
                aria-label="Tuần sau"
              >
                Tuần sau →
              </button>
            </div>

            <div className="coach-day-strip">
              {daysOfWeek.map((day) => {
                const countForDay = sessions.filter((s) => s.sessionDate === day.dateStr).length;
                const isActive = day.idx === selectedDayOffset;
                return (
                  <button
                    key={day.dateStr}
                    type="button"
                    className={`coach-day-tab ${isActive ? 'is-active' : ''}`}
                    onClick={() => setSelectedDayOffset(day.idx)}
                  >
                    <span className="coach-day-name">{day.name}</span>
                    <span className="coach-day-date">{day.displayDate}</span>
                    {countForDay > 0 && (
                      <span className="coach-day-badge">{countForDay} lớp</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {loading && (
            <LoadingSkeleton label="Đang tải lịch dạy của huấn luyện viên…" variant="cards" count={3} />
          )}

          {error && !loading && (
            <div className="coach-error-box">
              <p>{error}</p>
              <button type="button" className="btn-retry" onClick={loadWeeklySessions}>
                Thử lại
              </button>
            </div>
          )}

          {!loading && !error && (
            <div className="coach-session-section">
              <div className="coach-section-header">
                <h3>
                  Lịch đứng lớp ngày {daysOfWeek[selectedDayOffset]?.name} (
                  {daysOfWeek[selectedDayOffset]?.displayDate})
                </h3>
                <span className="session-count-tag">{dailySessions.length} buổi học</span>
              </div>

              {dailySessions.length === 0 ? (
                <div className="coach-empty-box">
                  <p>Không có buổi dạy nào trong ngày này.</p>
                  <span>HLV có thể nghỉ ngơi hoặc chuẩn bị giáo án cho các buổi tiếp theo.</span>
                </div>
              ) : (
                <div className="coach-session-grid">
                  {dailySessions.map((session) => (
                    <div key={session.id} className="coach-session-card">
                      <div className="coach-session-top">
                        <div className="coach-session-time">
                          <span className="time-text">
                            {session.startTime} - {session.endTime}
                          </span>
                        </div>
                        <span className={`status-pill status-${session.status}`}>
                          {session.status === 'scheduled'
                            ? 'Sắp diễn ra'
                            : session.status === 'completed'
                            ? 'Đã xong'
                            : 'Hủy'}
                        </span>
                      </div>

                      <h4 className="coach-class-title">{session.className}</h4>
                      <p className="coach-discipline-tag">{session.disciplineName || 'Fitness'}</p>

                      <div className="coach-session-info">
                        <div className="info-row">
                          <span className="info-label">Phòng:</span>
                          <span className="info-value">{session.roomName || 'Studio chính'}</span>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Sĩ số:</span>
                          <span className="info-value">
                            {session.bookedCount} / {session.capacity} học viên
                          </span>
                        </div>
                        {session.level && (
                          <div className="info-row">
                            <span className="info-label">Trình độ:</span>
                            <span className="info-value">{session.level}</span>
                          </div>
                        )}
                      </div>

                      <div className="coach-card-actions">
                        <button
                          type="button"
                          className="btn-view-students"
                          onClick={() => handleOpenStudentsModal(session)}
                        >
                          Xem lịch sử ({session.bookedCount})
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ====================================================================
          TAB 2: HỌC VIÊN PHỤ TRÁCH (Tách riêng biệt)
          ==================================================================== */}
      {activeTab === 'students' && (
        <div className="coach-students-section">
          <div className="coach-students-header">
            <div>
              <h3 className="coach-students-title">Danh sách học viên phụ trách</h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'var(--portal-muted)' }}>
                Theo dõi tình trạng sức khỏe, mục tiêu thể lực và lập lộ trình huấn luyện cho học viên.
              </p>
            </div>
            <span className="coach-students-count">
              Tổng số: <strong>{allStudents.length} học viên</strong>
            </span>
          </div>

          <div className="coach-students-filter-bar">
            <input
              type="text"
              className="portal-input"
              style={{ flex: '1 1 280px' }}
              placeholder="Tìm theo tên học viên, mã thẻ, SĐT hoặc email..."
              value={allStudentsSearch}
              onChange={(e) => setAllStudentsSearch(e.target.value)}
            />
            <select
              className="portal-select"
              style={{ flex: '0 0 200px' }}
              value={allStudentsLevelFilter}
              onChange={(e) => setAllStudentsLevelFilter(e.target.value)}
            >
              <option value="all">Tất cả trình độ</option>
              <option value="beginner">Cơ bản (Beginner)</option>
              <option value="intermediate">Trung cấp (Intermediate)</option>
              <option value="advanced">Nâng cao (Advanced)</option>
            </select>
          </div>

          {allStudentsLoading ? (
            <LoadingSkeleton label="Đang tải danh sách học viên phụ trách…" variant="cards" count={4} />
          ) : allStudentsError ? (
            <div className="coach-error-box" role="alert"><p>{allStudentsError}</p></div>
          ) : filteredAllStudents.length === 0 ? (
            <div className="coach-empty-box">
              <p>Không tìm thấy học viên nào phù hợp.</p>
              <span>Vui lòng kiểm tra lại từ khóa tìm kiếm hoặc bộ lọc trình độ.</span>
            </div>
          ) : (
            <div className="coach-students-grid">
              {filteredAllStudents.map((st) => (
                <div key={st.id} className="student-card-item">
                  <div className="student-card-header">
                    <div className="student-avatar-col">
                      <div className="student-avatar-fallback">
                        {st.fullName.charAt(0).toUpperCase()}
                      </div>
                    </div>
                    <div className="student-main-col">
                      <div className="student-name-row">
                        <h4 className="student-name">{st.fullName}</h4>
                        <span className="student-code-tag">{st.membershipCode}</span>
                        <span className={`fitness-level-pill level-${st.fitnessLevel}`}>
                          {st.fitnessLevel === 'beginner'
                            ? 'Cơ bản'
                            : st.fitnessLevel === 'intermediate'
                            ? 'Trung cấp'
                            : 'Nâng cao'}
                        </span>
                      </div>
                      <div className="student-contact-row">
                        <span>Email: {st.email}</span>
                        {st.phone && <span>SĐT: {st.phone}</span>}
                        {st.emergencyContactName && (
                          <span className="emergency-tag">
                            Khẩn cấp: {st.emergencyContactName} ({st.emergencyContactPhone || 'N/A'})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="student-details-grid">
                    <div className="student-detail-box goal-box">
                      <span className="box-title">Mục tiêu thể lực (fitness_goal):</span>
                      <p className="box-content">{st.fitnessGoal || 'Chưa cập nhật'}</p>
                    </div>

                    <div className="student-detail-box health-box">
                      <span className="box-title">Lưu ý sức khỏe & Chấn thương (health_notes):</span>
                      <p className="box-content warning-text">
                        {st.healthNotes || 'Sức khỏe bình thường, không có ghi chú chấn thương.'}
                      </p>
                    </div>
                  </div>

                  <div className="student-card-item-footer">
                    <span>Học viên chính thức của trung tâm</span>
                    <Link to="/coach/training-plans" className="btn-plan-for-student">
                      Soạn giáo án bài tập →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          MODAL XEM HỌC VIÊN THEO BUỔI HỌC (Không có icon/emoji)
          ==================================================================== */}
      {activeSession && (
        <Modal
          className="coach-students-modal-dialog"
          title={`Học viên lớp ${activeSession.className} (${activeSession.startTime} - ${activeSession.endTime})`}
          onClose={handleCloseModal}
        >
          <div className="students-modal-body">
            <div className="students-modal-filter-bar">
              <input
                type="text"
                className="portal-input student-search-input"
                placeholder={
                  modalViewMode === 'attendance'
                    ? 'Tìm theo tên học viên hoặc trạng thái có mặt/vắng...'
                    : modalViewMode === 'evaluation'
                    ? 'Tìm theo tên học viên hoặc nội dung nhận xét...'
                    : 'Tìm theo tên học viên, mã thẻ hoặc SĐT...'
                }
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
              />
              <Select
                className="portal-select student-level-filter"
                value={modalViewMode}
                onChange={(e) => setModalViewMode(e.target.value as 'students' | 'attendance' | 'evaluation')}
                aria-label="Chọn chế độ xem"
              >
                <option value="students">Xem học viên</option>
                <option value="attendance">Lịch sử điểm danh (trình duyệt này)</option>
                <option value="evaluation">Đánh giá học viên (trình duyệt này)</option>
              </Select>
            </div>

            {studentsLoading ? (
              <LoadingSkeleton label="Đang tải dữ liệu của buổi học…" count={4} />
            ) : modalViewMode === 'attendance' ? (
              /* CHẾ ĐỘ 2: LỊCH SỬ ĐIỂM DANH */
              <div className="students-list-wrap">
                {sessionAttendanceData && (
                  <div className="history-summary-banner">
                    <span className="history-stat-badge is-present">
                      Có mặt: {sessionAttendanceData.presentCount}
                    </span>
                    <span className="history-stat-badge is-absent">
                      Vắng mặt: {sessionAttendanceData.absentCount}
                    </span>
                    <span className="history-stat-badge is-rate">
                      Tỷ lệ chuyên cần: {sessionAttendanceData.rate}%
                    </span>
                    <span className="history-timestamp">
                      Đã lưu: {sessionAttendanceData.savedAt}
                    </span>
                  </div>
                )}

                {filteredAttendanceStudents.length === 0 ? (
                  <div className="students-empty-state">
                    <p>Không tìm thấy bản ghi điểm danh nào phù hợp.</p>
                  </div>
                ) : (
                  filteredAttendanceStudents.map((st: StoredAttendanceStudent) => (
                    <div key={st.id} className="history-record-card">
                      <div className="history-record-header">
                        <div className="student-card-header">
                          <div className="student-avatar-col">
                            <div className="student-avatar-fallback">
                              {st.fullName.charAt(0).toUpperCase()}
                            </div>
                          </div>
                          <div className="student-main-col">
                            <div className="student-name-row">
                              <h4 className="student-name">{st.fullName}</h4>
                              <span className="student-code-tag">{st.membershipCode}</span>
                            </div>
                          </div>
                        </div>
                        <span className={`status-pill ${st.status === 'present' ? 'is-present' : 'is-absent'}`}>
                          {st.status === 'present' ? 'Có mặt' : 'Vắng mặt'}
                        </span>
                      </div>
                      <div className="history-notes-box">
                        <span className="history-notes-label">Ghi chú chuyên cần: </span>
                        <span>{st.notes || 'Không có ghi chú.'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : modalViewMode === 'evaluation' ? (
              /* CHẾ ĐỘ 3: ĐÁNH GIÁ HỌC VIÊN */
              <div className="students-list-wrap">
                {sessionEvaluationData && (
                  <div className="history-summary-banner">
                    <span className="history-stat-badge is-score">
                      Điểm trung bình: {sessionEvaluationData.averageScore}/100
                    </span>
                    <span className="history-stat-badge is-rate">
                      Đã đánh giá: {sessionEvaluationData.totalStudents} học viên
                    </span>
                    <span className="history-timestamp">
                      Đã lưu: {sessionEvaluationData.savedAt}
                    </span>
                  </div>
                )}

                {filteredEvalStudents.length === 0 ? (
                  <div className="students-empty-state">
                    <p>Không tìm thấy bản ghi đánh giá nào phù hợp.</p>
                  </div>
                ) : (
                  filteredEvalStudents.map((st: StoredEvaluationStudent) => (
                    <div key={st.id} className="history-record-card">
                      <div className="history-record-header">
                        <div className="student-card-header">
                          <div className="student-avatar-col">
                            <div className="student-avatar-fallback">
                              {st.fullName.charAt(0).toUpperCase()}
                            </div>
                          </div>
                          <div className="student-main-col">
                            <div className="student-name-row">
                              <h4 className="student-name">{st.fullName}</h4>
                              <span className="student-code-tag">{st.membershipCode}</span>
                            </div>
                          </div>
                        </div>
                        <span className="score-badge">
                          {st.progressScore}/100 điểm
                        </span>
                      </div>

                      <div className="history-score-row">
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--portal-salmon)', minWidth: '85px' }}>
                          Tiến bộ:
                        </span>
                        <div className="history-score-bar-track">
                          <div
                            className="history-score-bar-fill"
                            style={{ width: `${Math.min(100, Math.max(0, st.progressScore))}%` }}
                          />
                        </div>
                        <span style={{ fontSize: '0.82rem', color: 'var(--portal-muted)', minWidth: '35px', textAlign: 'right' }}>
                          {st.progressScore}%
                        </span>
                      </div>

                      <div className="history-notes-box">
                        <span className="history-notes-label">Nhận xét kỹ thuật: </span>
                        <span>{st.notes || 'Đạt yêu cầu buổi tập.'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : studentsError ? (
              <div className="students-empty-state" role="alert"><p>{studentsError}</p></div>
            ) : filteredStudents.length === 0 ? (
              /* CHẾ ĐỘ 1: XEM HỌC VIÊN */
              <div className="students-empty-state">
                <p>Không tìm thấy học viên nào phù hợp.</p>
              </div>
            ) : (
              <div className="students-list-wrap">
                {filteredStudents.map((st) => (
                  <div key={st.id} className="student-card-item">
                    <div className="student-card-header">
                      <div className="student-avatar-col">
                        <div className="student-avatar-fallback">
                          {st.fullName.charAt(0).toUpperCase()}
                        </div>
                      </div>
                      <div className="student-main-col">
                        <div className="student-name-row">
                          <h4 className="student-name">{st.fullName}</h4>
                          <span className="student-code-tag">{st.membershipCode}</span>
                          <span className={`fitness-level-pill level-${st.fitnessLevel}`}>
                            {st.fitnessLevel === 'beginner'
                              ? 'Cơ bản'
                              : st.fitnessLevel === 'intermediate'
                              ? 'Trung cấp'
                              : st.fitnessLevel === 'advanced' ? 'Nâng cao' : 'Chưa cập nhật'}
                          </span>
                        </div>
                        <div className="student-contact-row">
                          <span>Email: {st.email}</span>
                          {st.phone && <span>SĐT: {st.phone}</span>}
                          {st.emergencyContactName && (
                            <span className="emergency-tag">
                              Khẩn cấp: {st.emergencyContactName} ({st.emergencyContactPhone || 'N/A'})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="student-details-grid">
                      <div className="student-detail-box goal-box">
                        <span className="box-title">Mục tiêu thể lực (fitness_goal):</span>
                        <p className="box-content">{st.fitnessGoal || 'Chưa cập nhật'}</p>
                      </div>

                      <div className="student-detail-box health-box">
                        <span className="box-title">Lưu ý sức khỏe & Chấn thương (health_notes):</span>
                        <p className="box-content warning-text">
                          {st.healthNotes || 'Chưa cập nhật'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="students-modal-footer">
              <span className="footer-count">
                {modalViewMode === 'attendance'
                  ? `Hiển thị ${filteredAttendanceStudents.length} / ${sessionAttendanceData?.students.length || 0} bản ghi điểm danh`
                  : modalViewMode === 'evaluation'
                  ? `Hiển thị ${filteredEvalStudents.length} / ${sessionEvaluationData?.students.length || 0} bản ghi đánh giá`
                  : `Hiển thị ${filteredStudents.length} / ${students.length} học viên`}
              </span>
              <button type="button" className="btn-secondary" onClick={handleCloseModal}>
                Đóng
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
