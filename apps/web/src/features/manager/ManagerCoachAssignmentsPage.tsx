import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { Modal } from '../../shared/ui/Modal';
import {
  coachAssignmentsApi,
  type CoachAssignmentData,
  type CoachAssignmentOverview,
  type CoachAssignmentStudent,
} from './coachAssignmentsApi';
import { apiFetch } from '../../shared/api/client';
import { errorMessage as safeMessage } from '../../shared/lib/errorMessage';
import './manager-coach-assignments.css';

interface MemberLookupItem {
  id: number;
  fullName: string;
  membershipCode: string;
  phone?: string | null;
}

export function ManagerCoachAssignmentsPage() {
  const [data, setData] = useState<CoachAssignmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [coachFilter, setCoachFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [busy, setBusy] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modals state
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [reassignStudent, setReassignStudent] = useState<{
    student: CoachAssignmentStudent;
    currentCoachId: number;
    currentCoachName: string;
  } | null>(null);
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<CoachAssignmentStudent | null>(null);

  // Form states for Assign
  const [assignCoachId, setAssignCoachId] = useState<number | ''>('');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<MemberLookupItem[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberLookupItem | null>(null);
  const [assignGoal, setAssignGoal] = useState('');
  const [assignStartDate, setAssignStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assignEndDate, setAssignEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [assignNotes, setAssignNotes] = useState('');

  // Form state for Reassign
  const [targetCoachId, setTargetCoachId] = useState<number | ''>('');
  const [reassignReason, setReassignReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await coachAssignmentsApi.getOverview({
        coachId: coachFilter ? Number(coachFilter) : undefined,
        search: search.trim() || undefined,
        type: typeFilter !== 'ALL' ? typeFilter : undefined,
      });
      setData(res);
    } catch (err) {
      setError(safeMessage(err, 'Không thể tải danh sách HLV & học viên phụ trách'));
    } finally {
      setLoading(false);
    }
  }, [coachFilter, search, typeFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 200);
    return () => clearTimeout(timer);
  }, [load]);

  // Member search in assign modal
  useEffect(() => {
    if (!memberSearchQuery || memberSearchQuery.length < 2) {
      setMemberSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await apiFetch<MemberLookupItem[]>(`/members/lookup?q=${encodeURIComponent(memberSearchQuery)}`);
        setMemberSearchResults(results || []);
      } catch {
        setMemberSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [memberSearchQuery]);

  const allCoachesList = useMemo(() => {
    return data?.coaches || [];
  }, [data]);

  const handleOpenAssign = () => {
    setSelectedMember(null);
    setMemberSearchQuery('');
    setAssignGoal('');
    setAssignNotes('');
    setAssignCoachId(allCoachesList[0]?.coachId || '');
    setIsAssignOpen(true);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || !assignCoachId) return;

    setBusy(true);
    setError(null);
    try {
      await coachAssignmentsApi.assignStudent({
        memberId: selectedMember.id,
        coachId: Number(assignCoachId),
        assignmentType: 'TRAINING_PLAN',
        goal: assignGoal,
        startDate: assignStartDate,
        endDate: assignEndDate,
        notes: assignNotes,
      });
      setIsAssignOpen(false);
      setActionSuccess('Phân công học viên cho huấn luyện viên thành công!');
      setTimeout(() => setActionSuccess(null), 4000);
      await load();
    } catch (err) {
      setError(safeMessage(err, 'Lỗi khi phân công học viên'));
    } finally {
      setBusy(false);
    }
  };

  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignStudent || !targetCoachId) return;

    setBusy(true);
    setError(null);
    try {
      await coachAssignmentsApi.reassignStudent({
        memberId: reassignStudent.student.memberId,
        fromCoachId: reassignStudent.currentCoachId,
        toCoachId: Number(targetCoachId),
        referenceId: reassignStudent.student.referenceId,
        reason: reassignReason,
      });
      setReassignStudent(null);
      setTargetCoachId('');
      setReassignReason('');
      setActionSuccess('Điều chuyển học viên sang HLV mới thành công!');
      setTimeout(() => setActionSuccess(null), 4000);
      await load();
    } catch (err) {
      setError(safeMessage(err, 'Lỗi khi điều chuyển học viên'));
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveAssignment = async (student: CoachAssignmentStudent) => {
    if (!window.confirm(`Xác nhận hoàn thành/kết thúc phân công cho học viên ${student.fullName}?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await coachAssignmentsApi.removeAssignment(student.referenceId);
      setActionSuccess('Đã kết thúc phân công học viên!');
      setTimeout(() => setActionSuccess(null), 4000);
      await load();
    } catch (err) {
      setError(safeMessage(err, 'Lỗi khi kết thúc phân công'));
    } finally {
      setBusy(false);
    }
  };

  // Flat list for table view
  const flattenedStudents = useMemo(() => {
    if (!data?.coaches) return [];
    return data.coaches.flatMap((coach) =>
      coach.students.map((student) => ({
        ...student,
        coachId: coach.coachId,
        coachName: coach.coachName,
        coachSpecialization: coach.specialization,
      }))
    );
  }, [data]);

  return (
    <div className="coach-assignments-page">
      <PageHeader
        eyebrow="Vận hành & Huấn luyện"
        title="Quản lý HLV & Học viên phụ trách"
        subtitle="Theo dõi danh sách học viên, phân công và điều chuyển học viên giữa các huấn luyện viên trong trung tâm"
        actions={
          <button
            type="button"
            className="coach-action-btn coach-action-btn--primary"
            onClick={handleOpenAssign}
            disabled={busy || loading}
          >
            + Phân công học viên mới
          </button>
        }
      />

      {actionSuccess && (
        <div className="portal-alert portal-alert--success" role="status">
          {actionSuccess}
        </div>
      )}

      {error && (
        <div className="portal-alert portal-alert--error" role="alert">
          {error} <button type="button" onClick={() => void load()}>Thử lại</button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <section className="coach-assignments-stats" aria-label="Thống kê tổng quan">
        <div className="coach-stat-card">
          <span className="coach-stat-card__label">Tổng số Huấn luyện viên</span>
          <span className="coach-stat-card__value">{data?.stats.activeCoaches ?? 0}</span>
          <span className="coach-stat-card__hint">Đang làm việc tại trung tâm</span>
        </div>
        <div className="coach-stat-card">
          <span className="coach-stat-card__label">Tổng học viên đang theo kèm</span>
          <span className="coach-stat-card__value">{data?.stats.totalAssignedStudents ?? 0}</span>
          <span className="coach-stat-card__hint">Đang có HLV phụ trách</span>
        </div>
        <div className="coach-stat-card">
          <span className="coach-stat-card__label">Học viên tập 1:1 (PT)</span>
          <span className="coach-stat-card__value">{data?.stats.totalPtStudents ?? 0}</span>
          <span className="coach-stat-card__hint">Lịch tập cá nhân</span>
        </div>
        <div className="coach-stat-card">
          <span className="coach-stat-card__label">Theo giáo án riêng</span>
          <span className="coach-stat-card__value">{data?.stats.totalPlanStudents ?? 0}</span>
          <span className="coach-stat-card__hint">Kế hoạch rèn luyện cá nhân hóa</span>
        </div>
      </section>

      {/* Toolbar: Filters, Search, View switch */}
      <section className="coach-assignments-toolbar" aria-label="Bộ lọc và tìm kiếm">
        <div className="coach-assignments-filters">
          <input
            type="search"
            className="coach-search-input"
            placeholder="Tìm theo tên HLV, học viên, mã thẻ, SĐT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Tìm kiếm"
          />

          <select
            className="coach-filter-select"
            value={coachFilter}
            onChange={(e) => setCoachFilter(e.target.value)}
            aria-label="Lọc theo Huấn luyện viên"
          >
            <option value="">Tất cả Huấn luyện viên</option>
            {allCoachesList.map((c) => (
              <option key={c.coachId} value={c.coachId}>
                {c.coachName} ({c.specialization})
              </option>
            ))}
          </select>

          <select
            className="coach-filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Lọc theo hình thức"
          >
            <option value="ALL">Tất cả hình thức</option>
            <option value="TRAINING_PLAN">Theo giáo án riêng</option>
            <option value="PT_1_1">Tập 1:1 với HLV (PT)</option>
            <option value="CLASS">Lớp học nhóm</option>
          </select>
        </div>

        <div className="coach-view-toggle">
          <button
            type="button"
            className={`coach-view-button${viewMode === 'cards' ? ' coach-view-button--active' : ''}`}
            onClick={() => setViewMode('cards')}
          >
            Theo HLV
          </button>
          <button
            type="button"
            className={`coach-view-button${viewMode === 'table' ? ' coach-view-button--active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            Bảng danh sách
          </button>
        </div>
      </section>

      {/* Main View Area */}
      {loading ? (
        <LoadingSkeleton label="Đang tải dữ liệu HLV và học viên..." count={4} />
      ) : !data || data.coaches.length === 0 ? (
        <div className="portal-empty">
          <h3>Không tìm thấy dữ liệu</h3>
          <p>Không có huấn luyện viên hoặc học viên nào phù hợp với bộ lọc hiện tại.</p>
        </div>
      ) : viewMode === 'cards' ? (
        /* Card View by Coach */
        <div className="coach-cards-grid">
          {data.coaches.map((coach: CoachAssignmentOverview) => (
            <article key={coach.coachId} className="coach-card-panel">
              <header className="coach-card-header">
                <div className="coach-info-main">
                  <div className="coach-avatar-badge" aria-hidden="true">
                    {coach.coachName.charAt(0).toUpperCase()}
                  </div>
                  <div className="coach-text-details">
                    <h3>{coach.coachName}</h3>
                    <div className="coach-meta-row">
                      <span className="coach-badge-spec">{coach.specialization}</span>
                      {coach.coachPhone && <span>📞 {coach.coachPhone}</span>}
                      {coach.coachEmail && <span>✉️ {coach.coachEmail}</span>}
                    </div>
                  </div>
                </div>

                <div className="coach-student-pills">
                  <span className="student-count-pill">
                    <strong>{coach.totalStudentsCount}</strong> tổng học viên
                  </span>
                  <span className="student-count-pill">
                    <strong>{coach.ptStudentsCount}</strong> PT 1:1
                  </span>
                  <span className="student-count-pill">
                    <strong>{coach.planStudentsCount}</strong> Giáo án
                  </span>
                  <span className="student-count-pill">
                    <strong>{coach.classStudentsCount}</strong> Lớp nhóm
                  </span>
                </div>
              </header>

              {coach.students.length === 0 ? (
                <div style={{ padding: '1.25rem', color: 'var(--portal-text-muted, #9ca3af)', fontSize: '0.9rem' }}>
                  HLV hiện chưa có học viên nào trong danh mục lọc này.
                </div>
              ) : (
                <div className="coach-students-list">
                  {coach.students.map((student) => (
                    <div key={`${student.assignmentType}-${student.referenceId}-${student.memberId}`} className="coach-student-row">
                      <div className="coach-student-profile">
                        <div className="student-avatar-circle">
                          {student.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div className="student-name-block">
                          <strong>{student.fullName}</strong>
                          <small>{student.membershipCode} {student.phone ? `• ${student.phone}` : ''}</small>
                        </div>
                      </div>

                      <div>
                        <span
                          className={`coach-student-type-pill coach-student-type-pill--${
                            student.assignmentType === 'PT_1_1'
                              ? 'pt'
                              : student.assignmentType === 'TRAINING_PLAN'
                              ? 'plan'
                              : 'class'
                          }`}
                        >
                          {student.assignmentTypeLabel}
                        </span>
                      </div>

                      <div className="coach-student-detail">
                        <div>{student.detail}</div>
                        {student.nextSession && (
                          <small style={{ color: 'var(--portal-accent, #ff7a59)', display: 'block', marginTop: '0.2rem' }}>
                            {student.nextSession}
                          </small>
                        )}
                      </div>

                      <div className="coach-student-actions">
                        <button
                          type="button"
                          className="coach-action-btn"
                          onClick={() => setSelectedStudentDetail(student)}
                        >
                          Chi tiết
                        </button>
                        <button
                          type="button"
                          className="coach-action-btn"
                          onClick={() =>
                            setReassignStudent({
                              student,
                              currentCoachId: coach.coachId,
                              currentCoachName: coach.coachName,
                            })
                          }
                        >
                          Điều chuyển HLV
                        </button>
                        {student.assignmentType === 'TRAINING_PLAN' && (
                          <button
                            type="button"
                            className="coach-action-btn coach-action-btn--danger"
                            onClick={() => void handleRemoveAssignment(student)}
                          >
                            Kết thúc
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="coach-table-container">
          <table className="coach-table">
            <thead>
              <tr>
                <th>Học viên</th>
                <th>HLV phụ trách</th>
                <th>Hình thức</th>
                <th>Chi tiết & Mục tiêu</th>
                <th>Hạn / Lịch tiếp theo</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {flattenedStudents.map((item) => (
                <tr key={`table-${item.assignmentType}-${item.referenceId}-${item.memberId}`}>
                  <td>
                    <strong>{item.fullName}</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--portal-text-muted, #9ca3af)' }}>
                      {item.membershipCode} {item.phone ? `• ${item.phone}` : ''}
                    </div>
                  </td>
                  <td>
                    <strong>{item.coachName}</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--portal-accent, #ff7a59)' }}>
                      {item.coachSpecialization}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`coach-student-type-pill coach-student-type-pill--${
                        item.assignmentType === 'PT_1_1'
                          ? 'pt'
                          : item.assignmentType === 'TRAINING_PLAN'
                          ? 'plan'
                          : 'class'
                      }`}
                    >
                      {item.assignmentTypeLabel}
                    </span>
                  </td>
                  <td>{item.detail}</td>
                  <td>{item.nextSession || 'Đang hoạt động'}</td>
                  <td>
                    <div className="coach-student-actions">
                      <button
                        type="button"
                        className="coach-action-btn"
                        onClick={() => setSelectedStudentDetail(item)}
                      >
                        Chi tiết
                      </button>
                      <button
                        type="button"
                        className="coach-action-btn"
                        onClick={() =>
                          setReassignStudent({
                            student: item,
                            currentCoachId: item.coachId,
                            currentCoachName: item.coachName,
                          })
                        }
                      >
                        Điều chuyển
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal 1: Assign Student to Coach */}
      {isAssignOpen && (
        <Modal title="Phân công học viên mới cho Huấn luyện viên" onClose={() => setIsAssignOpen(false)}>
          <form className="coach-modal-form" onSubmit={(e) => void handleAssignSubmit(e)}>
            <div className="coach-form-group">
              <label htmlFor="assign-coach-select">Chọn Huấn luyện viên phụ trách *</label>
              <select
                id="assign-coach-select"
                className="coach-form-control"
                value={assignCoachId}
                onChange={(e) => setAssignCoachId(Number(e.target.value))}
                required
              >
                {allCoachesList.map((c) => (
                  <option key={c.coachId} value={c.coachId}>
                    {c.coachName} - Chuyên môn: {c.specialization} (Đang kèm {c.totalStudentsCount} học viên)
                  </option>
                ))}
              </select>
            </div>

            <div className="coach-form-group">
              <label htmlFor="assign-member-search">Tìm kiếm học viên theo tên / mã thẻ / SĐT *</label>
              <input
                id="assign-member-search"
                type="text"
                className="coach-form-control"
                placeholder="Nhập tên hoặc mã thẻ học viên (vd: SOL-MB...)"
                value={memberSearchQuery}
                onChange={(e) => {
                  setMemberSearchQuery(e.target.value);
                  setSelectedMember(null);
                }}
              />
              {memberSearchResults.length > 0 && !selectedMember && (
                <ul
                  style={{
                    background: 'var(--portal-surface-elevated, #2a2a32)',
                    border: '1px solid var(--portal-border, rgba(255, 255, 255, 0.15))',
                    borderRadius: '8px',
                    margin: '0.25rem 0 0',
                    padding: '0.5rem',
                    listStyle: 'none',
                    maxHeight: '150px',
                    overflowY: 'auto',
                  }}
                >
                  {memberSearchResults.map((m) => (
                    <li
                      key={m.id}
                      style={{
                        padding: '0.4rem 0.6rem',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        fontSize: '0.9rem',
                        color: 'var(--portal-text-primary, #ffffff)',
                      }}
                      onMouseDown={() => {
                        setSelectedMember(m);
                        setMemberSearchQuery(`${m.fullName} (${m.membershipCode})`);
                        setMemberSearchResults([]);
                      }}
                    >
                      <strong>{m.fullName}</strong> — Mã thẻ: {m.membershipCode} {m.phone ? `• SĐT: ${m.phone}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {selectedMember && (
                <div style={{ fontSize: '0.85rem', color: '#4ade80', marginTop: '0.25rem' }}>
                  ✓ Đã chọn học viên: <strong>{selectedMember.fullName}</strong> ({selectedMember.membershipCode})
                </div>
              )}
            </div>

            <div className="coach-form-group">
              <label htmlFor="assign-goal">Mục tiêu luyện tập</label>
              <input
                id="assign-goal"
                type="text"
                className="coach-form-control"
                placeholder="Ví dụ: Giảm mỡ tăng cơ, rèn luyện thể lực 3 buổi/tuần"
                value={assignGoal}
                onChange={(e) => setAssignGoal(e.target.value)}
              />
            </div>

            <div className="coach-form-row">
              <div className="coach-form-group">
                <label htmlFor="assign-start-date">Ngày bắt đầu *</label>
                <input
                  id="assign-start-date"
                  type="date"
                  className="coach-form-control"
                  value={assignStartDate}
                  onChange={(e) => setAssignStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="coach-form-group">
                <label htmlFor="assign-end-date">Ngày kết thúc *</label>
                <input
                  id="assign-end-date"
                  type="date"
                  className="coach-form-control"
                  value={assignEndDate}
                  onChange={(e) => setAssignEndDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="coach-form-group">
              <label htmlFor="assign-notes">Ghi chú cho Huấn luyện viên</label>
              <textarea
                id="assign-notes"
                className="coach-form-control"
                rows={2}
                placeholder="Yêu cầu đặc biệt về sức khỏe, thời gian tập..."
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
              />
            </div>

            <div className="coach-modal-actions">
              <button
                type="button"
                className="coach-action-btn"
                onClick={() => setIsAssignOpen(false)}
                disabled={busy}
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="coach-action-btn coach-action-btn--primary"
                disabled={busy || !selectedMember || !assignCoachId}
              >
                {busy ? 'Đang phân công…' : 'Xác nhận phân công'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 2: Reassign Student */}
      {reassignStudent && (
        <Modal
          title={`Điều chuyển HLV cho học viên: ${reassignStudent.student.fullName}`}
          onClose={() => setReassignStudent(null)}
        >
          <form className="coach-modal-form" onSubmit={(e) => void handleReassignSubmit(e)}>
            <div className="coach-form-group">
              <label>Học viên</label>
              <input
                type="text"
                className="coach-form-control"
                value={`${reassignStudent.student.fullName} (${reassignStudent.student.membershipCode})`}
                disabled
              />
            </div>

            <div className="coach-form-group">
              <label>HLV hiện tại</label>
              <input
                type="text"
                className="coach-form-control"
                value={reassignStudent.currentCoachName}
                disabled
              />
            </div>

            <div className="coach-form-group">
              <label htmlFor="reassign-target-coach">Chọn Huấn luyện viên tiếp nhận mới *</label>
              <select
                id="reassign-target-coach"
                className="coach-form-control"
                value={targetCoachId}
                onChange={(e) => setTargetCoachId(Number(e.target.value))}
                required
              >
                <option value="">-- Chọn HLV mới --</option>
                {allCoachesList
                  .filter((c) => c.coachId !== reassignStudent.currentCoachId)
                  .map((c) => (
                    <option key={c.coachId} value={c.coachId}>
                      {c.coachName} - Chuyên môn: {c.specialization} (Đang kèm {c.totalStudentsCount} học viên)
                    </option>
                  ))}
              </select>
            </div>

            <div className="coach-form-group">
              <label htmlFor="reassign-reason">Lý do điều chuyển</label>
              <textarea
                id="reassign-reason"
                className="coach-form-control"
                rows={2}
                placeholder="Nhập lý do điều chuyển (vd: HLV cũ nghỉ phép, điều chỉnh lịch tập...)"
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
              />
            </div>

            <div className="coach-modal-actions">
              <button
                type="button"
                className="coach-action-btn"
                onClick={() => setReassignStudent(null)}
                disabled={busy}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="coach-action-btn coach-action-btn--primary"
                disabled={busy || !targetCoachId}
              >
                {busy ? 'Đang điều chuyển…' : 'Xác nhận điều chuyển'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 3: Student Details */}
      {selectedStudentDetail && (
        <Modal
          title={`Hồ sơ học viên: ${selectedStudentDetail.fullName}`}
          onClose={() => setSelectedStudentDetail(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', fontSize: '0.9rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <small style={{ color: 'var(--portal-text-muted, #9ca3af)', display: 'block' }}>Mã hội viên</small>
                <strong>{selectedStudentDetail.membershipCode}</strong>
              </div>
              <div>
                <small style={{ color: 'var(--portal-text-muted, #9ca3af)', display: 'block' }}>Số điện thoại</small>
                <span>{selectedStudentDetail.phone || 'Chưa cập nhật'}</span>
              </div>
              <div>
                <small style={{ color: 'var(--portal-text-muted, #9ca3af)', display: 'block' }}>Email</small>
                <span>{selectedStudentDetail.email || 'Chưa cập nhật'}</span>
              </div>
              <div>
                <small style={{ color: 'var(--portal-text-muted, #9ca3af)', display: 'block' }}>Trình độ thể lực</small>
                <span style={{ textTransform: 'capitalize' }}>{selectedStudentDetail.fitnessLevel || 'Mới bắt đầu'}</span>
              </div>
            </div>

            <div>
              <small style={{ color: 'var(--portal-text-muted, #9ca3af)', display: 'block' }}>Mục tiêu luyện tập</small>
              <p style={{ margin: '0.2rem 0', fontWeight: 500, color: 'var(--portal-text-primary, #ffffff)' }}>
                {selectedStudentDetail.fitnessGoal || selectedStudentDetail.detail || 'Rèn luyện sức khỏe'}
              </p>
            </div>

            <div>
              <small style={{ color: 'var(--portal-text-muted, #9ca3af)', display: 'block' }}>Ghi chú sức khỏe & Tiền sử</small>
              <p style={{ margin: '0.2rem 0', color: selectedStudentDetail.healthNotes ? '#f59e0b' : 'var(--portal-text-muted, #9ca3af)' }}>
                {selectedStudentDetail.healthNotes || 'Không có ghi chú bệnh lý đặc biệt.'}
              </p>
            </div>

            <div>
              <small style={{ color: 'var(--portal-text-muted, #9ca3af)', display: 'block' }}>Hình thức & Lịch tập</small>
              <div style={{ marginTop: '0.25rem' }}>
                <span
                  className={`coach-student-type-pill coach-student-type-pill--${
                    selectedStudentDetail.assignmentType === 'PT_1_1'
                      ? 'pt'
                      : selectedStudentDetail.assignmentType === 'TRAINING_PLAN'
                      ? 'plan'
                      : 'class'
                  }`}
                >
                  {selectedStudentDetail.assignmentTypeLabel}
                </span>{' '}
                <span style={{ marginLeft: '0.5rem' }}>{selectedStudentDetail.nextSession || selectedStudentDetail.detail}</span>
              </div>
            </div>

            <div className="coach-modal-actions" style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                className="coach-action-btn coach-action-btn--primary"
                onClick={() => setSelectedStudentDetail(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
