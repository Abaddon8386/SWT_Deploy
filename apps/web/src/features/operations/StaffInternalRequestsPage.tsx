import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Modal } from '../../shared/ui/Modal';
import { useConfirm } from '../../shared/ui/ConfirmDialog';
import { Select } from '../../shared/ui/Select';
import {
  getMyStaffRequests,
  createStaffRequest,
  cancelStaffRequest,
  type StaffInternalRequestDto,
  type RequestType,
} from './staffRequestApi';
import { notify } from '../../shared/lib/portalNotices';
import { errorMessage } from '../../shared/lib/errorMessage';
import { formatCenterDate, formatCenterDateTime } from '../../shared/lib/centerTime';

import { DatePicker } from '../../shared/ui/DatePicker';
const TYPE_LABELS: Record<RequestType, { label: string; bg: string; color: string }> = {
  LEAVE: { label: 'Xin nghỉ phép', bg: 'color-mix(in srgb, var(--portal-info) 12%, transparent)', color: 'var(--portal-info)' },
  SHIFT_EXCHANGE: { label: 'Đổi ca trực', bg: 'color-mix(in srgb, var(--portal-violet) 12%, transparent)', color: 'var(--portal-violet)' },
  SCHEDULE_CHANGE: { label: 'Đổi lịch dạy', bg: 'color-mix(in srgb, var(--portal-salmon) 15%, transparent)', color: 'var(--portal-salmon, #ce9180)' },
  OTHER: { label: 'Đề xuất khác', bg: 'color-mix(in srgb, var(--portal-muted) 12%, transparent)', color: 'var(--portal-muted)' },
};

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  PENDING: { label: 'Chờ duyệt', bg: 'color-mix(in srgb, var(--portal-warning) 14%, transparent)', color: 'var(--portal-warning)' },
  APPROVED: { label: 'Đã duyệt', bg: 'color-mix(in srgb, var(--portal-success) 12%, transparent)', color: 'var(--portal-success)' },
  REJECTED: { label: 'Từ chối', bg: 'color-mix(in srgb, var(--portal-danger) 14%, transparent)', color: 'var(--portal-danger)' },
  CANCELLED: { label: 'Đã hủy', bg: 'color-mix(in srgb, var(--portal-muted) 15%, transparent)', color: 'var(--portal-muted)' },
};

