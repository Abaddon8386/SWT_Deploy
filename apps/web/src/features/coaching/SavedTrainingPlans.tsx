import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { DatePicker } from '../../shared/ui/DatePicker';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { Modal } from '../../shared/ui/Modal';
import { useConfirm } from '../../shared/ui/ConfirmDialog';
import { notify } from '../../shared/lib/portalNotices';
import { errorMessage } from '../../shared/lib/errorMessage';
import { aiApi, type SavedTrainingPlan } from './aiApi';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Bản nháp',
  active: 'Đang áp dụng',
  completed: 'Đã hoàn thành',
  cancelled: 'Đã hủy',
};

const formatDate = (iso: string) => iso.split('-').reverse().join('/');

/** Giáo án đã lưu trên server: Coach/Manager sửa mục tiêu, ngày; chỉ xóa được bản nháp. */
export function SavedTrainingPlans({ refreshKey = 0 }: { refreshKey?: number }) {
  const [confirm, confirmDialog] = useConfirm();
  const [plans, setPlans] = useState<SavedTrainingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ plan: SavedTrainingPlan; goal: string; startDate: string; endDate: string } | null>(null);
  const [formError, setFormError] = useState('');

  const load = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    aiApi.listTrainingPlans()
      .then((data) => { if (active) setPlans(Array.isArray(data) ? data : []); })
      .catch((err: unknown) => { if (active) setLoadError(errorMessage(err, 'Không thể tải danh sách giáo án.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, refreshKey]);

  const openEditor = (plan: SavedTrainingPlan) => {
    setFormError('');
    setEditing({ plan, goal: plan.goal ?? '', startDate: plan.startDate, endDate: plan.endDate });
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || busyId !== null) return;
    if (!editing.startDate || !editing.endDate || editing.endDate < editing.startDate) {
      setFormError('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.');
      return;
    }
    setBusyId(editing.plan.id);
    try {
      const updated = await aiApi.updateTrainingPlan(editing.plan.id, {
        goal: editing.goal.trim(),
        startDate: editing.startDate,
        endDate: editing.endDate,
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
      title: 'Xóa giáo án nháp?',
      message: `Giáo án của ${plan.memberName ?? `hội viên #${plan.memberId}`} sẽ bị xóa cùng toàn bộ bài tập. Không thể hoàn tác.`,
      confirmLabel: 'Xóa',
      danger: true,
    });
    if (!confirmed) return;
    setBusyId(plan.id);
    try {
      await aiApi.deleteTrainingPlan(plan.id);
      setPlans((current) => current.filter((item) => item.id !== plan.id));
      notify('Đã xóa giáo án nháp.', 'success');
    } catch (err) {
      notify(errorMessage(err, 'Không thể xóa giáo án.'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="portal-card" aria-labelledby="saved-plans-heading" style={{ marginTop: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <h2 id="saved-plans-heading" className="portal-card-title">Giáo án đã lưu</h2>
        <button type="button" className="btn-secondary btn-sm" onClick={load} disabled={loading}>Tải lại</button>
      </div>
      {loading ? (
        <LoadingSkeleton label="Đang tải giáo án đã lưu" variant="table" />
      ) : loadError ? (
        <div role="alert" className="portal-alert">
          {loadError} <button type="button" className="btn-secondary btn-sm" onClick={load}>Thử lại</button>
        </div>
      ) : plans.length === 0 ? (
        <p role="status">Chưa có giáo án nào được lưu.</p>
      ) : (
        <div className="portal-table-wrapper">
          <table className="portal-table">
            <thead>
              <tr>
                <th scope="col">Học viên</th>
                <th scope="col">Mục tiêu</th>
                <th scope="col">Thời gian</th>
                <th scope="col">Bài tập</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const editable = plan.status === 'draft' || plan.status === 'active';
                return (
                  <tr key={plan.id}>
                    <td><strong>{plan.memberName ?? `#${plan.memberId}`}</strong>{plan.coachName && <div className="muted">HLV: {plan.coachName}</div>}</td>
                    <td>{plan.goal || <span className="muted">—</span>}</td>
                    <td>{formatDate(plan.startDate)} – {formatDate(plan.endDate)}</td>
                    <td>{plan.items?.length ?? 0}</td>
                    <td>
                      <span className={`badge ${plan.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                        {STATUS_LABEL[plan.status] ?? plan.status}
                      </span>
                    </td>
                    <td className="actions">
                      {editable && (
                        <button type="button" className="btn-secondary btn-sm" disabled={busyId !== null} onClick={() => openEditor(plan)}>
                          Sửa
                        </button>
                      )}
                      {plan.status === 'draft' && (
                        <button type="button" className="btn-secondary btn-sm" disabled={busyId !== null} onClick={() => void remove(plan)}>
                          Xóa
                        </button>
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
        <Modal title="Chỉnh sửa giáo án" busy={busyId !== null} onClose={() => busyId === null && setEditing(null)}>
          <form onSubmit={(event) => void submitEdit(event)}>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="plan-edit-goal">Mục tiêu</label>
              <input
                id="plan-edit-goal"
                className="portal-input"
                maxLength={255}
                value={editing.goal}
                onChange={(event) => { setFormError(''); setEditing({ ...editing, goal: event.target.value }); }}
              />
            </div>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="plan-edit-start">Ngày bắt đầu</label>
              <DatePicker
                id="plan-edit-start"
                value={editing.startDate}
                onChange={(event) => { setFormError(''); setEditing({ ...editing, startDate: event.target.value }); }}
              />
            </div>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="plan-edit-end">Ngày kết thúc</label>
              <DatePicker
                id="plan-edit-end"
                value={editing.endDate}
                min={editing.startDate}
                onChange={(event) => { setFormError(''); setEditing({ ...editing, endDate: event.target.value }); }}
              />
            </div>
            {formError && <p role="alert" className="portal-alert">{formError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn-secondary" disabled={busyId !== null} onClick={() => setEditing(null)}>Hủy</button>
              <button type="submit" className="btn-primary" disabled={busyId !== null} aria-busy={busyId !== null}>
                {busyId !== null ? 'Đang lưu…' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirmDialog}
    </section>
  );
}
