import { useStaffI18n, type StaffMessage, staffMessage, staffError as errorMessage, staffNotify as notify } from './staffI18n';
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
import { formatCenterDate, formatCenterDateTime } from '../../shared/lib/centerTime';

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

const ROLE_DISPLAY: Record<string, { label: string; bg: string; color: string }> = {
  COACH: { label: 'Huấn luyện viên', bg: 'color-mix(in srgb, var(--portal-salmon) 15%, transparent)', color: 'var(--portal-salmon, #ce9180)' },
  STAFF: { label: 'Nhân viên lễ tân', bg: 'color-mix(in srgb, var(--portal-info) 12%, transparent)', color: 'var(--portal-info)' },
  RECEPTIONIST: { label: 'Lễ tân quầy', bg: 'color-mix(in srgb, var(--portal-info) 12%, transparent)', color: 'var(--portal-info)' },
};

export function ManagerInternalRequestsPage() {
  const { t } = useStaffI18n();
  const [requests, setRequests] = useState<StaffInternalRequestDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<StaffMessage>('');

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Review Modal
  const [reviewTarget, setReviewTarget] = useState<StaffInternalRequestDto | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [managerNotes, setManagerNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<StaffMessage>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAllStaffRequests();
      setRequests(data);
    } catch (err: unknown) {
      setError((errorMessage(err, 'Không thể tải danh sách đơn từ nhân sự.')));
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
          ? staffMessage(`Đã phê duyệt đơn của ${reviewTarget.userFullName} thành công!`, `Approved request from ${reviewTarget.userFullName} successfully!`)
          : staffMessage(`Đã từ chối đơn của ${reviewTarget.userFullName}.`, `Rejected request from ${reviewTarget.userFullName}.`)
      , 'success');
      setReviewTarget(null);
      await loadData();
    } catch (err: unknown) {
      setModalError((errorMessage(err, 'Không thể xử lý đơn từ. Vui lòng thử lại.')));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div data-i18n-managed className="portal-container">
      <PageHeader
        eyebrow={t("Quản lý trung tâm")}
        title={t("Phê duyệt đơn từ nội bộ")}
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
            { key: 'PENDING', label: t('Chờ duyệt'), count: pendingCount },
            { key: 'APPROVED', label: t('Đã duyệt') },
            { key: 'REJECTED', label: t('Từ chối') },
            { key: 'ALL', label: t('Tất cả') },
          ].map((tab) => {
            const isActive = statusFilter === tab.key;
            return (
              <button data-i18n-managed
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                style={{
                  minHeight: 44,
                  padding: '8px 16px',
                  borderRadius: 99,
                  border: isActive ? 'none' : '1px solid transparent',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  background: isActive ? 'var(--portal-salmon, #ce9180)' : 'transparent',
                  color: isActive ? 'var(--portal-ink, #202020)' : 'var(--portal-muted)',
                  boxShadow: isActive ? '0 2px 8px color-mix(in srgb, var(--portal-salmon) 25%, transparent)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>{t(tab.label)}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span data-i18n-managed
                    style={{
                      background: isActive ? 'var(--portal-ink, #202020)' : 'var(--portal-warning)',
                      color: isActive ? 'var(--portal-salmon, #ce9180)' : 'var(--portal-on-accent)',
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
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-paper)' }}>{t("Loại đơn:")}</span>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ width: 180 }}
          >
            <option value="ALL">{t("Tất cả loại đơn")}</option>
            <option value="LEAVE">{t("Xin nghỉ phép")}</option>
            <option value="SHIFT_EXCHANGE">{t("Đổi ca trực")}</option>
            <option value="SCHEDULE_CHANGE">{t("Đổi lịch dạy")}</option>
            <option value="OTHER">{t("Đề xuất khác")}</option>
          </Select>
        </div>
      </div>

      {error && (
        <div data-i18n-managed
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
          <span>{t(error)}</span>
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
        <div data-i18n-managed className="portal-card" role="status" aria-busy="true" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
            <div className="portal-skeleton" style={{ height: 56, borderRadius: 12 }} />
            <div className="portal-skeleton" style={{ height: 56, borderRadius: 12 }} />
          </div>
          <p style={{ margin: 0, color: 'var(--portal-muted)' }}>{t("Đang tải danh sách đơn từ...")}</p>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div data-i18n-managed
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
            {t("Không có đơn từ nào cần xử lý")}</p>
          <span style={{ fontSize: 13, color: 'var(--portal-muted)' }}>
            {t("Toàn bộ đơn từ của nhân sự đã được xem xét hoặc không có bản ghi phù hợp.")}</span>
        </div>
      ) : (
        <div data-i18n-managed style={{ display: 'grid', gap: 16 }}>
          {filteredRequests.map((req) => {
            const typeInfo = TYPE_LABELS[req.requestType] || TYPE_LABELS.OTHER;
            const statusInfo = STATUS_LABELS[req.status] || STATUS_LABELS.PENDING;
            const roleInfo = ROLE_DISPLAY[req.userRole] || {
              label: req.userRole || t('Nhân sự'),
              bg: 'var(--portal-raised)',
              color: 'var(--portal-muted)',
            };
            const isPending = req.status === 'PENDING';

            return (
              <div data-i18n-managed
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
                          {t(roleInfo.label)}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--portal-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {req.userEmail} {t(" • Gửi lúc:")}{' '}
                        {formatCenterDateTime(req.createdAt)}
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
                      {t(typeInfo.label)}
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
                      {t(statusInfo.label)}
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
                    <div data-i18n-managed>
                      <strong style={{ color: 'var(--portal-muted)' }}>{t("Thời gian:")}</strong>{' '}
                      {formatCenterDate(req.startDate)}
                      {req.endDate && req.endDate !== req.startDate ? t(` đến ${formatCenterDate(req.endDate)}`, ` to ${formatCenterDate(req.endDate)}`) : ''}
                      {req.replacementUserFullName ? t(` · Thay thế: ${req.replacementUserFullName}`, ` · Substitute: ${req.replacementUserFullName}`) : ''}

                    </div>
                  )}

                  {req.targetShift && (
                    <div data-i18n-managed>
                      <strong style={{ color: 'var(--portal-muted)' }}>{t("Ca / Buổi liên quan:")}</strong>{' '}
                      {req.targetShift}
                    </div>
                  )}
                </div>

                {/* Review result if already reviewed */}
                {req.reviewedAt && (
                  <div data-i18n-managed
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
                      {req.status === 'APPROVED' ? t('Đã phê duyệt') : t('Đã từ chối')} {t(" bởi")}{' '}
                      {req.reviewedByName || t('Ban Quản Lý')} (
                      {formatCenterDate(req.reviewedAt)})
                    </div>
                    {req.managerNotes && (
                      <div data-i18n-managed style={{ marginTop: 4, color: 'var(--portal-paper)', fontStyle: 'italic' }}>
                        {t("Lời phê / Lý do: \"")}{req.managerNotes}"
                      </div>
                    )}
                  </div>
                )}

                {/* Manager Actions (Approve / Reject buttons for pending) */}
                {isPending && (
                  <div data-i18n-managed
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
                        border: '1px solid color-mix(in srgb, var(--portal-danger) 45%, transparent)',
                        background: 'var(--portal-raised)',
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--portal-danger)',
                        cursor: 'pointer',
                        transition: 'background-color 180ms ease, border-color 180ms ease, color 180ms ease',
                      }}
                    >
                      {t("Từ chối đơn")}</button>
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
                        color: 'var(--portal-on-accent)',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px color-mix(in srgb, var(--portal-success) 20%, transparent)',
                        transition: 'background-color 180ms ease, box-shadow 180ms ease, opacity 180ms ease',
                      }}
                    >
                      {t("Phê duyệt đơn")}</button>
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
              ? t(`Phê duyệt đơn: ${reviewTarget.title}`, `Approve request: ${reviewTarget.title}`)
              : t(`Từ chối đơn: ${reviewTarget.title}`, `Reject request: ${reviewTarget.title}`)
          }
          onClose={() => setReviewTarget(null)}
        >
          <form onSubmit={handleReviewSubmit} style={{ display: 'grid', gap: 16 }}>
            {modalError && (
              <div data-i18n-managed
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
                {t(modalError)}
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
                <strong>{t("Người làm đơn:")}</strong> {reviewTarget.userFullName} ({reviewTarget.userEmail})
              </div>
              <div>
                <strong>{t("Loại đơn:")}</strong> {t(TYPE_LABELS[reviewTarget.requestType]?.label)}
              </div>
              {reviewTarget.startDate && (
                <div data-i18n-managed>
                  <strong>{t("Thời gian đề xuất:")}</strong> {formatCenterDate(reviewTarget.startDate)}
                  {reviewTarget.endDate && t(` đến ${formatCenterDate(reviewTarget.endDate)}`, ` to ${formatCenterDate(reviewTarget.endDate)}`)}
                  {reviewTarget.replacementUserFullName ? t(` · Thay thế: ${reviewTarget.replacementUserFullName}`, ` · Substitute: ${reviewTarget.replacementUserFullName}`) : ''}

                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                {reviewAction === 'APPROVED'
                  ? t('Ghi chú / Lời nhắn của Quản lý gửi nhân viên (tùy chọn):')
                  : t('Lý do từ chối đơn (bắt buộc):')}
              </label>
              <textarea
                className="portal-input"
                rows={4}
                placeholder={
                  reviewAction === 'APPROVED'
                    ? t('Ví dụ: Đã bố trí nhân sự hỗ trợ, chúc bạn hoàn thành công việc...')
                    : t('Nêu rõ lý do từ chối (trùng lịch sự kiện, chưa có người thay thế...)')
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
                {t("Hủy")}</button>
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
                    reviewAction === 'APPROVED' ? 'var(--portal-success, #226442)' : 'var(--portal-danger)',
                  color: 'var(--portal-on-accent)',
                }}
              >
                {submitting
                  ? t('Đang xử lý...')
                  : reviewAction === 'APPROVED'
                  ? t('Xác nhận Phê duyệt')
                  : t('Xác nhận Từ chối')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

