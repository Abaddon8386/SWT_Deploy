import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Modal } from '../../shared/ui/Modal';
import { Select } from '../../shared/ui/Select';
import {
  getAllStaffRequests,
  reviewStaffRequest,
  type StaffInternalRequestDto,
  type RequestType,
} from './staffRequestApi';
import { notify } from '../../shared/lib/portalNotices';

const TYPE_LABELS: Record<RequestType, { label: string; bg: string; color: string }> = {
  LEAVE: { label: 'Xin nghỉ phép', bg: 'rgba(59, 130, 246, 0.12)', color: '#2563eb' },
  SHIFT_EXCHANGE: { label: 'Đổi ca trực', bg: 'rgba(168, 85, 247, 0.12)', color: '#9333ea' },
  SCHEDULE_CHANGE: { label: 'Đổi lịch dạy', bg: 'rgba(206, 145, 128, 0.15)', color: 'var(--portal-salmon, #ce9180)' },
  OTHER: { label: 'Đề xuất khác', bg: 'rgba(107, 114, 128, 0.12)', color: '#4b5563' },
};

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  PENDING: { label: '⏳ Chờ duyệt', bg: 'rgba(217, 119, 6, 0.12)', color: '#d97706' },
  APPROVED: { label: '✓ Đã duyệt', bg: 'rgba(34, 100, 66, 0.12)', color: '#226442' },
  REJECTED: { label: '✕ Từ chối', bg: 'rgba(220, 38, 38, 0.12)', color: '#dc2626' },
  CANCELLED: { label: 'Đã hủy', bg: 'rgba(156, 163, 175, 0.15)', color: '#6b7280' },
};

const ROLE_DISPLAY: Record<string, { label: string; bg: string; color: string }> = {
  COACH: { label: 'Huấn luyện viên', bg: 'rgba(206, 145, 128, 0.15)', color: 'var(--portal-salmon, #ce9180)' },
  STAFF: { label: 'Nhân viên lễ tân', bg: 'rgba(37, 99, 235, 0.12)', color: '#2563eb' },
  RECEPTIONIST: { label: 'Lễ tân quầy', bg: 'rgba(37, 99, 235, 0.12)', color: '#2563eb' },
};

