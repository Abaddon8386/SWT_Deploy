import { useStaffI18n, type StaffMessage, staffError as errorMessage, staffNotify as notify } from '../operations/staffI18n';
import { coachHistoryStorageKey } from './coachHistoryStorage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, getCurrentUser } from '../../shared/api/client';
import { classesApi } from '../classes/classesApi';
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
import { WeeklyTimetable } from '../schedule/WeeklyTimetable';
import { parseISODate } from '../schedule/timetable';
import { coachSessionEvents, ptBookingEvents } from './coachTimetable';
import './coach-classes.css';
import { formatCenterDate } from '../../shared/lib/centerTime';

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

export function CoachClassesPage() {
  const { t } = useStaffI18n();
  const currentUser = getCurrentUser();

  // Tab chuyển đổi: 'schedule' (Thời khóa biểu) hoặc 'students' (Học viên phụ trách)
  const [activeTab, setActiveTab] = useState<'schedule' | 'students' | 'ranking'>('schedule');

  const [currentMonday, setCurrentMonday] = useState<Date>(() => getWeekMonday(new Date()));
  const [selectedPt, setSelectedPt] = useState<CoachBookingDto | null>(null);
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [coach1on1Bookings, setCoach1on1Bookings] = useState<CoachBookingDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<StaffMessage | null>(null);

  // Ranking & Reviews Tab State
  const now = new Date();
  const [reviewYear, setReviewYear] = useState<number>(now.getFullYear());
  const [reviewMonth, setReviewMonth] = useState<number>(now.getMonth() + 1);
  const [myMonthlyReviews, setMyMonthlyReviews] = useState<CoachMonthlyReviewDto[]>([]);
  const [leaderboard, setLeaderboard] = useState<CoachLeaderboardItemDto[]>([]);
  const [studentReviews, setStudentReviews] = useState<CoachReviewDto[]>([]);
  const [rankingLoading, setRankingLoading] = useState<boolean>(false);
  const [rankingError, setRankingError] = useState<StaffMessage | null>(null);

  // Tab Học viên phụ trách
  const [allStudents, setAllStudents] = useState<EnrolledStudent[]>([]);
  const [allStudentsError, setAllStudentsError] = useState<StaffMessage | null>(null);
  const [allStudentsLoading, setAllStudentsLoading] = useState<boolean>(false);
  const [allStudentsSearch, setAllStudentsSearch] = useState<string>('');
  const [allStudentsLevelFilter, setAllStudentsLevelFilter] = useState<string>('all');

  // Modal xem danh sách học viên theo từng buổi học
  const [activeSession, setActiveSession] = useState<CoachSession | null>(null);
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState<boolean>(false);
  const [studentsError, setStudentsError] = useState<StaffMessage | null>(null);
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [selectedFitnessFilter, setSelectedFitnessFilter] = useState<string>('all');
  const [modalViewMode, setModalViewMode] = useState<'students' | 'attendance' | 'evaluation'>('students');
  const [cancellingCoachSession, setCancellingCoachSession] = useState<CoachSession | null>(null);
  const [cancelCoachSessionReason, setCancelCoachSessionReason] = useState<string>('');
  const [cancelCoachSessionError, setCancelCoachSessionError] = useState<StaffMessage | null>(null);
  const [cancellingPt, setCancellingPt] = useState<CoachBookingDto | null>(null);
  const [cancelPtReason, setCancelPtReason] = useState<string>('');
  const [cancelPtError, setCancelPtError] = useState<StaffMessage | null>(null);
  const [cancelBusy, setCancelBusy] = useState<boolean>(false);

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
        board.find((b) => b.coachName === currentUser?.name || b.coachId === Number(currentUser?.id))?.coachId || (currentUser?.id ? Number(currentUser.id) : undefined);
      if (myCoachId) {
        const reviews = await getCoachReviews(myCoachId).catch(() => []);
        setStudentReviews(reviews);
      }
    } catch {
      setRankingError('Không thể tải dữ liệu xếp hạng và đánh giá tháng.');
    } finally {
      setRankingLoading(false);
    }
  }, [reviewYear, reviewMonth, currentUser?.name, currentUser?.id]);

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

  const handleEventClick = (eventId: string) => {
    if (eventId.startsWith('pt-')) {
      setSelectedPt(coach1on1Bookings.find((booking) => `pt-${booking.id}` === eventId) ?? null);
      return;
    }
    const session = sessions.find((item) => String(item.id) === eventId);
    if (session) void handleOpenStudentsModal(session);
  };

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

  const handleConfirmCancelCoachSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingCoachSession || cancelBusy) return;
    const reason = cancelCoachSessionReason.trim();
    if (!reason) {
      setCancelCoachSessionError('Vui lòng nhập lý do hủy buổi dạy.');
      return;
    }
    setCancelCoachSessionError(null);
    setCancelBusy(true);
    try {
      const apiWithCancel = classesApi as { cancelSession?: (id: number | string, reason: string) => Promise<unknown> };
      if (typeof apiWithCancel.cancelSession === 'function') {
        await apiWithCancel.cancelSession(cancellingCoachSession.id, reason);
      } else {
        await apiFetch(`/classes/sessions/${cancellingCoachSession.id}/cancel`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
      }
      notify('Đã hủy buổi dạy thành công!', 'success');
      setCancellingCoachSession(null);
      setCancelCoachSessionReason('');
      setActiveSession(null);
      await loadWeeklySessions();
    } catch (err: unknown) {
      setCancelCoachSessionError(errorMessage(err, 'Không thể hủy buổi dạy này.'));
    } finally {
      setCancelBusy(false);
    }
  };

  const handleConfirmCancelPt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingPt || cancelBusy) return;
    const reason = cancelPtReason.trim();
    if (!reason) {
      setCancelPtError('Vui lòng nhập lý do hủy buổi kèm 1:1.');
      return;
    }
    setCancelPtError(null);
    setCancelBusy(true);
    try {
      await apiFetch(`/coach-bookings/${cancellingPt.id}?reason=${encodeURIComponent(reason)}`, {
        method: 'DELETE',
      });
      notify('Đã hủy buổi kèm 1:1 thành công!', 'success');
      setCancellingPt(null);
      setCancelPtReason('');
      setSelectedPt(null);
      await loadWeeklySessions();
    } catch (err: unknown) {
      setCancelPtError(errorMessage(err, 'Không thể hủy buổi kèm 1:1 này.'));
    } finally {
      setCancelBusy(false);
    }
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

  return (
    <div data-i18n-managed className="portal-container coach-page">
      <PageHeader
        eyebrow={t("Huấn luyện viên")}
        title={t("Thời khóa biểu & học viên phụ trách")}
      />

      {/* Phân hệ Tab: Thời khóa biểu vs Học viên phụ trách */}
      <div className="coach-nav-tabs" role="tablist" aria-label={t("Phân hệ chức năng HLV")}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'schedule'}
          className={`coach-tab-btn ${activeTab === 'schedule' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          {t("Thời khóa biểu")}</button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'students'}
          className={`coach-tab-btn ${activeTab === 'students' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('students')}
        >
          {t("Học viên phụ trách")}</button>
        <button type="button" role="tab" aria-selected={activeTab === 'ranking'}
          className={`coach-tab-btn ${activeTab === 'ranking' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('ranking')}>{t("Đánh giá & bảng xếp hạng tháng")}</button>
      </div>

      {/* ====================================================================
          TAB 1: THỜI KHÓA BIỂU
          ==================================================================== */}
      {activeTab === 'schedule' && (
        <WeeklyTimetable
          label={t("Thời khóa biểu giảng dạy của tôi")}
          weekStart={formatYmd(currentMonday)}
          events={[...coachSessionEvents(sessions, 'schedule'), ...ptBookingEvents(coach1on1Bookings)]}
          loading={loading}
          error={t(error)}
          onRetry={() => void loadWeeklySessions()}
          onWeekChange={(iso) => setCurrentMonday(getWeekMonday(parseISODate(iso)))}
          onEventClick={handleEventClick}
          emptyLabel={t("Tuần này bạn chưa có buổi dạy nào.")}
          legendNote={t("Số trên khối: đã đặt / sức chứa")}
          legend={[
            { tone: 'open', label: t('Lớp còn chỗ') },
            { tone: 'full', label: t('Lớp đã đầy') },
            { tone: 'mine', label: t('Kèm riêng 1:1') },
            { tone: 'past', label: t('Đã qua') },
            { tone: 'cancelled', label: t('Đã hủy') },
          ]}
        />
      )}

      {selectedPt && (
        <Modal title={t("Buổi kèm riêng 1:1")} onClose={() => setSelectedPt(null)}>
          <div className="kv-list">
            <div className="kv-row"><span>{t("Học viên")}</span><strong>{selectedPt.memberName}</strong></div>
            <div className="kv-row"><span>{t("Thời gian")}</span><strong>{formatCenterDate(selectedPt.bookingDate)} · {selectedPt.startTime.slice(0, 5)}–{selectedPt.endTime.slice(0, 5)}</strong></div>
            <div className="kv-row"><span>{t("Bộ môn")}</span><strong>{selectedPt.disciplineName || t('Huấn luyện cá nhân')}</strong></div>
            <div className="kv-row"><span>{t("Hình thức")}</span><strong>{selectedPt.paymentMethod === 'package_quota' ? t('Quyền lợi gói tập') : t('Hội viên trả phí')}</strong></div>
            {selectedPt.notes && <div className="kv-row"><span>{t("Ghi chú của học viên")}</span><strong>{selectedPt.notes}</strong></div>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 20 }}>
            <div>
              {(selectedPt.status === 'confirmed' || (selectedPt.status as string) === 'pending') && (
                <button data-i18n-managed
                  type="button"
                  className="btn-secondary"
                  style={{ color: 'var(--portal-danger, #fca5a5)' }}
                  onClick={() => {
                    setCancelPtError(null);
                    setCancelPtReason('');
                    setCancellingPt(selectedPt);
                  }}
                  data-testid="cancel-pt-btn"
                >
                  {t("Hủy buổi kèm 1:1")}</button>
              )}
            </div>
            <button type="button" className="btn-secondary" onClick={() => setSelectedPt(null)}>{t("Đóng")}</button>
          </div>
        </Modal>
      )}

      {cancellingPt && (
        <Modal
          title={t(`Hủy buổi kèm 1:1: ${cancellingPt.memberName}`, `Cancel one-to-one session: ${cancellingPt.memberName}`)}
          onClose={() => { if (!cancelBusy) setCancellingPt(null); }}
        >
          <form onSubmit={handleConfirmCancelPt} style={{ display: 'grid', gap: 12 }}>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="cancel-pt-reason">
                {t("Lý do hủy buổi kèm 1:1 *")}</label>
              <textarea
                id="cancel-pt-reason"
                rows={3}
                required
                className="portal-textarea"
                placeholder={t("Nhập lý do hủy buổi kèm 1:1 để thông báo cho học viên...")}
                value={cancelPtReason}
                onChange={(e) => setCancelPtReason(e.target.value)}
                disabled={cancelBusy}
              />
            </div>
            {cancelPtError && (
              <div data-i18n-managed role="alert" style={{ color: 'var(--portal-danger, #fca5a5)', fontSize: '0.88rem' }}>
                {t(cancelPtError)}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn-secondary" onClick={() => setCancellingPt(null)} disabled={cancelBusy}>
                {t("Quay lại")}</button>
              <button type="submit" className="btn-danger" disabled={cancelBusy} data-testid="confirm-cancel-pt-btn">
                {cancelBusy ? t('Đang hủy...') : t('Xác nhận hủy buổi')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ====================================================================
          TAB 2: HỌC VIÊN PHỤ TRÁCH (Tách riêng biệt)
          ==================================================================== */}
      {activeTab === 'students' && (
        <div data-i18n-managed className="coach-students-section">
          <div className="coach-students-header">
            <div>
              <h3 className="coach-students-title">{t("Danh sách học viên phụ trách")}</h3>
            </div>
            <span className="coach-students-count">
              {t("Tổng số: ")}<strong>{allStudents.length} {t(" học viên")}</strong>
            </span>
          </div>

          <div className="coach-students-filter-bar">
            <input
              type="text"
              className="portal-input"
              style={{ flex: '1 1 280px' }}
              placeholder={t("Tìm theo tên học viên, mã thẻ, SĐT hoặc email...")}
              value={allStudentsSearch}
              onChange={(e) => setAllStudentsSearch(e.target.value)}
            />
            <Select
              className="portal-select"
              style={{ flex: '0 0 200px' }}
              value={allStudentsLevelFilter}
              onChange={(e) => setAllStudentsLevelFilter(e.target.value)}
            >
              <option value="all">{t("Tất cả trình độ")}</option>
              <option value="beginner">{t("Cơ bản (Beginner)")}</option>
              <option value="intermediate">{t("Trung cấp (Intermediate)")}</option>
              <option value="advanced">{t("Nâng cao (Advanced)")}</option>
            </Select>
          </div>

          {allStudentsLoading ? (
            <LoadingSkeleton label={t("Đang tải danh sách học viên phụ trách…")} variant="cards" count={4} />
          ) : allStudentsError ? (
            <div data-i18n-managed className="coach-error-box" role="alert"><p>{t(allStudentsError)}</p></div>
          ) : filteredAllStudents.length === 0 ? (
            <div data-i18n-managed className="coach-empty-box">
              <p>{t("Không tìm thấy học viên nào phù hợp.")}</p>
              <span>{t("Vui lòng kiểm tra lại từ khóa tìm kiếm hoặc bộ lọc trình độ.")}</span>
            </div>
          ) : (
            <div data-i18n-managed className="coach-students-grid">
              {filteredAllStudents.map((st) => (
                <div data-i18n-managed key={st.id} className="student-card-item">
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
                            ? t('Cơ bản')
                            : st.fitnessLevel === 'intermediate'
                            ? t('Trung cấp')
                            : t('Nâng cao')}
                        </span>
                      </div>
                      <div className="student-contact-row">
                        <span>Email: {st.email}</span>
                        {st.phone && <span>{t("SĐT: ")}{st.phone}</span>}
                        {st.emergencyContactName && (
                          <span data-i18n-managed className="emergency-tag">
                            {t("Khẩn cấp: ")}{st.emergencyContactName} ({st.emergencyContactPhone || 'N/A'})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="student-details-grid">
                    <div className="student-detail-box goal-box">
                      <span className="box-title">{t("Mục tiêu thể lực (fitness_goal):")}</span>
                      <p className="box-content">{st.fitnessGoal || t('Chưa cập nhật')}</p>
                    </div>

                    <div className="student-detail-box health-box">
                      <span className="box-title">{t("Lưu ý sức khỏe & Chấn thương (health_notes):")}</span>
                      <p className="box-content warning-text">
                        {st.healthNotes || t('Sức khỏe bình thường, không có ghi chú chấn thương.')}
                      </p>
                    </div>
                  </div>

                  <div className="student-card-item-footer">
                    <span>{t("Học viên chính thức của trung tâm")}</span>
                    <Link to="/coach/training-plans" className="btn-plan-for-student">
                      {t("Soạn giáo án bài tập →")}</Link>
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
        <div data-i18n-managed style={{ display: 'grid', gap: 28 }}>
          {/* Period selector */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              background: 'var(--portal-surface)',
              padding: '16px 24px',
              borderRadius: 16,
              border: '1px solid var(--portal-border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--portal-paper)' }}>{t("Kỳ đánh giá:")}</span>
              <Select
                value={String(reviewMonth)}
                onChange={(e) => setReviewMonth(Number(e.target.value))}
                style={{ width: 130 }}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option data-i18n-managed key={m} value={m}>
                    {t("Tháng ")}{m}
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

            <span style={{ fontSize: 13, color: 'var(--portal-muted)' }}>
              {t("Bảng xếp hạng và mức thưởng được Ban Quản Lý phê duyệt và công bố định kỳ.")}</span>
          </div>

          {rankingLoading && (
            <div data-i18n-managed className="coach-loading-box" role="status" aria-busy="true">
              <div style={{ display: 'grid', gap: 12, width: '100%', maxWidth: 520, margin: '0 auto 12px' }}>
                <div className="portal-skeleton" style={{ height: 48, borderRadius: 12 }} />
                <div className="portal-skeleton" style={{ height: 48, borderRadius: 12 }} />
              </div>
              <p>{t("Đang tải dữ liệu xếp hạng và đánh giá...")}</p>
            </div>
          )}

          {rankingError && !rankingLoading && (
            <div data-i18n-managed className="coach-error-box">
              <p>{t(rankingError)}</p>
              <button type="button" className="btn-retry" onClick={loadRankingData}>
                {t("Thử lại")}</button>
            </div>
          )}

          {!rankingLoading && !rankingError && (
            <>
              {/* Performance Highlights Card */}
              {currentMonthReview ? (
                <div data-i18n-managed
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(206, 145, 128, 0.14) 0%, rgba(206, 145, 128, 0.04) 100%)',
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
                        <div>
                          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--portal-paper)' }}>
                            {t("Hạng #")}{currentMonthReview.rankPosition} •{' '}
                            {currentMonthReview.badge || t('Huấn luyện viên tiêu biểu')}
                          </h3>
                          <span style={{ fontSize: 13, color: 'var(--portal-muted)' }}>
                            {t("Kỳ đánh giá tháng ")}{currentMonthReview.month}/{currentMonthReview.year}
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
                            ? 'color-mix(in srgb, var(--portal-success) 14%, transparent)'
                            : 'color-mix(in srgb, var(--portal-warning) 14%, transparent)',
                        color:
                          currentMonthReview.status === 'published' ? 'var(--portal-success, #22c55e)' : 'var(--portal-warning)',
                      }}
                    >
                      {currentMonthReview.status === 'published'
                        ? t('Đã công bố chính thức')
                        : t('Đang tổng hợp / Dự thảo')}
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
                        background: 'var(--portal-surface)',
                        padding: '16px 20px',
                        borderRadius: 14,
                        border: '1px solid var(--portal-border)',
                      }}
                    >
                      <div style={{ fontSize: 12, color: 'var(--portal-muted)', marginBottom: 4 }}>
                        {t("Điểm đánh giá trung bình")}</div>
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          color: 'var(--portal-star)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {currentMonthReview.averageRating.toFixed(1)}
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--portal-muted)' }}>/ 5.0</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--portal-muted)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                        {t("từ ")}{currentMonthReview.totalReviews} {t(" lượt đánh giá")}</div>
                    </div>

                    <div
                      style={{
                        background: 'var(--portal-surface)',
                        padding: '16px 20px',
                        borderRadius: 14,
                        border: '1px solid var(--portal-border)',
                      }}
                    >
                      <div style={{ fontSize: 12, color: 'var(--portal-muted)', marginBottom: 4 }}>
                        {t("Tổng số buổi dạy")}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--portal-paper)', fontVariantNumeric: 'tabular-nums' }}>
                        {currentMonthReview.totalSessions}
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--portal-muted)' }}> {t(" buổi")}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--portal-muted)', marginTop: 2 }}>
                        {t("Lớp nhóm & kèm riêng 1:1")}</div>
                    </div>

                    <div
                      style={{
                        background: 'var(--portal-surface)',
                        padding: '16px 20px',
                        borderRadius: 14,
                        border: '1px solid var(--portal-border)',
                      }}
                    >
                      <div style={{ fontSize: 12, color: 'var(--portal-muted)', marginBottom: 4 }}>
                        {t("Mức thưởng tháng (Bonus)")}</div>
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          color: 'var(--portal-salmon, #ce9180)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {formatPrice(currentMonthReview.bonusAmount)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--portal-muted)', marginTop: 2 }}>
                        {t("Được duyệt bởi Ban Quản Lý")}</div>
                    </div>
                  </div>

                  {/* Manager Feedback */}
                  {currentMonthReview.managerFeedback && (
                    <div data-i18n-managed
                      style={{
                        background: 'var(--portal-surface)',
                        padding: '18px 22px',
                        borderRadius: 14,
                        border: '1px solid color-mix(in srgb, var(--portal-salmon) 36%, transparent)',
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
                        {t("Lời nhận xét & Đánh giá từ Ban Quản Lý Trung Tâm:")}</span>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 14,
                          lineHeight: 1.6,
                          color: 'var(--portal-paper)',
                          fontStyle: 'italic',
                        }}
                      >
                        "{currentMonthReview.managerFeedback}"
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div data-i18n-managed
                  style={{
                    background: 'var(--portal-surface)',
                    padding: '24px 32px',
                    borderRadius: 16,
                    border: '1px dashed var(--portal-border-strong, var(--portal-border))',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ margin: 0, color: 'var(--portal-muted)' }}>
                    {t("Chưa có bản tổng kết hiệu suất riêng cho tháng ")}{reviewMonth}/{reviewYear}{t(". Quản lý sẽ tổng hợp và công bố vào cuối kỳ!")}</p>
                </div>
              )}

              {/* Leaderboard Section */}
              <div data-i18n-managed
                style={{
                  background: 'var(--portal-surface)',
                  borderRadius: 20,
                  border: '1px solid var(--portal-border)',
                  padding: 24,
                }}
              >
                <div style={{ marginBottom: 18 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--portal-paper)' }}>
                    {t("Bảng vinh danh top huấn luyện viên tháng ")}{reviewMonth}/{reviewYear}
                  </h3>
                  <span style={{ fontSize: 13, color: 'var(--portal-muted)' }}>
                    {t("Danh sách các HLV có điểm đánh giá xuất sắc nhất toàn hệ thống")}</span>
                </div>

                {leaderboard.length === 0 ? (
                  <p data-i18n-managed style={{ margin: 0, color: 'var(--portal-muted)', fontStyle: 'italic' }}>
                    {t("Chưa có bảng xếp hạng chính thức cho tháng này.")}</p>
                ) : (
                  <div data-i18n-managed style={{ display: 'grid', gap: 12 }}>
                    {leaderboard.map((item) => {
                      const isMe = item.coachName === currentUser?.name || item.coachId === Number(currentUser?.id);
                      return (
                        <div data-i18n-managed
                          key={item.coachId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '14px 20px',
                            borderRadius: 14,
                            background: isMe
                              ? 'linear-gradient(135deg, rgba(206, 145, 128, 0.16) 0%, rgba(206, 145, 128, 0.05) 100%)'
                              : 'var(--portal-raised)',
                            border: isMe
                              ? '1.5px solid var(--portal-salmon, #ce9180)'
                              : '1px solid var(--portal-border)',
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
                                fontVariantNumeric: 'tabular-nums',
                                background:
                                  item.rankPosition === 1
                                    ? 'color-mix(in srgb, var(--portal-star) 20%, transparent)'
                                    : item.rankPosition === 2
                                    ? 'color-mix(in srgb, var(--portal-rank-silver) 20%, transparent)'
                                    : item.rankPosition === 3
                                    ? 'color-mix(in srgb, var(--portal-warning) 20%, transparent)'
                                    : 'var(--portal-surface)',
                                color: 'var(--portal-paper)',
                              }}
                            >
                              {`#${item.rankPosition}`}
                            </span>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 750, fontSize: 15, color: 'var(--portal-paper)' }}>
                                  {item.coachName}
                                </span>
                                {isMe && (
                                  <span data-i18n-managed
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 750,
                                      padding: '2px 8px',
                                      borderRadius: 99,
                                      background: 'var(--portal-salmon, #ce9180)',
                                      color: 'var(--portal-ink, #202020)',
                                    }}
                                  >
                                    {t("Bạn")}</span>
                                )}
                              </div>
                              <span style={{ fontSize: 12, color: 'var(--portal-muted)' }}>
                                {item.coachSpecialization || t('Huấn luyện viên cá nhân')}
                                {item.badge && ` • ${item.badge}`}
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
                              <div style={{ fontWeight: 800, color: 'var(--portal-star)', fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
                                {item.averageRating.toFixed(1)}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--portal-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                {item.totalReviews} {t(" đánh giá")}</div>
                            </div>
                            <div>
                              <div
                                style={{
                                  fontWeight: 750,
                                  color: 'var(--portal-salmon, #ce9180)',
                                  fontSize: 14,
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {formatPrice(item.bonusAmount)}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--portal-muted)' }}>{t("Thưởng tháng")}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Student Reviews Section */}
              <div data-i18n-managed
                style={{
                  background: 'var(--portal-surface)',
                  borderRadius: 20,
                  border: '1px solid var(--portal-border)',
                  padding: 24,
                }}
              >
                <div style={{ marginBottom: 18 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--portal-paper)' }}>
                    {t("Đánh giá & nhận xét trực tiếp từ học viên")}</h3>
                  <span style={{ fontSize: 13, color: 'var(--portal-muted)' }}>
                    {t("Phản hồi thực tế từ hội viên sau các buổi học và buổi kèm riêng PT 1:1")}</span>
                </div>

                {studentReviews.length === 0 ? (
                  <div data-i18n-managed className="coach-empty-box" style={{ padding: '24px 32px' }}>
                    <p style={{ margin: 0 }}>{t("Chưa có nhận xét nào từ học viên cho huấn luyện viên.")}</p>
                  </div>
                ) : (
                  <div data-i18n-managed style={{ display: 'grid', gap: 14 }}>
                    {studentReviews.map((rev) => (
                      <div data-i18n-managed
                        key={rev.id}
                        style={{
                          padding: '16px 20px',
                          borderRadius: 14,
                          background: 'var(--portal-raised)',
                          border: '1px solid var(--portal-border)',
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
                            <span style={{ fontWeight: 750, fontSize: 14, color: 'var(--portal-paper)' }}>
                              {rev.isAnonymous ? t('Hội viên ẩn danh') : rev.memberName}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 99,
                                background: rev.bookingId
                                  ? 'color-mix(in srgb, var(--portal-salmon) 15%, transparent)'
                                  : 'color-mix(in srgb, var(--portal-success) 14%, transparent)',
                                color: rev.bookingId ? 'var(--portal-salmon, #ce9180)' : 'var(--portal-success, #22c55e)',
                                fontWeight: 700,
                              }}
                            >
                              {rev.bookingId ? t('Buổi kèm PT 1:1') : t('Lớp học nhóm')}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: 'var(--portal-star)', fontWeight: 800, fontSize: 14 }}>
                              {'★'.repeat(rev.rating)}
                              {'☆'.repeat(5 - rev.rating)}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--portal-muted)', fontVariantNumeric: 'tabular-nums' }}>
                              {formatCenterDate(rev.createdAt)}
                            </span>
                          </div>
                        </div>

                        {rev.comment ? (
                          <p data-i18n-managed style={{ margin: 0, fontSize: 14, color: 'var(--portal-paper)', lineHeight: 1.5 }}>
                            "{rev.comment}"
                          </p>
                        ) : (
                          <span data-i18n-managed style={{ fontSize: 13, color: 'var(--portal-muted)', fontStyle: 'italic' }}>
                            {t("(Học viên không để lại lời bình luận)")}</span>
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
          title={t(`Học viên lớp ${activeSession.className} (${activeSession.startTime} - ${activeSession.endTime})`, `Class members ${activeSession.className} (${activeSession.startTime} - ${activeSession.endTime})`)}
          onClose={handleCloseModal}
        >
          <div className="students-modal-body">
            <div className="students-modal-filter-bar">
              <input
                type="text"
                className="portal-input student-search-input"
                placeholder={
                  modalViewMode === 'attendance'
                    ? t('Tìm theo tên học viên hoặc trạng thái có mặt/vắng...')
                    : modalViewMode === 'evaluation'
                    ? t('Tìm theo tên học viên hoặc nội dung nhận xét...')
                    : t('Tìm theo tên học viên, mã thẻ hoặc SĐT...')
                }
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
              />
              <Select
                className="portal-select student-level-filter"
                value={modalViewMode}
                onChange={(e) => setModalViewMode(e.target.value as 'students' | 'attendance' | 'evaluation')}
                aria-label={t("Chọn chế độ xem")}
              >
                <option value="students">{t("Xem học viên")}</option>
                <option value="attendance">{t("Lịch sử điểm danh (trình duyệt này)")}</option>
                <option value="evaluation">{t("Đánh giá học viên (trình duyệt này)")}</option>
              </Select>
            </div>

            {studentsLoading ? (
              <LoadingSkeleton label={t("Đang tải dữ liệu của buổi học…")} count={4} />
            ) : modalViewMode === 'attendance' ? (
              /* CHẾ ĐỘ 2: LỊCH SỬ ĐIỂM DANH */
              <div data-i18n-managed className="students-list-wrap">
                {sessionAttendanceData && (
                  <div data-i18n-managed className="history-summary-banner">
                    <span className="history-stat-badge is-present">
                      {t("Có mặt: ")}{sessionAttendanceData.presentCount}
                    </span>
                    <span className="history-stat-badge is-absent">
                      {t("Vắng mặt: ")}{sessionAttendanceData.absentCount}
                    </span>
                    <span className="history-stat-badge is-rate">
                      {t("Tỷ lệ chuyên cần: ")}{sessionAttendanceData.rate}%
                    </span>
                    <span className="history-timestamp">
                      {t("Đã lưu: ")}{sessionAttendanceData.savedAt}
                    </span>
                  </div>
                )}

                {filteredAttendanceStudents.length === 0 ? (
                  <div data-i18n-managed className="students-empty-state">
                    <p>{t("Không tìm thấy bản ghi điểm danh nào phù hợp.")}</p>
                  </div>
                ) : (
                  filteredAttendanceStudents.map((st: StoredAttendanceStudent) => (
                    <div data-i18n-managed key={st.id} className="history-record-card">
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
                          {st.status === 'present' ? t('Có mặt') : t('Vắng mặt')}
                        </span>
                      </div>
                      <div className="history-notes-box">
                        <span className="history-notes-label">{t("Ghi chú chuyên cần: ")}</span>
                        <span>{st.notes || t('Không có ghi chú.')}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : modalViewMode === 'evaluation' ? (
              /* CHẾ ĐỘ 3: ĐÁNH GIÁ HỌC VIÊN */
              <div data-i18n-managed className="students-list-wrap">
                {sessionEvaluationData && (
                  <div data-i18n-managed className="history-summary-banner">
                    <span className="history-stat-badge is-score">
                      {t("Điểm trung bình: ")}{sessionEvaluationData.averageScore}/100
                    </span>
                    <span className="history-stat-badge is-rate">
                      {t("Đã đánh giá: ")}{sessionEvaluationData.totalStudents} {t(" học viên")}</span>
                    <span className="history-timestamp">
                      {t("Đã lưu: ")}{sessionEvaluationData.savedAt}
                    </span>
                  </div>
                )}

                {filteredEvalStudents.length === 0 ? (
                  <div data-i18n-managed className="students-empty-state">
                    <p>{t("Không tìm thấy bản ghi đánh giá nào phù hợp.")}</p>
                  </div>
                ) : (
                  filteredEvalStudents.map((st: StoredEvaluationStudent) => (
                    <div data-i18n-managed key={st.id} className="history-record-card">
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
                          {st.progressScore}{t("/100 điểm")}</span>
                      </div>

                      <div className="history-score-row">
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--portal-salmon)', minWidth: '85px' }}>
                          {t("Tiến bộ:")}</span>
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
                        <span className="history-notes-label">{t("Nhận xét kỹ thuật: ")}</span>
                        <span>{st.notes || t('Đạt yêu cầu buổi tập.')}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : studentsError ? (
              <div data-i18n-managed className="students-empty-state" role="alert"><p>{t(studentsError)}</p></div>
            ) : filteredStudents.length === 0 ? (
              /* CHẾ ĐỘ 1: XEM HỌC VIÊN */
              <div data-i18n-managed className="students-empty-state">
                <p>{t("Không tìm thấy học viên nào phù hợp.")}</p>
              </div>
            ) : (
              <div data-i18n-managed className="students-list-wrap">
                {filteredStudents.map((st) => (
                  <div data-i18n-managed key={st.id} className="student-card-item">
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
                              ? t('Cơ bản')
                              : st.fitnessLevel === 'intermediate'
                              ? t('Trung cấp')
                              : st.fitnessLevel === 'advanced' ? t('Nâng cao') : t('Chưa cập nhật')}
                          </span>
                        </div>
                        <div className="student-contact-row">
                          <span>Email: {st.email}</span>
                          {st.phone && <span>{t("SĐT: ")}{st.phone}</span>}
                          {st.emergencyContactName && (
                            <span data-i18n-managed className="emergency-tag">
                              {t("Khẩn cấp: ")}{st.emergencyContactName} ({st.emergencyContactPhone || 'N/A'})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="student-details-grid">
                      <div className="student-detail-box goal-box">
                        <span className="box-title">{t("Mục tiêu thể lực (fitness_goal):")}</span>
                        <p className="box-content">{st.fitnessGoal || t('Chưa cập nhật')}</p>
                      </div>

                      <div className="student-detail-box health-box">
                        <span className="box-title">{t("Lưu ý sức khỏe & Chấn thương (health_notes):")}</span>
                        <p className="box-content warning-text">
                          {st.healthNotes || t('Chưa cập nhật')}
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
                  ? t(`Hiển thị ${filteredAttendanceStudents.length} / ${sessionAttendanceData?.students.length || 0} bản ghi điểm danh`, `Showing ${filteredAttendanceStudents.length} / ${sessionAttendanceData?.students.length || 0} attendance records`)
                  : modalViewMode === 'evaluation'
                  ? t(`Hiển thị ${filteredEvalStudents.length} / ${sessionEvaluationData?.students.length || 0} bản ghi đánh giá`, `Showing ${filteredEvalStudents.length} / ${sessionEvaluationData?.students.length || 0} evaluation records`)
                  : t(`Hiển thị ${filteredStudents.length} / ${students.length} học viên`, `Showing ${filteredStudents.length} / ${students.length} members`)}
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                {activeSession.status === 'scheduled' && (
                  <button data-i18n-managed
                    type="button"
                    className="btn-secondary"
                    style={{ color: 'var(--portal-danger, #fca5a5)' }}
                    onClick={() => {
                      setCancelCoachSessionError(null);
                      setCancelCoachSessionReason('');
                      setCancellingCoachSession(activeSession);
                    }}
                    data-testid="cancel-coach-session-btn"
                  >
                    {t("Hủy buổi dạy")}</button>
                )}
                <button type="button" className="btn-secondary" onClick={handleCloseModal}>
                  {t("Đóng")}</button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {cancellingCoachSession && (
        <Modal
          title={t(`Hủy buổi dạy: ${cancellingCoachSession.className} (${cancellingCoachSession.sessionDate})`, `Cancel teaching session: ${cancellingCoachSession.className} (${cancellingCoachSession.sessionDate})`)}
          onClose={() => { if (!cancelBusy) setCancellingCoachSession(null); }}
        >
          <form onSubmit={handleConfirmCancelCoachSession} style={{ display: 'grid', gap: 12 }}>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="cancel-coach-session-reason">
                {t("Lý do hủy buổi dạy *")}</label>
              <textarea
                id="cancel-coach-session-reason"
                rows={3}
                required
                className="portal-textarea"
                placeholder={t("Nhập lý do hủy buổi dạy để thông báo cho học viên...")}
                value={cancelCoachSessionReason}
                onChange={(e) => setCancelCoachSessionReason(e.target.value)}
                disabled={cancelBusy}
              />
            </div>
            {cancelCoachSessionError && (
              <div data-i18n-managed role="alert" style={{ color: 'var(--portal-danger, #fca5a5)', fontSize: '0.88rem' }}>
                {t(cancelCoachSessionError)}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn-secondary" onClick={() => setCancellingCoachSession(null)} disabled={cancelBusy}>
                {t("Quay lại")}</button>
              <button type="submit" className="btn-danger" disabled={cancelBusy} data-testid="confirm-cancel-coach-session-btn">
                {cancelBusy ? t('Đang hủy...') : t('Xác nhận hủy buổi')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