export function StaffInternalRequestsPage() {
  const [confirm, confirmDialog] = useConfirm();
  const [requests, setRequests] = useState<StaffInternalRequestDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Filter
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [createType, setCreateType] = useState<RequestType>('LEAVE');
  const [createTitle, setCreateTitle] = useState<string>('');
  const [createReason, setCreateReason] = useState<string>('');
  const [createStartDate, setCreateStartDate] = useState<string>('');
  const [createEndDate, setCreateEndDate] = useState<string>('');
  const [createTargetShift, setCreateTargetShift] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');

  // Cancel target
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getMyStaffRequests();
      setRequests(data);
    } catch (err: unknown) {
      setError((errorMessage(err, 'Không thể tải danh sách đơn từ của bạn.')));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredRequests = useMemo(() => {
    if (statusFilter === 'ALL') return requests;
    return requests.filter((r) => r.status === statusFilter);
  }, [requests, statusFilter]);

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!createTitle.trim()) {
      setFormError('Vui lòng nhập tiêu đề đơn.');
      return;
    }
    if (!createReason.trim()) {
      setFormError('Vui lòng nhập lý do cụ thể.');
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      await createStaffRequest({
        requestType: createType,
        title: createTitle.trim(),
        reason: createReason.trim(),
        startDate: createStartDate || null,
        endDate: createEndDate || null,
        targetShift: createTargetShift.trim() || null,
      });

      notify('Gửi đơn từ nội bộ thành công! Ban Quản Lý sẽ sớm xem xét và phản hồi.', 'success');
      setShowCreateModal(false);
      resetForm();
      await loadData();
    } catch (err: unknown) {
      setFormError((errorMessage(err, 'Không thể gửi đơn từ. Vui lòng kiểm tra lại.')));
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setCreateType('LEAVE');
    setCreateTitle('');
    setCreateReason('');
    setCreateStartDate('');
    setCreateEndDate('');
    setCreateTargetShift('');
    setFormError('');
  }

  async function handleCancelRequest(id: number) {
    if (!(await confirm({ title: 'Hủy đơn từ?', message: 'Đơn sẽ không còn được gửi tới quản lý để duyệt.', confirmLabel: 'Hủy đơn', cancelLabel: 'Giữ đơn', danger: true }))) return;
    setCancellingId(id);
    try {
      await cancelStaffRequest(id);
      notify('Đã hủy đơn thành công.', 'success');
      await loadData();
    } catch (err: unknown) {
      setError((errorMessage(err, 'Không thể hủy đơn từ.')));
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="portal-container">
      <PageHeader
        eyebrow="Vận hành nội bộ"
        title="Đơn từ & đề xuất nội bộ"
      />

      {/* Top action row */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* Status filter tabs */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { key: 'ALL', label: 'Tất cả' },
            { key: 'PENDING', label: 'Chờ duyệt' },
            { key: 'APPROVED', label: 'Đã duyệt' },
            { key: 'REJECTED', label: 'Từ chối' },
            { key: 'CANCELLED', label: 'Đã hủy' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              style={{
                minHeight: 44,
                padding: '8px 16px',
                borderRadius: 99,
                border: statusFilter === tab.key ? 'none' : '1px solid var(--portal-border)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                background:
                  statusFilter === tab.key
                    ? 'var(--portal-salmon, #ce9180)'
                    : 'var(--portal-surface)',
                color: statusFilter === tab.key ? 'var(--portal-ink, #202020)' : 'var(--portal-muted)',
                boxShadow:
                  statusFilter === tab.key
                    ? '0 2px 8px color-mix(in srgb, var(--portal-salmon) 25%, transparent)'
                    : '0 1px 3px rgba(0,0,0,0.05)',
                transition: 'background-color 180ms ease, color 180ms ease, border-color 180ms ease, box-shadow 180ms ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Create button */}
        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          style={{
            minHeight: 42,
            padding: '10px 22px',
            borderRadius: 99,
            border: 'none',
            fontWeight: 750,
            fontSize: 14,
            cursor: 'pointer',
            background: 'var(--portal-salmon, #ce9180)',
            color: 'var(--portal-ink, #202020)',
            boxShadow: '0 4px 12px color-mix(in srgb, var(--portal-salmon) 30%, transparent)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>＋</span> Tạo đơn từ mới
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: 'color-mix(in srgb, var(--portal-danger) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--portal-danger) 30%, transparent)',
            color: 'var(--portal-danger)',
            padding: '12px 18px',
            borderRadius: 12,
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-danger)' }}
          >
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="portal-card" role="status" aria-busy="true" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
            <div className="portal-skeleton" style={{ height: 56, borderRadius: 12 }} />
            <div className="portal-skeleton" style={{ height: 56, borderRadius: 12 }} />
          </div>
          <p style={{ margin: 0, color: 'var(--portal-muted)' }}>Đang tải danh sách đơn từ...</p>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div
          className="portal-card"
          style={{
            padding: '48px 32px',
            textAlign: 'center',
            background: 'var(--portal-surface)',
            borderRadius: 16,
            border: '1px dashed var(--portal-border-strong, var(--portal-border))',
          }}
        >
          <p style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px 0', color: 'var(--portal-paper)' }}>
            Không có đơn từ nào trong danh sách
          </p>
          <span style={{ fontSize: 13, color: 'var(--portal-muted)' }}>
            Bạn chưa gửi đơn từ nào hoặc không có đơn phù hợp với bộ lọc hiện tại.
          </span>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {filteredRequests.map((req) => {
            const typeInfo = TYPE_LABELS[req.requestType] || TYPE_LABELS.OTHER;
            const statusInfo = STATUS_LABELS[req.status] || STATUS_LABELS.PENDING;
            const isPending = req.status === 'PENDING';

            return (
              <div
                key={req.id}
                className="portal-card"
                style={{
                  padding: 24,
                  borderRadius: 16,
                  border: '1px solid var(--portal-border)',
                  background: 'var(--portal-surface)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)',
                  display: 'grid',
                  gap: 14,
                }}
              >
                {/* Header row of card */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: 99,
                        fontSize: 12,
                        fontWeight: 750,
                        background: typeInfo.bg,
                        color: typeInfo.color,
                      }}
                    >
                      {typeInfo.label}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--portal-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      Mã đơn #{req.id} • Ngày tạo:{' '}
                      {formatCenterDateTime(req.createdAt)}
                    </span>
                  </div>

                  <span
                    style={{
                      padding: '5px 12px',
                      borderRadius: 99,
                      fontSize: 12,
                      fontWeight: 750,
                      background: statusInfo.bg,
                      color: statusInfo.color,
                    }}
                  >
                    {statusInfo.label}
                  </span>
                </div>

                {/* Title & Reason */}
                <div>
                  <h3 style={{ margin: '0 0 6px 0', fontSize: 17, fontWeight: 800, color: 'var(--portal-paper)' }}>
                    {req.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--portal-muted)' }}>
                    {req.reason}
                  </p>
                </div>

                {/* Scope details (dates, target shift) */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 18,
                    background: 'var(--portal-raised)',
                    padding: '10px 16px',
                    borderRadius: 10,
                    fontSize: 13,
                    color: 'var(--portal-paper)',
                  }}
                >
                  {req.startDate && (
                    <div>
                      <strong style={{ color: 'var(--portal-muted)' }}>Thời gian:</strong>{' '}
                      {formatCenterDate(req.startDate)}
                      {req.endDate && req.endDate !== req.startDate ? ` đến ${formatCenterDate(req.endDate)}` : ''}
                      {req.replacementUserFullName ? ` · Thay thế: ${req.replacementUserFullName}` : ''}

                    </div>
                  )}

                  {req.targetShift && (
                    <div>
                      <strong style={{ color: 'var(--portal-muted)' }}>Ca / Buổi liên quan:</strong>{' '}
                      {req.targetShift}
                    </div>
                  )}
                </div>

                {/* Manager review result */}
                {req.reviewedAt && (
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: 10,
                      background:
                        req.status === 'APPROVED'
                          ? 'color-mix(in srgb, var(--portal-success) 8%, transparent)'
                          : 'color-mix(in srgb, var(--portal-danger) 8%, transparent)',
                      border: `1px solid ${req.status === 'APPROVED' ? 'color-mix(in srgb, var(--portal-success) 34%, transparent)' : 'color-mix(in srgb, var(--portal-danger) 34%, transparent)'}`,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: req.status === 'APPROVED' ? 'var(--portal-success, #22c55e)' : 'var(--portal-danger)' }}>
                      {req.status === 'APPROVED' ? 'Quản lý chấp thuận' : 'Quản lý từ chối'} •{' '}
                      Người duyệt: {req.reviewedByName || 'Ban Quản Lý'} (
                      {formatCenterDate(req.reviewedAt)})
                    </div>
                    {req.managerNotes && (
                      <div style={{ marginTop: 4, color: 'var(--portal-paper)', fontStyle: 'italic' }}>
                        Lời phê: "{req.managerNotes}"
                      </div>
                    )}
                  </div>
                )}

                {/* Footer Action (Cancel button if pending) */}
                {isPending && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 6 }}>
                    <button
                      type="button"
                      disabled={cancellingId === req.id}
                      onClick={() => handleCancelRequest(req.id)}
                      style={{
                        minHeight: 44,
                        padding: '6px 14px',
                        borderRadius: 10,
                        border: '1px solid color-mix(in srgb, var(--portal-danger) 40%, transparent)',
                        background: 'var(--portal-raised)',
                        fontSize: 12,
                        fontWeight: 650,
                        color: 'var(--portal-danger)',
                        cursor: 'pointer',
                        transition: 'background-color 180ms ease, border-color 180ms ease, color 180ms ease',
                      }}
                    >
                      {cancellingId === req.id ? 'Đang hủy...' : 'Hủy đơn từ này'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal tạo đơn từ mới */}
      {showCreateModal && (
        <Modal title="Tạo đơn từ & đề xuất mới" onClose={() => setShowCreateModal(false)}>
          <form onSubmit={handleCreateSubmit} style={{ display: 'grid', gap: 16 }}>
            {formError && (
              <div
                role="alert"
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'color-mix(in srgb, var(--portal-danger) 10%, transparent)',
                  color: 'var(--portal-danger)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {formError}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                Loại đơn từ:
              </label>
              <Select
                value={createType}
                onChange={(e) => setCreateType(e.target.value as RequestType)}
                style={{ width: '100%' }}
              >
                <option value="LEAVE">Xin nghỉ phép (Leave)</option>
                <option value="SHIFT_EXCHANGE">Đổi ca trực / làm việc (Shift Exchange)</option>
                <option value="SCHEDULE_CHANGE">Đổi lịch dạy / đứng lớp (Schedule Change)</option>
                <option value="OTHER">Đề xuất công việc / khác (Other)</option>
              </Select>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                Tiêu đề đơn:
              </label>
              <input
                type="text"
                className="portal-input"
                placeholder="Ví dụ: Xin nghỉ phép cá nhân ngày 05/11, Đổi ca trực sáng..."
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label htmlFor="internal-request-start" style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                  {createType === 'LEAVE' ? 'Ngày bắt đầu nghỉ:' : 'Ngày áp dụng:'}
                </label>
                <DatePicker
                  id="internal-request-start"
                  value={createStartDate}
                  onChange={(e) => setCreateStartDate(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="internal-request-end" style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                  {createType === 'LEAVE' ? 'Ngày kết thúc nghỉ:' : 'Ngày kết thúc (tùy chọn):'}
                </label>
                <DatePicker
                  id="internal-request-end"
                  value={createEndDate}
                  onChange={(e) => setCreateEndDate(e.target.value)}
                />
              </div>
            </div>

            {(createType === 'SHIFT_EXCHANGE' || createType === 'SCHEDULE_CHANGE') && (
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                  Ca trực / Khung giờ dạy cần đổi:
                </label>
                <input
                  type="text"
                  className="portal-input"
                  placeholder="Ví dụ: Ca sáng (06:00 - 14:00) đổi sang Ca tối, hoặc Lớp Boxing 18:00..."
                  value={createTargetShift}
                  onChange={(e) => setCreateTargetShift(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10 }}
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                Lý do & Nội dung chi tiết:
              </label>
              <textarea
                className="portal-input"
                rows={4}
                placeholder="Nêu rõ lý do, kế hoạch bàn giao hoặc người hỗ trợ thay thế..."
                value={createReason}
                onChange={(e) => setCreateReason(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowCreateModal(false)}
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '10px 24px',
                  borderRadius: 99,
                  border: 'none',
                  fontWeight: 750,
                  fontSize: 14,
                  cursor: 'pointer',
                  background: 'var(--portal-salmon, #ce9180)',
                  color: 'var(--portal-on-accent)',
                }}
              >
                {submitting ? 'Đang gửi đơn...' : 'Gửi đơn tới Quản Lý'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirmDialog}
    </div>
  );
}

