import { staffTranslation, staffMessage, useStaffI18n, type StaffMessage, staffNotify as notify } from '../operations/staffI18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { Modal } from '../../shared/ui/Modal';
import { useConfirm } from '../../shared/ui/ConfirmDialog';
import { centerNowParts, formatCenterDate, formatCenterDateTime } from '../../shared/lib/centerTime';
import { addDays } from '../../shared/lib/recurrence';
import {
  coachAssignmentsApi,
  type CoachAssignmentData,
  type CoachAssignmentOverview,
  type CoachAssignmentStudent,
} from './coachAssignmentsApi';
import { apiFetch } from '../../shared/api/client';
import { staffError as safeMessage, staffText } from '../operations/staffI18n';
import './manager-coach-assignments.css';

import { Select } from '../../shared/ui/Select';
import { DatePicker } from '../../shared/ui/DatePicker';
interface MemberLookupItem {
  userId: number;
  fullName: string;
  membershipCode: string;
  phone?: string | null;
}

function assignmentSchedule(student: CoachAssignmentStudent): string | null {
  if (student.assignmentType === 'TRAINING_PLAN' && student.endDate) return staffText(`Hạn: ${formatCenterDate(student.endDate)}`, `Expires: ${formatCenterDate(student.endDate)}`);
  return student.nextSession ? formatCenterDateTime(student.nextSession.replace(' ', 'T'), student.nextSession) : null;
}

