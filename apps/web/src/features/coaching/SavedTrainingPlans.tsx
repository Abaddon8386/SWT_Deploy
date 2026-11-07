import { staffTranslation, staffMessage, useStaffI18n, type StaffMessage, staffError as errorMessage, staffNotify as notify } from '../operations/staffI18n';
import { TrainingPlanResults } from './TrainingPlanResults';
import { TrainingExerciseFields } from './TrainingExerciseFields';
import { validateExercise } from './trainingExercise';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { DatePicker } from '../../shared/ui/DatePicker';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { Modal } from '../../shared/ui/Modal';
import { useConfirm } from '../../shared/ui/ConfirmDialog';
import { aiApi, type SavedTrainingPlan, type SavedTrainingPlanItem } from './aiApi';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Bản nháp',
  active: 'Đang áp dụng',
  completed: 'Đã hoàn thành',
  cancelled: 'Đã hủy',
};

const formatDate = (iso: string) => iso.split('-').reverse().join('/');

/** Chỉnh sửa giáo án và bài tập trên server; giữ ID bài tập và lịch sử tập của hội viên. */
export function SavedTrainingPlans({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t } = useStaffI18n();
  const [resultPlan, setResultPlan] = useState<SavedTrainingPlan | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const [plans, setPlans] = useState<SavedTrainingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<StaffMessage>('');
  const [attempt, setAttempt] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ plan: SavedTrainingPlan; goal: string; startDate: string; endDate: string; items: SavedTrainingPlanItem[] } | null>(null);
  const [formError, setFormError] = useState<StaffMessage>('');

  const load = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    aiApi.listTrainingPlans()
      .then((data) => { if (active) setPlans(Array.isArray(data) ? data.filter(plan => plan.status !== 'cancelled') : []); })
      .catch((err: unknown) => { if (active) setLoadError(errorMessage(err, 'Không thể tải danh sách giáo án.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, refreshKey]);

  const openEditor = (plan: SavedTrainingPlan) => {
    setFormError('');
    setEditing({ plan, goal: plan.goal ?? '', startDate: plan.startDate, endDate: plan.endDate, items: (plan.items ?? []).map(item => ({ ...item })) });
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || busyId !== null) return;
    if (!editing.startDate || !editing.endDate || editing.endDate < editing.startDate) {
      setFormError('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.');
      return;
    }
    const invalidExercise = editing.items.map(item => validateExercise(item)).find(Boolean);
    if (invalidExercise) { setFormError(invalidExercise); return; }
    setFormError('');
    setBusyId(editing.plan.id);
    try {
      const updated = await aiApi.updateTrainingPlan(editing.plan.id, {
        goal: editing.goal.trim(),
        startDate: editing.startDate,
        endDate: editing.endDate,
        items: editing.items,
      });
      setPlans((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setEditing(null);
      notify('Đã cập nhật giáo án.', 'success');
    } catch (err) {
      setFormError(errorMessage(err, 'Không thể cập nhật giáo án.'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (plan: SavedTrainingPlan) => {
    if (busyId !== null) return;
    const confirmed = await confirm({
      title: plan.status === 'active' ? staffMessage('Ngừng áp dụng giáo án?', staffTranslation('Ngừng áp dụng giáo án?')) : staffMessage('Xóa giáo án nháp?', staffTranslation('Xóa giáo án nháp?')),
      message: plan.status === 'active' ? staffMessage('Giáo án sẽ ngừng hiển thị cho hội viên. Lịch sử tập đã ghi nhận được giữ lại.', staffTranslation('Giáo án sẽ ngừng hiển thị cho hội viên. Lịch sử tập đã ghi nhận được giữ lại.')) : staffMessage(`Giáo án của ${plan.memberName ?? `hội viên #${plan.memberId}`} sẽ bị xóa cùng toàn bộ bài tập. Không thể hoàn tác.`, `Training plan for ${plan.memberName ?? `member #${plan.memberId}`} will be deleted with all exercises. This cannot be undone.`),
      confirmLabel: staffMessage('Xóa', staffTranslation('Xóa')),
      danger: true,
    });
    if (!confirmed) return;
    setBusyId(plan.id);
    try {
      await aiApi.deleteTrainingPlan(plan.id);
      setPlans((current) => current.filter((item) => item.id !== plan.id));
      notify(plan.status === 'active' ? 'Đã ngừng áp dụng giáo án.' : 'Đã xóa giáo án nháp.', 'success');
    } catch (err) {
      notify(errorMessage(err, 'Không thể xóa giáo án.'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section data-i18n-managed className="portal-card" aria-labelledby="saved-plans-heading" style={{ marginTop: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <h2 id="saved-plans-heading" className="portal-card-title">{t("Giáo án đã lưu")}</h2>
        <button type="button" className="btn-secondary btn-sm" onClick={load} disabled={loading}>{t("Tải lại")}</button>
      </div>
      {loading ? (
        <LoadingSkeleton label={t("Đang tải giáo án đã lưu")} variant="table" />
      ) : loadError ? (
        <div data-i18n-managed role="alert" className="portal-alert">
          {t(loadError)} <button type="button" className="btn-secondary btn-sm" onClick={load}>{t("Thử lại")}</button>
        </div>
      ) : plans.length === 0 ? (
        <p data-i18n-managed role="status">{t("Chưa có giáo án nào được lưu.")}</p>
      ) : (
        <div data-i18n-managed className="portal-table-wrapper">
          <table className="portal-table">
            <thead>
              <tr>
                <th scope="col">{t("Học viên")}</th>
                <th scope="col">{t("Mục tiêu")}</th>
                <th scope="col">{t("Thời gian")}</th>
                <th scope="col">{t("Bài tập")}</th>
                <th scope="col">{t("Trạng thái")}</th>
                <th scope="col">{t("Thao tác")}</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const editable = plan.status === 'draft' || plan.status === 'active';
                return (
                  <tr data-i18n-managed key={plan.id}>
                    <td><strong>{plan.memberName ?? `#${plan.memberId}`}</strong>{plan.coachName && <div className="muted">{t("HLV:")}{plan.coachName}</div>}</td>
                    <td>{plan.goal || <span className="muted">—</span>}</td>
                    <td>{formatDate(plan.startDate)} – {formatDate(plan.endDate)}</td>
                    <td>{plan.items?.length ?? 0}</td>
                    <td>
                      <span className={`badge ${plan.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                        {t(STATUS_LABEL[plan.status]) || plan.status}
                      </span>
                    </td>
                    <td className="actions">
                      <button type="button" className="btn-secondary btn-sm" onClick={() => setResultPlan(plan)}>{t("Kết quả")}</button>
                      {editable && (
                        <button data-i18n-managed type="button" className="btn-secondary btn-sm" disabled={busyId !== null} onClick={() => openEditor(plan)}>
                          {t("Sửa")}</button>
                      )}
                      {editable && (
                        <button data-i18n-managed type="button" className="btn-danger btn-sm" disabled={busyId !== null} onClick={() => void remove(plan)}>
                          {t("Xóa")}</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Modal title={t("Chỉnh sửa giáo án")} busy={busyId !== null} onClose={() => busyId === null && setEditing(null)}>
          <form onSubmit={(event) => void submitEdit(event)}>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="plan-edit-goal">{t("Mục tiêu")}</label>
              <input
                id="plan-edit-goal"
                className="portal-input"
                disabled={busyId !== null}
                maxLength={255}
                value={editing.goal}
                onChange={(event) => { setFormError(''); setEditing({ ...editing, goal: event.target.value }); }}
              />
            </div>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="plan-edit-start">{t("Ngày bắt đầu")}</label>
              <DatePicker
                id="plan-edit-start"
                disabled={busyId !== null}
                value={editing.startDate}
                onChange={(event) => { setFormError(''); setEditing({ ...editing, startDate: event.target.value }); }}
              />
            </div>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="plan-edit-end">{t("Ngày kết thúc")}</label>
              <DatePicker
                id="plan-edit-end"
                disabled={busyId !== null}
                value={editing.endDate}
                min={editing.startDate}
                onChange={(event) => { setFormError(''); setEditing({ ...editing, endDate: event.target.value }); }}
              />
            </div>
            <fieldset disabled={busyId !== null} className="plan-exercise-list">
              <legend>{t("Bài tập trong giáo án")}</legend>
              {editing.items.length === 0 && <p className="muted">{t("Giáo án chưa có bài tập.")}</p>}
              {editing.items.map((item, index) => <fieldset key={item.id} className="plan-exercise-editor">
                <legend>{t("Bài ")}{index + 1}: {item.exerciseName}</legend>
                <TrainingExerciseFields prefix={`plan-item-${item.id}`} value={item} onChange={value => { setFormError(''); setEditing({ ...editing, items: editing.items.map(current => current.id === item.id ? { ...current, ...value } : current) }); }} />
              </fieldset>)}
            </fieldset>
            {formError && <p role="alert" className="form-error">{t(formError)}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn-secondary" disabled={busyId !== null} onClick={() => setEditing(null)}>{t("Hủy")}</button>
              <button type="submit" className="btn-primary" disabled={busyId !== null} aria-busy={busyId !== null}>
                {busyId !== null ? t('Đang lưu…') : t('Lưu thay đổi')}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {resultPlan && <Modal title={t('Kết quả · ') + (resultPlan.memberName ?? '#' + resultPlan.memberId)} onClose={() => setResultPlan(null)}><TrainingPlanResults key={resultPlan.id} planId={resultPlan.id} /></Modal>}
      {confirmDialog}
    </section>
  );
}
