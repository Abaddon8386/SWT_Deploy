import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../shared/api/client';
import { errorMessage } from '../../shared/lib/errorMessage';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import type { MembershipCancellationRequest } from '../member/membershipApi';
import { notify } from '../../shared/lib/portalNotices';
import { Modal } from '../../shared/ui/Modal';
import { formatCenterDateTime } from '../../shared/lib/centerTime';

const loadRequests = () => apiFetch<MembershipCancellationRequest[]>('/memberships/cancellations');
const decideRequest = (id: number, action: 'approve' | 'reject', note: string) =>
  apiFetch<MembershipCancellationRequest>(`/memberships/cancellations/${id}/${action}`, {
    method: 'POST', body: JSON.stringify({ note }),
  });

const statusLabel: Record<MembershipCancellationRequest['status'], string> = {
  PENDING: 'Đang chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối',
};

export function ManagerCancellationPage() {
  const [items, setItems] = useState<MembershipCancellationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ item: MembershipCancellationRequest; action: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setItems(await loadRequests()); setError(null); }
    catch (cause) { setError(errorMessage(cause, 'Không thể tải yêu cầu hủy gói.')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function submitDecision() {
    if (!decision || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await decideRequest(decision.item.id, decision.action, note.trim());
      notify(decision.action === 'approve' ? 'Đã duyệt hủy gói tập.' : 'Đã từ chối yêu cầu hủy.', 'success');
      setDecision(null);
      setNote('');
      await refresh();
    } catch (cause) {
      await refresh();
      setDecision(null);
      setError(errorMessage(cause, 'Không thể xử lý yêu cầu.'));
    } finally { setBusy(false); busyRef.current = false; }
  }

  return <div className="portal-container">
    <PageHeader eyebrow="Quản lý trung tâm" title="Yêu cầu hủy gói tập"
      subtitle="Xem xét lý do và quyền lợi liên quan trước khi quyết định." />
    {error && <div className="portal-alert" role="alert">{error} <button type="button" className="btn-secondary btn-sm" onClick={() => void refresh()}>Thử lại</button></div>}
    {loading ? <LoadingSkeleton label="Đang tải yêu cầu hủy gói tập…" count={3} /> : items.length === 0 ?
      <div className="portal-card portal-empty">Chưa có yêu cầu hủy gói tập.</div> :
      <div className="stack" style={{ gap: 16 }}>
        {items.map((item) => <article className="portal-card" key={item.id}>
          <div className="meta-label">Yêu cầu #{item.id} • {formatCenterDateTime(item.requestedAt)}</div>
          <h2 className="portal-card-title" style={{ marginTop: 8 }}>{item.memberName ?? `Hội viên #${item.memberId}`} — {item.packageName}</h2>
          <p className="row-card__meta">Gói #{item.subscriptionId} • {statusLabel[item.status]}</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>Lý do: {item.reason}</p>
          {item.resolutionNote && <p className="row-card__meta">Ghi chú xử lý: {item.resolutionNote}</p>}
          {item.status === 'PENDING' && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            <button type="button" className="btn-primary btn-sm" onClick={() => setDecision({ item, action: 'approve' })}>Duyệt hủy</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setDecision({ item, action: 'reject' })}>Từ chối</button>
          </div>}
        </article>)}
      </div>}
    {decision && <Modal
      title={decision.action === 'approve' ? 'Duyệt hủy gói tập?' : 'Từ chối yêu cầu hủy?'}
      busy={busy}
      onClose={() => setDecision(null)}>
      <p className="row-card__meta" style={{ marginTop: 12 }}>{decision.item.memberName} • {decision.item.packageName}</p>
      {decision.action === 'approve' && <p className="row-card__meta">Sau khi duyệt, gói ngừng cấp quyền, lịch học tương lai được xử lý và không hoàn tiền. Nếu còn quyền lợi khác chưa thể phân định, hệ thống sẽ từ chối để quản lý xử lý riêng.</p>}
      <label className="portal-label" htmlFor="manager-cancellation-note">Ghi chú xử lý</label>
      <textarea className="portal-input" id="manager-cancellation-note" rows={3} maxLength={500} value={note}
        onChange={(e) => setNote(e.target.value)} disabled={busy} style={{ width: '100%' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button type="button" className="btn-secondary" autoFocus disabled={busy} onClick={() => setDecision(null)}>Quay lại</button>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void submitDecision()}>
          {busy ? 'Đang xử lý…' : 'Xác nhận quyết định'}
        </button>
      </div>
    </Modal>}
  </div>;
}