export function ManagerInternalRequestsPage() {
  const [requests, setRequests] = useState<StaffInternalRequestDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Review Modal
  const [reviewTarget, setReviewTarget] = useState<StaffInternalRequestDto | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [managerNotes, setManagerNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAllStaffRequests();
      setRequests(data);
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : 'Không thể tải danh sách đơn từ nhân sự.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const pendingCount = useMemo(() => {
    return requests.filter((r) => r.status === 'PENDING').length;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
      const matchType = typeFilter === 'ALL' || r.requestType === typeFilter;
      return matchStatus && matchType;
    });
  }, [requests, statusFilter, typeFilter]);

  function handleOpenApprove(r: StaffInternalRequestDto) {
    setReviewTarget(r);
    setReviewAction('APPROVED');
    setManagerNotes('Đã xem xét và chấp thuận.');
    setModalError('');
  }

  function handleOpenReject(r: StaffInternalRequestDto) {
    setReviewTarget(r);
    setReviewAction('REJECTED');
    setManagerNotes('');
    setModalError('');
  }

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewTarget) return;

    if (reviewAction === 'REJECTED' && !managerNotes.trim()) {
      setModalError('Vui lòng nhập lý do từ chối đơn để nhân viên nắm rõ.');
      return;
    }

    setSubmitting(true);
    setModalError('');
    try {
      await reviewStaffRequest(reviewTarget.id, {
        status: reviewAction,
        managerNotes: managerNotes.trim() || undefined,
      });

      notify(
        reviewAction === 'APPROVED'
          ? `Đã phê duyệt đơn của ${reviewTarget.userFullName} thành công!`
          : `Đã từ chối đơn của ${reviewTarget.userFullName}.`
      , 'success');
      setReviewTarget(null);
      await loadData();
    } catch (err: unknown) {
      setModalError((err instanceof Error ? err.message : 'Không thể xử lý đơn từ. Vui lòng thử lại.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="portal-container">
      <PageHeader
        eyebrow="Quản lý trung tâm"
        title="Phê duyệt đơn từ nội bộ"
        subtitle="Tiếp nhận, xử lý và phê duyệt đơn xin nghỉ phép, đổi ca làm việc và đổi lịch dạy từ đội ngũ nhân sự."
      />

      {/* Filter and controls bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          background: 'var(--portal-surface)',
          padding: '16px 20px',
          borderRadius: 16,
          border: '1px solid var(--portal-border)',
          marginBottom: 24,
        }}
      >
        {/* Status tabs */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { key: 'PENDING', label: '⏳ Chờ duyệt', count: pendingCount },
            { key: 'APPROVED', label: '✓ Đã duyệt' },
            { key: 'REJECTED', label: '✕ Từ chối' },
            { key: 'ALL', label: 'Tất cả' },
          ].map((tab) => {
            const isActive = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                style={{
                  minHeight: 38,
                  padding: '8px 16px',
                  borderRadius: 99,
                  border: isActive ? 'none' : '1px solid transparent',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  background: isActive ? 'var(--portal-salmon, #ce9180)' : 'transparent',
                  color: isActive ? 'var(--portal-ink, #202020)' : 'var(--portal-muted)',
                  boxShadow: isActive ? '0 2px 8px rgba(206, 145, 128, 0.25)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    style={{
                      background: isActive ? 'var(--portal-ink, #202020)' : '#d97706',
                      color: isActive ? 'var(--portal-salmon, #ce9180)' : '#ffffff',
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '1px 7px',
                      borderRadius: 99,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Type filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-paper)' }}>Loại đơn:</span>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ width: 180 }}
          >
            <option value="ALL">Tất cả loại đơn</option>
            <option value="LEAVE">Xin nghỉ phép</option>
            <option value="SHIFT_EXCHANGE">Đổi ca trực</option>
            <option value="SCHEDULE_CHANGE">Đổi lịch dạy</option>
            <option value="OTHER">Đề xuất khác</option>
          </Select>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: 'rgba(220, 38, 38, 0.08)',
            border: '1px solid rgba(220, 38, 38, 0.3)',
            color: '#dc2626',
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
          <span>✕ {error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}
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
            Không có đơn từ nào cần xử lý
          </p>
          <span style={{ fontSize: 13, color: 'var(--portal-muted)' }}>
            Toàn bộ đơn từ của nhân sự đã được xem xét hoặc không có bản ghi phù hợp.
          </span>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {filteredRequests.map((req) => {
            const typeInfo = TYPE_LABELS[req.requestType] || TYPE_LABELS.OTHER;
            const statusInfo = STATUS_LABELS[req.status] || STATUS_LABELS.PENDING;
            const roleInfo = ROLE_DISPLAY[req.userRole] || {
              label: req.userRole || 'Nhân sự',
              bg: 'var(--portal-raised)',
              color: 'var(--portal-muted)',
            };
            const isPending = req.status === 'PENDING';

            return (
              <div
                key={req.id}
                className="portal-card"
                style={{
                  padding: 24,
                  borderRadius: 16,
                  border: isPending
                    ? '1.5px solid var(--portal-salmon, #ce9180)'
                    : '1px solid var(--portal-border)',
                  background: 'var(--portal-surface)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)',
                  display: 'grid',
                  gap: 14,
                }}
              >
                {/* Header row: Requester Info & Status */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 99,
                        background: 'var(--portal-salmon, #ce9180)',
                        color: 'var(--portal-ink, #202020)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: 15,
                      }}
                    >
                      {req.userFullName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--portal-paper)' }}>
                          {req.userFullName}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 99,
                            background: roleInfo.bg,
                            color: roleInfo.color,
                            fontWeight: 700,
                          }}
                        >
                          {roleInfo.label}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--portal-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {req.userEmail} • Gửi lúc:{' '}
                        {new Date(req.createdAt).toLocaleDateString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>

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
                      {req.startDate}
                      {req.endDate && req.endDate !== req.startDate ? ` đến ${req.endDate}` : ''}
                    </div>
                  )}

                  {req.targetShift && (
                    <div>
                      <strong style={{ color: 'var(--portal-muted)' }}>Ca / Buổi liên quan:</strong>{' '}
                      {req.targetShift}
                    </div>
                  )}
                </div>

                {/* Review result if already reviewed */}
                {req.reviewedAt && (
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: 10,
                      background:
                        req.status === 'APPROVED'
                          ? 'rgba(34, 197, 94, 0.08)'
                          : 'rgba(220, 38, 38, 0.08)',
                      border: `1px solid ${req.status === 'APPROVED' ? 'rgba(34, 197, 94, 0.34)' : 'rgba(220, 38, 38, 0.34)'}`,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: req.status === 'APPROVED' ? 'var(--portal-success, #22c55e)' : '#ef4444' }}>
                      {req.status === 'APPROVED' ? '✓ Đã phê duyệt' : '✕ Đã từ chối'} bởi{' '}
                      {req.reviewedByName || 'Ban Quản Lý'} (
                      {new Date(req.reviewedAt).toLocaleDateString('vi-VN')})
                    </div>
                    {req.managerNotes && (
                      <div style={{ marginTop: 4, color: 'var(--portal-paper)', fontStyle: 'italic' }}>
                        Lời phê / Lý do: "{req.managerNotes}"
                      </div>
                    )}
                  </div>
                )}

                {/* Manager Actions (Approve / Reject buttons for pending) */}
                {isPending && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: 12,
                      paddingTop: 8,
                      borderTop: '1px solid var(--portal-border)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenReject(req)}
                      style={{
                        minHeight: 40,
                        padding: '8px 18px',
                        borderRadius: 10,
                        border: '1px solid rgba(239, 68, 68, 0.45)',
                        background: 'var(--portal-raised)',
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#ef4444',
                        cursor: 'pointer',
                        transition: 'background-color 180ms ease, border-color 180ms ease, color 180ms ease',
                      }}
                    >
                      ✕ Từ chối đơn
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenApprove(req)}
                      style={{
                        minHeight: 40,
                        padding: '8px 22px',
                        borderRadius: 10,
                        border: 'none',
                        background: 'var(--portal-success, #226442)',
                        fontSize: 13,
                        fontWeight: 750,
                        color: '#ffffff',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(34, 100, 66, 0.2)',
                        transition: 'background-color 180ms ease, box-shadow 180ms ease, opacity 180ms ease',
                      }}
                    >
                      ✓ Phê duyệt đơn
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Duyệt hoặc Từ chối đơn */}
      {reviewTarget && (
        <Modal
          title={
            reviewAction === 'APPROVED'
              ? `Phê duyệt đơn: ${reviewTarget.title}`
              : `Từ chối đơn: ${reviewTarget.title}`
          }
          onClose={() => setReviewTarget(null)}
        >
          <form onSubmit={handleReviewSubmit} style={{ display: 'grid', gap: 16 }}>
            {modalError && (
              <div
                role="alert"
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(220, 38, 38, 0.1)',
                  color: '#dc2626',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                ✕ {modalError}
              </div>
            )}

            <div
              style={{
                background: 'var(--portal-raised)',
                padding: '12px 16px',
                borderRadius: 10,
                fontSize: 13,
              }}
            >
              <div>
                <strong>Người làm đơn:</strong> {reviewTarget.userFullName} ({reviewTarget.userEmail})
              </div>
              <div>
                <strong>Loại đơn:</strong> {TYPE_LABELS[reviewTarget.requestType]?.label}
              </div>
              {reviewTarget.startDate && (
                <div>
                  <strong>Thời gian đề xuất:</strong> {reviewTarget.startDate}
                  {reviewTarget.endDate && ` đến ${reviewTarget.endDate}`}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                {reviewAction === 'APPROVED'
                  ? 'Ghi chú / Lời nhắn của Quản lý gửi nhân viên (tùy chọn):'
                  : 'Lý do từ chối đơn (bắt buộc):'}
              </label>
              <textarea
                className="portal-input"
                rows={4}
                placeholder={
                  reviewAction === 'APPROVED'
                    ? 'Ví dụ: Đã bố trí nhân sự hỗ trợ, chúc bạn hoàn thành công việc...'
                    : 'Nêu rõ lý do từ chối (trùng lịch sự kiện, chưa có người thay thế...)'
                }
                value={managerNotes}
                onChange={(e) => setManagerNotes(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setReviewTarget(null)}
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '10px 22px',
                  borderRadius: 99,
                  border: 'none',
                  fontWeight: 750,
                  fontSize: 14,
                  cursor: 'pointer',
                  background:
                    reviewAction === 'APPROVED' ? 'var(--portal-success, #226442)' : '#dc2626',
                  color: '#fff',
                }}
              >
                {submitting
                  ? 'Đang xử lý...'
                  : reviewAction === 'APPROVED'
                  ? 'Xác nhận Phê duyệt'
                  : 'Xác nhận Từ chối'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

