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
import { formatPrice } from '../../shared/lib/membershipPresentation';
import {
  getCoachSchedule,
  type CoachBookingDto,
} from '../member/coachBookingApi';
import {
  getMyMonthlyReviews,
  getCoachLeaderboard,
  getCoachReviews,
  type CoachMonthlyReviewDto,
  type CoachLeaderboardItemDto,
  type CoachReviewDto,
} from './coachReviewApi';
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
  const [activeTab, setActiveTab] = useState<'schedule' | 'students' | 'ranking'>('schedule');

  const [currentMonday, setCurrentMonday] = useState<Date>(() => getWeekMonday(new Date()));
  const [selectedDayOffset, setSelectedDayOffset] = useState<number>(0);
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [coach1on1Bookings, setCoach1on1Bookings] = useState<CoachBookingDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Ranking & Reviews Tab State
  const now = new Date();
  const [reviewYear, setReviewYear] = useState<number>(now.getFullYear());
  const [reviewMonth, setReviewMonth] = useState<number>(now.getMonth() + 1);
  const [myMonthlyReviews, setMyMonthlyReviews] = useState<CoachMonthlyReviewDto[]>([]);
  const [leaderboard, setLeaderboard] = useState<CoachLeaderboardItemDto[]>([]);
  const [studentReviews, setStudentReviews] = useState<CoachReviewDto[]>([]);
  const [rankingLoading, setRankingLoading] = useState<boolean>(false);
  const [rankingError, setRankingError] = useState<string | null>(null);

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
      const [classSessions, ptBookings] = await Promise.all([
        coachingApi.getCoachWeeklySchedule(mondayStr),
        getCoachSchedule().catch(() => []),
      ]);
      setSessions(classSessions);
      setCoach1on1Bookings(ptBookings);
    } catch {
      setError('Không thể tải lịch dạy của tuần này. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [currentMonday]);

  useEffect(() => {
    void loadWeeklySessions();
  }, [loadWeeklySessions]);

  const loadRankingData = useCallback(async () => {
    setRankingLoading(true);
    setRankingError(null);
    try {
      const [myReviews, board] = await Promise.all([
        getMyMonthlyReviews().catch(() => []),
        getCoachLeaderboard(reviewYear, reviewMonth).catch(() => []),
      ]);
      setMyMonthlyReviews(myReviews);
      setLeaderboard(board);

      // Identify coachId
      const myCoachId =
        myReviews[0]?.coachId ||
        board.find((b) => b.coachName === currentUser?.name)?.coachId;
      if (myCoachId) {
        const reviews = await getCoachReviews(myCoachId).catch(() => []);
        setStudentReviews(reviews);
      }
    } catch {
      setRankingError('Không thể tải dữ liệu xếp hạng và đánh giá tháng.');
    } finally {
      setRankingLoading(false);
    }
  }, [reviewYear, reviewMonth, currentUser?.name]);

  useEffect(() => {
    if (activeTab === 'ranking') {
      void loadRankingData();
    }
  }, [activeTab, loadRankingData]);

  const currentMonthReview = useMemo(() => {
    return (
      myMonthlyReviews.find(
        (r) => r.year === reviewYear && r.month === reviewMonth
      ) ||
      myMonthlyReviews[0] ||
      null
    );
  }, [myMonthlyReviews, reviewYear, reviewMonth]);

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

  const daily1on1Bookings = useMemo(() => {
    return coach1on1Bookings.filter(
      (b) => b.bookingDate === selectedDateStr && b.status === 'confirmed'
    );
  }, [coach1on1Bookings, selectedDateStr]);

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
        <button type="button" role="tab" aria-selected={activeTab === 'ranking'}
          className={`coach-tab-btn ${activeTab === 'ranking' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('ranking')}>Đánh Giá & Bảng Xếp Hạng Tháng</button>
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
                const countForDay = sessions.filter((s) => s.sessionDate === day.dateStr).length + coach1on1Bookings.filter((booking) => booking.bookingDate === day.dateStr && booking.status === 'confirmed').length;
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
              {/* Section 1: Lịch Kèm Riêng PT 1:1 */}
              <div>
                <div className="coach-section-header">
                  <h3>
                    Lịch kèm riêng PT 1:1 ngày {daysOfWeek[selectedDayOffset]?.name} (
                    {daysOfWeek[selectedDayOffset]?.displayDate})
                  </h3>
                  <span
                    className="session-count-tag"
                    style={{
                      background:
                        daily1on1Bookings.length > 0
                          ? 'var(--portal-salmon, #ce9180)'
                          : undefined,
                      color: daily1on1Bookings.length > 0 ? '#fff' : undefined,
                    }}
                  >
                    {daily1on1Bookings.length} buổi kèm 1:1
                  </span>
                </div>

                {daily1on1Bookings.length === 0 ? (
                  <div className="coach-empty-box" style={{ padding: '18px 24px' }}>
                    <p style={{ margin: 0 }}>Chưa có lịch đặt kèm 1:1 nào trong ngày này.</p>
                  </div>
                ) : (
                  <div className="coach-session-grid">
                    {daily1on1Bookings.map((b) => (
                      <div
                        key={b.id}
                        className="coach-session-card"
                        style={{
                          borderColor: 'rgba(206, 145, 128, 0.45)',
                          background:
                            'linear-gradient(135deg, rgba(206, 145, 128, 0.08) 0%, rgba(206, 145, 128, 0.02) 100%)',
                        }}
                      >
                        <div className="coach-session-top">
                          <div className="coach-session-time">
                            <span className="time-icon" aria-hidden="true" />
                            <span className="time-text">
                              {b.startTime.slice(0, 5)} - {b.endTime.slice(0, 5)}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 750,
                              padding: '3px 8px',
                              borderRadius: 99,
                              background: 'var(--portal-salmon, #ce9180)',
                              color: '#fff',
                            }}
                          >
                            PT 1:1 Riêng
                          </span>
                        </div>

                        <h4 className="coach-class-title" style={{ fontSize: 16 }}>
                          Học viên: {b.memberName}
                        </h4>
                        <p className="coach-discipline-tag">
                          {b.disciplineName || 'Huấn luyện cá nhân'}
                        </p>

                        <div className="coach-session-info">
                          <div className="info-row">
                            <span className="info-label">Hình thức:</span>
                            <span className="info-value">
                              {b.paymentMethod === 'package_quota'
                                ? '🎁 Quyền lợi gói tập'
                                : '💳 Hội viên trả phí'}
                            </span>
                          </div>
                          <div className="info-row">
                            <span className="info-label">Trạng thái:</span>
                            <span
                              className="info-value"
                              style={{
                                color: 'var(--portal-success, #226442)',
                                fontWeight: 650,
                              }}
                            >
                              ✓ Đã xác nhận
                            </span>
                          </div>
                          {b.notes && (
                            <div
                              className="info-row"
                              style={{ gridColumn: '1 / -1', marginTop: 4 }}
                            >
                              <span className="info-label">Ghi chú học viên:</span>
                              <span className="info-value" style={{ fontStyle: 'italic' }}>
                                {b.notes}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

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
      {/* Tab 2: Ranking & Reviews View */}
      {activeTab === 'ranking' && (
        <div style={{ display: 'grid', gap: 28 }}>
          {/* Period selector */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              background: 'var(--portal-card-bg, #ffffff)',
              padding: '16px 24px',
              borderRadius: 16,
              border: '1px solid var(--portal-border, rgba(0,0,0,0.08))',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Kỳ đánh giá:</span>
              <Select
                value={String(reviewMonth)}
                onChange={(e) => setReviewMonth(Number(e.target.value))}
                style={{ width: 130 }}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    Tháng {m}
                  </option>
                ))}
              </Select>
              <Select
                value={String(reviewYear)}
                onChange={(e) => setReviewYear(Number(e.target.value))}
                style={{ width: 110 }}
              >
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
                <option value={2027}>2027</option>
              </Select>
            </div>

            <span style={{ fontSize: 13, color: 'var(--portal-text-secondary, #666)' }}>
              📌 Bảng xếp hạng và mức thưởng được Ban Quản Lý phê duyệt và công bố định kỳ.
            </span>
          </div>

          {rankingLoading && (
            <div className="coach-loading-box">
              <div className="portal-spinner" />
              <p>Đang tải dữ liệu xếp hạng và đánh giá...</p>
            </div>
          )}

          {rankingError && !rankingLoading && (
            <div className="coach-error-box">
              <p>{rankingError}</p>
              <button type="button" className="btn-retry" onClick={loadRankingData}>
                Thử lại
              </button>
            </div>
          )}

          {!rankingLoading && !rankingError && (
            <>
              {/* Performance Highlights Card */}
              {currentMonthReview ? (
                <div
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(206, 145, 128, 0.12) 0%, rgba(206, 145, 128, 0.03) 100%)',
                    borderRadius: 20,
                    border: '1.5px solid var(--portal-salmon, #ce9180)',
                    padding: 28,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 16,
                      marginBottom: 20,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 28 }}>
                          {currentMonthReview.rankPosition === 1
                            ? '🥇'
                            : currentMonthReview.rankPosition === 2
                            ? '🥈'
                            : currentMonthReview.rankPosition === 3
                            ? '🥉'
                            : '🏅'}
                        </span>
                        <div>
                          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
                            Hạng #{currentMonthReview.rankPosition} •{' '}
                            {currentMonthReview.badge || 'Huấn luyện viên tiêu biểu'}
                          </h3>
                          <span style={{ fontSize: 13, color: 'var(--portal-text-secondary, #666)' }}>
                            Kỳ đánh giá tháng {currentMonthReview.month}/{currentMonthReview.year}
                          </span>
                        </div>
                      </div>
                    </div>

                    <span
                      style={{
                        padding: '6px 14px',
                        borderRadius: 99,
                        fontSize: 12,
                        fontWeight: 750,
                        background:
                          currentMonthReview.status === 'published'
                            ? 'rgba(34, 100, 66, 0.12)'
                            : 'rgba(217, 119, 6, 0.12)',
                        color:
                          currentMonthReview.status === 'published' ? '#226442' : '#d97706',
                      }}
                    >
                      {currentMonthReview.status === 'published'
                        ? '✓ Đã công bố chính thức'
                        : '⏳ Đang tổng hợp / Dự thảo'}
                    </span>
                  </div>

                  {/* Metrics grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: 16,
                      marginBottom: 24,
                    }}
                  >
                    <div
                      style={{
                        background: '#ffffff',
                        padding: '16px 20px',
                        borderRadius: 14,
                        border: '1px solid rgba(0,0,0,0.06)',
                      }}
                    >
                      <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                        Điểm đánh giá trung bình
                      </div>
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          color: '#eab308',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        ⭐ {currentMonthReview.averageRating.toFixed(1)}
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#666' }}>/ 5.0</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                        từ {currentMonthReview.totalReviews} lượt đánh giá
                      </div>
                    </div>

                    <div
                      style={{
                        background: '#ffffff',
                        padding: '16px 20px',
                        borderRadius: 14,
                        border: '1px solid rgba(0,0,0,0.06)',
                      }}
                    >
                      <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                        Tổng số buổi dạy
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#2d3748' }}>
                        {currentMonthReview.totalSessions}
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#666' }}> buổi</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                        Lớp nhóm & kèm riêng 1:1
                      </div>
                    </div>

                    <div
                      style={{
                        background: '#ffffff',
                        padding: '16px 20px',
                        borderRadius: 14,
                        border: '1px solid rgba(0,0,0,0.06)',
                      }}
                    >
                      <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                        Mức thưởng tháng (Bonus)
                      </div>
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          color: 'var(--portal-salmon, #ce9180)',
                        }}
                      >
                        {formatPrice(currentMonthReview.bonusAmount)}
                      </div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                        Được duyệt bởi Ban Quản Lý
                      </div>
                    </div>
                  </div>

                  {/* Manager Feedback */}
                  {currentMonthReview.managerFeedback && (
                    <div
                      style={{
                        background: '#ffffff',
                        padding: '18px 22px',
                        borderRadius: 14,
                        borderLeft: '4px solid var(--portal-salmon, #ce9180)',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 750,
                          fontSize: 13,
                          color: 'var(--portal-salmon, #ce9180)',
                          display: 'block',
                          marginBottom: 6,
                        }}
                      >
                        💬 Lời nhận xét & Đánh giá từ Ban Quản Lý Trung Tâm:
                      </span>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 14,
                          lineHeight: 1.6,
                          color: '#333',
                          fontStyle: 'italic',
                        }}
                      >
                        "{currentMonthReview.managerFeedback}"
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    background: '#ffffff',
                    padding: '24px 32px',
                    borderRadius: 16,
                    border: '1px dashed var(--portal-border, rgba(0,0,0,0.15))',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ margin: 0, color: '#666' }}>
                    Chưa có bản tổng kết hiệu suất riêng cho tháng {reviewMonth}/{reviewYear}.
                    Quản lý sẽ tổng hợp và công bố vào cuối kỳ!
                  </p>
                </div>
              )}

              {/* Leaderboard Section */}
              <div
                style={{
                  background: 'var(--portal-card-bg, #ffffff)',
                  borderRadius: 20,
                  border: '1px solid var(--portal-border, rgba(0,0,0,0.08))',
                  padding: 24,
                }}
              >
                <div style={{ marginBottom: 18 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                    🏆 Bảng Vinh Danh Top Huấn Luyện Viên Tháng {reviewMonth}/{reviewYear}
                  </h3>
                  <span style={{ fontSize: 13, color: '#666' }}>
                    Danh sách các HLV có điểm đánh giá xuất sắc nhất toàn hệ thống
                  </span>
                </div>

                {leaderboard.length === 0 ? (
                  <p style={{ margin: 0, color: '#666', fontStyle: 'italic' }}>
                    Chưa có bảng xếp hạng chính thức cho tháng này.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {leaderboard.map((item) => {
                      const isMe = item.coachName === currentUser?.name;
                      return (
                        <div
                          key={item.coachId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '14px 20px',
                            borderRadius: 14,
                            background: isMe
                              ? 'linear-gradient(135deg, rgba(206, 145, 128, 0.15) 0%, rgba(206, 145, 128, 0.05) 100%)'
                              : 'var(--portal-bg, #fcfbfa)',
                            border: isMe
                              ? '1.5px solid var(--portal-salmon, #ce9180)'
                              : '1px solid rgba(0,0,0,0.05)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <span
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 99,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifySelf: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: 14,
                                background:
                                  item.rankPosition === 1
                                    ? '#fef08a'
                                    : item.rankPosition === 2
                                    ? '#e2e8f0'
                                    : item.rankPosition === 3
                                    ? '#fed7aa'
                                    : '#f1f5f9',
                                color: '#1e293b',
                              }}
                            >
                              {item.rankPosition === 1
                                ? '🥇'
                                : item.rankPosition === 2
                                ? '🥈'
                                : item.rankPosition === 3
                                ? '🥉'
                                : `#${item.rankPosition}`}
                            </span>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 750, fontSize: 15 }}>
                                  {item.coachName}
                                </span>
                                {isMe && (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 750,
                                      padding: '2px 8px',
                                      borderRadius: 99,
                                      background: 'var(--portal-salmon, #ce9180)',
                                      color: '#fff',
                                    }}
                                  >
                                    Bạn
                                  </span>
                                )}
                              </div>
                              <span style={{ fontSize: 12, color: '#666' }}>
                                {item.coachSpecialization || 'Huấn luyện viên cá nhân'}
                                {item.badge && ` • 🎖️ ${item.badge}`}
                              </span>
                            </div>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 20,
                              textAlign: 'right',
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 800, color: '#eab308', fontSize: 15 }}>
                                ⭐ {item.averageRating.toFixed(1)}
                              </div>
                              <div style={{ fontSize: 11, color: '#888' }}>
                                {item.totalReviews} đánh giá
                              </div>
                            </div>
                            <div>
                              <div
                                style={{
                                  fontWeight: 750,
                                  color: 'var(--portal-salmon, #ce9180)',
                                  fontSize: 14,
                                }}
                              >
                                {formatPrice(item.bonusAmount)}
                              </div>
                              <div style={{ fontSize: 11, color: '#888' }}>Thưởng tháng</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Student Reviews Section */}
              <div
                style={{
                  background: 'var(--portal-card-bg, #ffffff)',
                  borderRadius: 20,
                  border: '1px solid var(--portal-border, rgba(0,0,0,0.08))',
                  padding: 24,
                }}
              >
                <div style={{ marginBottom: 18 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                    💬 Đánh Giá & Nhận Xét Trực Tiếp Từ Học Viên
                  </h3>
                  <span style={{ fontSize: 13, color: '#666' }}>
                    Phản hồi thực tế từ hội viên sau các buổi học và buổi kèm riêng PT 1:1
                  </span>
                </div>

                {studentReviews.length === 0 ? (
                  <div className="coach-empty-box" style={{ padding: '24px 32px' }}>
                    <p style={{ margin: 0 }}>Chưa có nhận xét nào từ học viên cho huấn luyện viên.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 14 }}>
                    {studentReviews.map((rev) => (
                      <div
                        key={rev.id}
                        style={{
                          padding: '16px 20px',
                          borderRadius: 14,
                          background: 'var(--portal-bg, #fcfbfa)',
                          border: '1px solid rgba(0,0,0,0.05)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 8,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 750, fontSize: 14 }}>
                              {rev.isAnonymous ? '👤 Hội viên ẩn danh' : rev.memberName}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 99,
                                background: rev.bookingId
                                  ? 'rgba(206, 145, 128, 0.15)'
                                  : 'rgba(34, 100, 66, 0.12)',
                                color: rev.bookingId ? 'var(--portal-salmon, #ce9180)' : '#226442',
                                fontWeight: 700,
                              }}
                            >
                              {rev.bookingId ? 'Buổi kèm PT 1:1' : 'Lớp học nhóm'}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: '#eab308', fontWeight: 800, fontSize: 14 }}>
                              {'★'.repeat(rev.rating)}
                              {'☆'.repeat(5 - rev.rating)}
                            </span>
                            <span style={{ fontSize: 12, color: '#888' }}>
                              {new Date(rev.createdAt).toLocaleDateString('vi-VN')}
                            </span>
                          </div>
                        </div>

                        {rev.comment ? (
                          <p style={{ margin: 0, fontSize: 14, color: '#333', lineHeight: 1.5 }}>
                            "{rev.comment}"
                          </p>
                        ) : (
                          <span style={{ fontSize: 13, color: '#999', fontStyle: 'italic' }}>
                            (Học viên không để lại lời bình luận)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

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