export function ManagerCoachAssignmentsPage() {
  const { t } = useStaffI18n();
  const [confirm, confirmDialog] = useConfirm();
  const loadGeneration = useRef(0);
  const [data, setData] = useState<CoachAssignmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<StaffMessage | null>(null);
  const [search, setSearch] = useState('');
  const [coachFilter, setCoachFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<StaffMessage | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<StaffMessage | null>(null);

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
  const [assignStartDate, setAssignStartDate] = useState(() => centerNowParts().date);
  const [assignEndDate, setAssignEndDate] = useState(() => addDays(centerNowParts().date, 30));

  // Form state for Reassign
  const [targetCoachId, setTargetCoachId] = useState<number | ''>('');
  const [reassignReason, setReassignReason] = useState('');

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const res = await coachAssignmentsApi.getOverview({
        coachId: coachFilter ? Number(coachFilter) : undefined,
        search: search.trim() || undefined,
        type: typeFilter !== 'ALL' ? typeFilter : undefined,
      });
      if (generation === loadGeneration.current) setData(res);
    } catch (err) {
      if (generation === loadGeneration.current) setError(safeMessage(err, 'Không thể tải danh sách HLV & học viên phụ trách'));
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [coachFilter, search, typeFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 200);
    // loadGeneration is a request counter, not a DOM ref: bump it on cleanup to drop stale responses.
    const generation = loadGeneration;
    return () => { clearTimeout(timer); generation.current += 1; };
  }, [load]);

  // Member search in assign modal
  useEffect(() => {
    if (!isAssignOpen || selectedMember || memberSearchQuery.length < 2) {
      setMemberSearchResults([]);
      setLookupLoading(false);
      return;
    }
    let cancelled = false;
    setLookupLoading(true);
    setLookupError(null);
    const timer = setTimeout(async () => {
      try {
        const results = await apiFetch<MemberLookupItem[]>(`/members/lookup?q=${encodeURIComponent(memberSearchQuery)}`);
        if (!cancelled) setMemberSearchResults(results || []);
      } catch {
        if (!cancelled) { setMemberSearchResults([]); setLookupError('Không thể tìm học viên. Vui lòng thử lại.'); }
      } finally {
        if (!cancelled) setLookupLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [memberSearchQuery, isAssignOpen, selectedMember]);

  const allCoachesList = useMemo(() => {
    return data?.availableCoaches || [];
  }, [data]);

  const handleOpenAssign = () => {
    setSelectedMember(null);
    setMemberSearchQuery('');
    setAssignGoal('');
    setAssignStartDate(centerNowParts().date);
    setAssignEndDate(addDays(centerNowParts().date, 30));
    setFormError(null);
    setLookupError(null);
    setAssignCoachId(allCoachesList[0]?.coachId || '');
    setIsAssignOpen(true);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !selectedMember || !assignCoachId) return;

    setBusy(true);
    setFormError(null);
    try {
      await coachAssignmentsApi.assignStudent({
        memberId: selectedMember.userId,
        coachId: Number(assignCoachId),
        assignmentType: 'TRAINING_PLAN',
        goal: assignGoal,
        startDate: assignStartDate,
        endDate: assignEndDate,
      });
      setIsAssignOpen(false);
      notify('Phân công học viên cho huấn luyện viên thành công!', 'success');
      await load();
    } catch (err) {
      setFormError(safeMessage(err, 'Lỗi khi phân công học viên'));
    } finally {
      setBusy(false);
    }
  };

  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !reassignStudent || !targetCoachId || reassignStudent.student.assignmentType === 'CLASS') return;

    setBusy(true);
    setFormError(null);
    try {
      await coachAssignmentsApi.reassignStudent({
        memberId: reassignStudent.student.memberId,
        fromCoachId: reassignStudent.currentCoachId,
        toCoachId: Number(targetCoachId),
        referenceId: reassignStudent.student.referenceId,
        assignmentType: reassignStudent.student.assignmentType,
        reason: reassignReason,
      });
      setReassignStudent(null);
      setTargetCoachId('');
      setReassignReason('');
      notify('Điều chuyển phân công đã chọn sang HLV mới thành công!', 'success');
      await load();
    } catch (err) {
      setFormError(safeMessage(err, 'Lỗi khi điều chuyển học viên'));
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveAssignment = async (student: CoachAssignmentStudent) => {
    if (busy || !(await confirm({ title: staffMessage('Kết thúc phân công', staffTranslation('Kết thúc phân công')), message: staffMessage(`Hủy phân công giáo án của ${student.fullName}? Lịch sử giáo án được giữ lại.`, `Cancel the training plan assignment for ${student.fullName}? Training plan history will be retained.`), confirmLabel: staffMessage('Kết thúc phân công', staffTranslation('Kết thúc phân công')), danger: true }))) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await coachAssignmentsApi.removeAssignment(student.referenceId);
      notify('Đã kết thúc phân công học viên!', 'success');
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
    <div data-i18n-managed className="coach-assignments-page">
      <PageHeader
        eyebrow={t("Vận hành & Huấn luyện")}
        title={t("Quản lý HLV & Học viên phụ trách")}
        actions={
          <button
            type="button"
            className="coach-action-btn coach-action-btn--primary"
            onClick={handleOpenAssign}
            disabled={busy || loading}
          >
            {t("+ Phân công học viên mới")}</button>
        }
      />

      {confirmDialog}

      {error && (
        <div data-i18n-managed className="portal-alert portal-alert--error" role="alert">
          {t(error)} <button type="button" onClick={() => void load()}>{t("Thử lại")}</button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <section className="coach-assignments-stats" aria-label={t("Thống kê tổng quan")}>
        <div className="coach-stat-card">
          <span className="coach-stat-card__label">{t("Tổng số Huấn luyện viên")}</span>
          <span className="coach-stat-card__value">{data?.stats.activeCoaches ?? 0}</span>
        </div>
        <div className="coach-stat-card">
          <span className="coach-stat-card__label">{t("Tổng học viên đang theo kèm")}</span>
          <span className="coach-stat-card__value">{data?.stats.totalAssignedStudents ?? 0}</span>
        </div>
        <div className="coach-stat-card">
          <span className="coach-stat-card__label">{t("Học viên tập 1:1 (PT)")}</span>
          <span className="coach-stat-card__value">{data?.stats.totalPtStudents ?? 0}</span>
        </div>
        <div className="coach-stat-card">
          <span className="coach-stat-card__label">{t("Theo giáo án riêng")}</span>
          <span className="coach-stat-card__value">{data?.stats.totalPlanStudents ?? 0}</span>
        </div>
      </section>

      {/* Toolbar: Filters, Search, View switch */}
      <section className="coach-assignments-toolbar" aria-label={t("Bộ lọc và tìm kiếm")}>
        <div className="coach-assignments-filters">
          <input
            type="search"
            className="coach-search-input"
            placeholder={t("Tìm theo tên HLV, học viên, mã thẻ, SĐT...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t("Tìm kiếm")}
          />

          <Select
            className="coach-filter-select"
            value={coachFilter}
            onChange={(e) => setCoachFilter(e.target.value)}
            aria-label={t("Lọc theo Huấn luyện viên")}
          >
            <option value="">{t("Tất cả Huấn luyện viên")}</option>
            {allCoachesList.map((c) => (
              <option data-i18n-managed key={c.coachId} value={c.coachId}>
                {c.coachName} ({c.specialization})
              </option>
            ))}
          </Select>

          <Select
            className="coach-filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label={t("Lọc theo hình thức")}
          >
            <option value="ALL">{t("Tất cả hình thức")}</option>
            <option value="TRAINING_PLAN">{t("Theo giáo án riêng")}</option>
            <option value="PT_1_1">{t("Tập 1:1 với HLV (PT)")}</option>
            <option value="CLASS">{t("Lớp học nhóm")}</option>
          </Select>
        </div>

        <div className="coach-view-toggle">
          <button
            type="button"
            className={`coach-view-button${viewMode === 'cards' ? ' coach-view-button--active' : ''}`}
            onClick={() => setViewMode('cards')}
          >
            {t("Theo HLV")}</button>
          <button
            type="button"
            className={`coach-view-button${viewMode === 'table' ? ' coach-view-button--active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            {t("Bảng danh sách")}</button>
        </div>
      </section>

      {/* Main View Area */}
      {loading ? (
        <LoadingSkeleton label={t("Đang tải dữ liệu HLV và học viên...")} count={4} />
      ) : !data || data.coaches.length === 0 ? (
        <div data-i18n-managed className="portal-empty">
          <h3>{t("Không tìm thấy dữ liệu")}</h3>
          <p>{t("Không có huấn luyện viên hoặc học viên nào phù hợp với bộ lọc hiện tại.")}</p>
        </div>
      ) : viewMode === 'cards' ? (
        /* Card View by Coach */
        <div data-i18n-managed className="coach-cards-grid">
          {data.coaches.map((coach: CoachAssignmentOverview) => (
            <article data-i18n-managed key={coach.coachId} className="coach-card-panel">
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
                    <strong>{coach.totalStudentsCount}</strong> {t(" tổng học viên")}</span>
                  <span className="student-count-pill">
                    <strong>{coach.ptStudentsCount}</strong> PT 1:1
                  </span>
                  <span className="student-count-pill">
                    <strong>{coach.planStudentsCount}</strong> {t(" Giáo án")}</span>
                  <span className="student-count-pill">
                    <strong>{coach.classStudentsCount}</strong> {t(" Lớp nhóm")}</span>
                </div>
              </header>

              {coach.students.length === 0 ? (
                <div data-i18n-managed style={{ padding: '1.25rem', color: 'var(--portal-muted)', fontSize: '0.9rem' }}>
                  {t("HLV hiện chưa có học viên nào trong danh mục lọc này.")}</div>
              ) : (
                <div data-i18n-managed className="coach-students-list">
                  {coach.students.map((student) => (
                    <div data-i18n-managed key={`${student.assignmentType}-${student.referenceId}-${student.memberId}`} className="coach-student-row">
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
                        {assignmentSchedule(student) && (
                          <small data-i18n-managed style={{ color: 'var(--portal-salmon)', display: 'block', marginTop: '0.2rem' }}>
                            {assignmentSchedule(student)}
                          </small>
                        )}
                      </div>

                      <div className="coach-student-actions">
                        <button
                          type="button"
                          className="coach-action-btn"
                          onClick={() => setSelectedStudentDetail(student)}
                        >
                          {t("Chi tiết")}</button>
                        {student.assignmentType !== 'CLASS' && <button
                          type="button"
                          className="coach-action-btn"
                          disabled={busy}
                          onClick={() => { setFormError(null); setTargetCoachId(''); setReassignReason('');
                            setReassignStudent({
                              student,
                              currentCoachId: coach.coachId,
                              currentCoachName: coach.coachName,
                            }); }}
                        >
                          {t("Điều chuyển HLV")}</button>}
                        {student.assignmentType === 'TRAINING_PLAN' && (
                          <button data-i18n-managed
                            type="button"
                            className="coach-action-btn coach-action-btn--danger"
                            disabled={busy}
                            onClick={() => void handleRemoveAssignment(student)}
                          >
                            {t("Kết thúc")}</button>
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
        <div data-i18n-managed className="coach-table-container">
          <table className="coach-table">
            <thead>
              <tr>
                <th>{t("Học viên")}</th>
                <th>{t("HLV phụ trách")}</th>
                <th>{t("Hình thức")}</th>
                <th>{t("Chi tiết & Mục tiêu")}</th>
                <th>{t("Hạn / Lịch tiếp theo")}</th>
                <th>{t("Thao tác")}</th>
              </tr>
            </thead>
            <tbody>
              {flattenedStudents.map((item) => (
                <tr data-i18n-managed key={`table-${item.assignmentType}-${item.referenceId}-${item.memberId}`}>
                  <td>
                    <strong>{item.fullName}</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--portal-muted)' }}>
                      {item.membershipCode} {item.phone ? `• ${item.phone}` : ''}
                    </div>
                  </td>
                  <td>
                    <strong>{item.coachName}</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--portal-salmon)' }}>
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
                  <td>{assignmentSchedule(item) || t('Đang hoạt động')}</td>
                  <td>
                    <div className="coach-student-actions">
                      <button
                        type="button"
                        className="coach-action-btn"
                        onClick={() => setSelectedStudentDetail(item)}
                      >
                        {t("Chi tiết")}</button>
                      {item.assignmentType !== 'CLASS' && <button
                        type="button"
                        className="coach-action-btn"
                        disabled={busy}
                        onClick={() => { setFormError(null); setTargetCoachId(''); setReassignReason('');
                          setReassignStudent({
                            student: item,
                            currentCoachId: item.coachId,
                            currentCoachName: item.coachName,
                          }); }}
                      >
                        {t("Điều chuyển")}</button>}
                      {item.assignmentType === 'TRAINING_PLAN' && <button type="button" className="coach-action-btn coach-action-btn--danger" disabled={busy} onClick={() => void handleRemoveAssignment(item)}>{t("Kết thúc")}</button>}
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
        <Modal title={t("Phân công học viên mới cho Huấn luyện viên")} busy={busy} onClose={() => setIsAssignOpen(false)}>
          <form className="coach-modal-form" onSubmit={(e) => void handleAssignSubmit(e)}>
            <fieldset disabled={busy}>
            {formError && <p className="portal-alert portal-alert--error" role="alert">{t(formError)}</p>}
            <div className="coach-form-group">
              <label htmlFor="assign-coach-select">{t("Chọn Huấn luyện viên phụ trách *")}</label>
              <Select
                id="assign-coach-select"
                className="coach-form-control"
                value={String(assignCoachId)}
                onChange={(e) => setAssignCoachId(Number(e.target.value))}
                required
              >
                {allCoachesList.map((c) => (
                  <option data-i18n-managed key={c.coachId} value={c.coachId}>
                    {c.coachName} {t(" - Chuyên môn: ")}{c.specialization}
                  </option>
                ))}
              </Select>
            </div>

            <div className="coach-form-group">
              <label htmlFor="assign-member-search">{t("Tìm kiếm học viên theo tên / mã thẻ / SĐT *")}</label>
              <input
                id="assign-member-search"
                type="text"
                className="coach-form-control"
                placeholder={t("Nhập tên hoặc mã thẻ học viên (vd: SOL-MB...)")}
                value={memberSearchQuery}
                onChange={(e) => {
                  setMemberSearchQuery(e.target.value);
                  setSelectedMember(null);
                }}
              />
              {memberSearchResults.length > 0 && !selectedMember && (
                <ul data-i18n-managed
                  style={{
                    background: 'var(--portal-raised)',
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
                    <li data-i18n-managed key={m.userId}>
                    <button type="button" className="coach-member-result" disabled={busy}
                      style={{
                        padding: '0.4rem 0.6rem',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        fontSize: '0.9rem',
                        color: 'var(--portal-paper)',
                      }}
                      onClick={() => {
                        setSelectedMember(m);
                        setMemberSearchQuery(`${m.fullName} (${m.membershipCode})`);
                        setMemberSearchResults([]);
                      }}
                    >
                      <strong>{m.fullName}</strong> {t(" — Mã thẻ: ")}{m.membershipCode} {m.phone ? t(`• SĐT: ${m.phone}`, `• Phone: ${m.phone}`) : ''}
                    </button>
                    </li>
                  ))}
                </ul>
              )}
              {lookupLoading && <p role="status">{t("Đang tìm học viên…")}</p>}
              {lookupError && <p role="alert">{t(lookupError)}</p>}
              {!lookupLoading && !lookupError && !selectedMember && memberSearchQuery.length >= 2 && memberSearchResults.length === 0 && <p>{t("Không tìm thấy học viên phù hợp.")}</p>}
              {selectedMember && (
                <div data-i18n-managed style={{ fontSize: '0.85rem', color: 'var(--portal-success)', marginTop: '0.25rem' }}>
                  {t("Đã chọn học viên: ")}<strong>{selectedMember.fullName}</strong> ({selectedMember.membershipCode})
                </div>
              )}
            </div>

            <div className="coach-form-group">
              <label htmlFor="assign-goal">{t("Mục tiêu luyện tập")}</label>
              <input
                id="assign-goal"
                type="text"
                className="coach-form-control"
                placeholder={t("Ví dụ: Giảm mỡ tăng cơ, rèn luyện thể lực 3 buổi/tuần")}
                value={assignGoal}
                onChange={(e) => setAssignGoal(e.target.value)}
              />
            </div>

            <div className="coach-form-row">
              <div className="coach-form-group">
                <label htmlFor="assign-start-date">{t("Ngày bắt đầu *")}</label>
                <DatePicker
                  id="assign-start-date"
                  value={assignStartDate}
                  onChange={(e) => setAssignStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="coach-form-group">
                <label htmlFor="assign-end-date">{t("Ngày kết thúc *")}</label>
                <DatePicker
                  id="assign-end-date"
                  value={assignEndDate}
                  onChange={(e) => setAssignEndDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="coach-modal-actions">
              <button
                type="button"
                className="coach-action-btn"
                onClick={() => setIsAssignOpen(false)}
                disabled={busy}
              >
                {t("Hủy bỏ")}</button>
              <button
                type="submit"
                className="coach-action-btn coach-action-btn--primary"
                disabled={busy || !selectedMember || !assignCoachId}
              >
                {busy ? t('Đang phân công…') : t('Xác nhận phân công')}
              </button>
            </div>
            </fieldset>
          </form>
        </Modal>
      )}

      {/* Modal 2: Reassign Student */}
      {reassignStudent && (
        <Modal
          title={t(`Điều chuyển HLV cho học viên: ${reassignStudent.student.fullName}`, `Transfer coach for member: ${reassignStudent.student.fullName}`)}
          busy={busy}
          onClose={() => setReassignStudent(null)}
        >
          <form className="coach-modal-form" onSubmit={(e) => void handleReassignSubmit(e)}>
            <fieldset disabled={busy}>
            {formError && <p className="portal-alert portal-alert--error" role="alert">{t(formError)}</p>}
            <p>{t("Chỉ chuyển ")}{reassignStudent.student.assignmentTypeLabel}: {reassignStudent.student.detail}{t(". Các phân công khác được giữ nguyên.")}</p>
            <div className="coach-form-group">
              <label>{t("Học viên")}</label>
              <input
                type="text"
                className="coach-form-control"
                value={`${reassignStudent.student.fullName} (${reassignStudent.student.membershipCode})`}
                disabled
              />
            </div>

            <div className="coach-form-group">
              <label>{t("HLV hiện tại")}</label>
              <input
                type="text"
                className="coach-form-control"
                value={reassignStudent.currentCoachName}
                disabled
              />
            </div>

            <div className="coach-form-group">
              <label htmlFor="reassign-target-coach">{t("Chọn Huấn luyện viên tiếp nhận mới *")}</label>
              <Select
                id="reassign-target-coach"
                className="coach-form-control"
                value={String(targetCoachId)}
                onChange={(e) => setTargetCoachId(Number(e.target.value))}
                required
              >
                <option value="">{t("-- Chọn HLV mới --")}</option>
                {allCoachesList
                  .filter((c) => c.coachId !== reassignStudent.currentCoachId)
                  .map((c) => (
                    <option data-i18n-managed key={c.coachId} value={c.coachId}>
                      {c.coachName} {t(" - Chuyên môn: ")}{c.specialization}
                    </option>
                  ))}
              </Select>
            </div>

            <div className="coach-form-group">
              <label htmlFor="reassign-reason">{t("Lý do điều chuyển")}</label>
              <textarea
                id="reassign-reason"
                className="coach-form-control"
                rows={2}
                placeholder={t("Nhập lý do điều chuyển (vd: HLV cũ nghỉ phép, điều chỉnh lịch tập...)")}
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
                {t("Hủy")}</button>
              <button
                type="submit"
                className="coach-action-btn coach-action-btn--primary"
                disabled={busy || !targetCoachId}
              >
                {busy ? t('Đang điều chuyển…') : t('Xác nhận điều chuyển')}
              </button>
            </div>
            </fieldset>
          </form>
        </Modal>
      )}

      {/* Modal 3: Student Details */}
      {selectedStudentDetail && (
        <Modal
          title={t(`Hồ sơ học viên: ${selectedStudentDetail.fullName}`, `Member profile: ${selectedStudentDetail.fullName}`)}
          onClose={() => setSelectedStudentDetail(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', fontSize: '0.9rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <small style={{ color: 'var(--portal-muted)', display: 'block' }}>{t("Mã hội viên")}</small>
                <strong>{selectedStudentDetail.membershipCode}</strong>
              </div>
              <div>
                <small style={{ color: 'var(--portal-muted)', display: 'block' }}>{t("Số điện thoại")}</small>
                <span>{selectedStudentDetail.phone || t('Chưa cập nhật')}</span>
              </div>
              <div>
                <small style={{ color: 'var(--portal-muted)', display: 'block' }}>Email</small>
                <span>{selectedStudentDetail.email || t('Chưa cập nhật')}</span>
              </div>
              <div>
                <small style={{ color: 'var(--portal-muted)', display: 'block' }}>{t("Trình độ thể lực")}</small>
                <span style={{ textTransform: 'capitalize' }}>{selectedStudentDetail.fitnessLevel || t('Mới bắt đầu')}</span>
              </div>
            </div>

            <div>
              <small style={{ color: 'var(--portal-muted)', display: 'block' }}>{t("Mục tiêu luyện tập")}</small>
              <p style={{ margin: '0.2rem 0', fontWeight: 500, color: 'var(--portal-paper)' }}>
                {selectedStudentDetail.fitnessGoal || selectedStudentDetail.detail || t('Rèn luyện sức khỏe')}
              </p>
            </div>

            <div>
              <small style={{ color: 'var(--portal-muted)', display: 'block' }}>{t("Ghi chú sức khỏe & Tiền sử")}</small>
              <p style={{ margin: '0.2rem 0', color: selectedStudentDetail.healthNotes ? 'var(--portal-warning)' : 'var(--portal-muted)' }}>
                {selectedStudentDetail.healthNotes || t('Không có ghi chú bệnh lý đặc biệt.')}
              </p>
            </div>

            <div>
              <small style={{ color: 'var(--portal-muted)', display: 'block' }}>{t("Hình thức & Lịch tập")}</small>
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
                <span style={{ marginLeft: '0.5rem' }}>{assignmentSchedule(selectedStudentDetail) || selectedStudentDetail.detail}</span>
              </div>
            </div>

            <div className="coach-modal-actions" style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                className="coach-action-btn coach-action-btn--primary"
                onClick={() => setSelectedStudentDetail(null)}
              >
                {t("Đóng")}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
