import { staffLocale, useStaffI18n, type StaffMessage, staffMessage, staffError as errorMessage, staffNotify as notify } from '../operations/staffI18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentUser } from '../../shared/api/client';
import { PageHeader } from '../../shared/ui/PageHeader';
import { DatePicker } from '../../shared/ui/DatePicker';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import { formatCenterDate } from '../../shared/lib/centerTime';
import { reportsApi, type CancellationRequestDto, type ReportSummary } from './reportsApi';
import { Link } from 'react-router-dom';

const vnd = (n: number) => `${Math.round(n).toLocaleString(staffLocale())} đ`;
const paymentMethods: Record<string, string> = {
  cash: 'Tiền mặt', pos: 'POS', bank_transfer: 'Chuyển khoản', online_wallet: 'Ví điện tử',
};

const formatTransactionTime = (paidAt: string) => {
  try {
    const d = new Date(paidAt);
    if (isNaN(d.getTime())) return { date: paidAt, time: '' };
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return { date, time };
  } catch {
    return { date: paidAt, time: '' };
  }
};

// CSV quoting alone does not stop spreadsheet formula evaluation.
const csvText = (raw: string) => {
  // eslint-disable-next-line no-control-regex -- include leading control characters in the formula guard
  const unsafe = /^[\u0000-\u0020]*[=+@-]|^[\t\r\n]/.test(raw);
  const value = unsafe ? "'" + raw : raw;
  return `"${value.replace(/"/g, '""')}"`;
};

export function ManagerReportsPage() {
  const { t } = useStaffI18n();
  const currentUser = getCurrentUser();

  // BR-01: Chỉ CENTER_MANAGER được xem báo cáo doanh thu tài chính
  const hasAccess = useMemo(() => {
    if (!currentUser) return false;
    return currentUser.role === 'MANAGER';
  }, [currentUser]);

  // Bộ lọc khoảng ngày mặc định: 30 ngày gần nhất
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const thirtyDaysAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);

  const [startDate, setStartDate] = useState(thirtyDaysAgoStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [appliedRange, setAppliedRange] = useState({
    startDate: thirtyDaysAgoStr,
    endDate: todayStr,
  });

  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<StaffMessage | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const latestRequest = useRef(0);

  const [cancellationRequests, setCancellationRequests] = useState<CancellationRequestDto[]>([]);
  const [loadingCancellations, setLoadingCancellations] = useState(false);
  const [decidingCancelId, setDecidingCancelId] = useState<number | null>(null);

  const [hoveredBar, setHoveredBar] = useState<{ date: string; revenue: number; count: number } | null>(null);

  const isInvalidRange = Boolean(startDate && endDate && startDate > endDate);

  const handleStartDateChange = (e: { target: { value: string } }) => {
    const val = e.target.value;
    setStartDate(val);
    if (val && endDate && val > endDate) {
      setEndDate(val);
    }
  };

  const handleEndDateChange = (e: { target: { value: string } }) => {
    const val = e.target.value;
    if (startDate && val && val < startDate) {
      setEndDate(startDate);
      return;
    }
    setEndDate(val);
  };

  const loadCancellations = useCallback(async () => {
    if (!hasAccess || typeof reportsApi.getCancellationRequests !== 'function') return;
    setLoadingCancellations(true);
    try {
      const items = await reportsApi.getCancellationRequests();
      setCancellationRequests(items ?? []);
    } catch {
      setCancellationRequests([]);
    } finally {
      setLoadingCancellations(false);
    }
  }, [hasAccess]);

  const fetchReports = useCallback(async (start: string, end: string) => {
    if (start > end) return;
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(null);
    try {
      const data = await reportsApi.getSummary(start, end);
      if (requestId !== latestRequest.current) return;
      setSummary(data);
      setAppliedRange({ startDate: start, endDate: end });
    } catch (err: unknown) {
      if (requestId !== latestRequest.current) return;
      const msg = errorMessage(err, 'Không thể tải báo cáo doanh thu.');
      setError(msg);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasAccess) return;
    void fetchReports(thirtyDaysAgoStr, todayStr);
    void loadCancellations();
  }, [hasAccess, fetchReports, loadCancellations, thirtyDaysAgoStr, todayStr]);

  const handleApproveCancellation = async (item: CancellationRequestDto) => {
    if (decidingCancelId !== null || typeof reportsApi.approveCancellationRequest !== 'function') return;
    setDecidingCancelId(item.id);
    try {
      await reportsApi.approveCancellationRequest(item.id, undefined, item.refundAmount ?? undefined);
      notify(
        staffMessage(`Đã phê duyệt hủy gói "${item.packageName}" của ${item.memberName || `#${item.memberId}`} và hoàn ${vnd(Number(item.refundAmount ?? 0))} vào Ví hội viên.`, `Approved cancellation of membership "${item.packageName}" for ${item.memberName || `#${item.memberId}`} and refunded ${vnd(Number(item.refundAmount ?? 0))} to the member's wallet.`),
        'success', { record: true }
      );
      await Promise.all([loadCancellations(), fetchReports(appliedRange.startDate, appliedRange.endDate)]);
    } catch (err: unknown) {
      notify(errorMessage(err, 'Phê duyệt hủy gói & hoàn tiền thất bại.'), 'error');
      await loadCancellations();
    } finally {
      setDecidingCancelId(null);
    }
  };

  const handleRejectCancellation = async (item: CancellationRequestDto) => {
    if (decidingCancelId !== null || typeof reportsApi.rejectCancellationRequest !== 'function') return;
    setDecidingCancelId(item.id);
    try {
      await reportsApi.rejectCancellationRequest(item.id);
      notify(staffMessage(`Đã từ chối yêu cầu hủy gói "${item.packageName}" của ${item.memberName || `#${item.memberId}`}.`, `Rejected cancellation request for membership "${item.packageName}" for ${item.memberName || `#${item.memberId}`}.`), 'success', { record: true });
      await loadCancellations();
    } catch (err: unknown) {
      notify(errorMessage(err, 'Từ chối yêu cầu hủy gói thất bại.'), 'error');
      await loadCancellations();
    } finally {
      setDecidingCancelId(null);
    }
  };

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalidRange) return;
    void fetchReports(startDate, endDate);
  };

  const handleQuickRange = (days: number) => {
    const end = todayStr;
    const d = new Date();
    d.setDate(d.getDate() - days);
    const start = d.toISOString().slice(0, 10);
    setStartDate(start);
    setEndDate(end);
    void fetchReports(start, end);
  };

  /**
   * SCRUM-84 & SCRUM-79: Xuất báo cáo doanh thu tài chính & Lưu Snapshot JSONB
   */
  const handleExportReport = async () => {
    if (!summary || isExporting) return;
    setIsExporting(true);
    try {
      // 1. Lưu ảnh chụp báo cáo Snapshot lên Database Supabase qua API
      await reportsApi.createSnapshot({
        reportType: 'revenue',
        periodStart: appliedRange.startDate,
        periodEnd: appliedRange.endDate,
        data: JSON.stringify({
          periodRevenue: summary.periodRevenue,
          todayRevenue: summary.todayRevenue,
          packagesSoldCount: summary.packagesSoldCount,
          renewalRate: summary.renewalRate,
          dailyRevenueCount: summary.dailyRevenue.length,
          packageRevenueCount: summary.packageRevenue.length,
          transactionCount: summary.recentTransactions.length,
        }),
      });

      // 2. Tạo nội dung file CSV có BOM UTF-8 (\uFEFF) mở chuẩn trong Excel tiếng Việt
      let csv = '\uFEFF';
      csv += t('TRUNG TÂM THỂ THAO SCMS - BÁO CÁO DOANH THU & THỐNG KÊ TÀI CHÍNH\n', "SCMS SPORTS CENTER - REVENUE REPORT & FINANCIAL STATISTICS\n");
      csv += t(`Kỳ Báo Cáo: Từ ngày ${appliedRange.startDate} đến ngày ${appliedRange.endDate}\n`, `Report period: From ${appliedRange.startDate} to ${appliedRange.endDate}
`);
      csv += t(`Thời gian Xuất: ${new Date().toLocaleString(staffLocale())}\n`, `Exported at: ${new Date().toLocaleString(staffLocale())}
`);
      csv += t(`Người Xuất: Quản lý trung tâm (Center Manager)\n\n`, "Exported by: Center Manager\n\n");

      csv += t('1. TỔNG QUAN CHỈ SỐ KPI\n', "1. KPI OVERVIEW\n");
      csv += t(`Doanh Thu Kỳ Lọc,${summary.periodRevenue} VNĐ\n`, `Period Revenue,${summary.periodRevenue} VND
`);
      csv += t(`Doanh Thu Hôm Nay,${summary.todayRevenue} VNĐ\n`, `Today's Revenue,${summary.todayRevenue} VND
`);
      csv += t(`Số Gói Đã Bán,${summary.packagesSoldCount} gói\n`, `Memberships Sold,${summary.packagesSoldCount} memberships
`);
      csv += t(`Tỷ Lệ Gia Hạn,${summary.renewalRate !== null ? `${summary.renewalRate.toFixed(1)}%` : '—'}\n\n`, `Renewal Rate,${summary.renewalRate !== null ? `${summary.renewalRate.toFixed(1)}%` : '—'}

`);

      csv += t('2. DOANH THU THEO GÓI TẬP\n', "2. REVENUE BY MEMBERSHIP\n");
      csv += t('Tên Gói Tập,Số Lượng Bán,Doanh Thu (VNĐ),Tỷ Trọng (%)\n', "Membership,Quantity Sold,Revenue (VND),Share (%)\n");
      summary.packageRevenue.forEach((pkg) => {
        csv += `${csvText(pkg.packageName)},${pkg.subscriptionCount},${pkg.revenue},${pkg.percentage.toFixed(1)}%\n`;
      });
      csv += '\n';

      csv += t('3. DOANH THU THEO TỪNG NGÀY\n', "3. DAILY REVENUE\n");
      csv += t('Ngày,Doanh Thu (VNĐ),Số Lượng Giao Dịch\n', "Date,Revenue (VND),Transactions\n");
      summary.dailyRevenue.forEach((d) => {
        csv += `${csvText(d.date)},${d.revenue},${d.transactionCount}\n`;
      });
      csv += '\n';

      csv += t('4. GIAO DỊCH GẦN NHẤT\n', "4. RECENT TRANSACTIONS\n");
      csv += t('Mã hóa đơn,Hội viên,Gói Tập,Số tiền (VNĐ),Hình thức,Thời gian\n', "Invoice,Member,Membership,Amount (VND),Method,Time\n");
      summary.recentTransactions.forEach((tx) => {
        const timeObj = formatTransactionTime(tx.paidAt);
        const timeStr = `${timeObj.time} ${timeObj.date}`.trim();
        csv += [
          csvText(tx.invoiceNumber ?? t('Chưa xuất', "Not exported")),
          csvText(tx.memberName),
          csvText(tx.packageName ?? '—'),
          tx.amount,
          csvText(paymentMethods[tx.method] ? t(paymentMethods[tx.method]) : tx.method),
          csvText(timeStr),
        ].join(',') + '\n';
      });

      // 3. Tải xuống file Excel/CSV về máy tính
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `BaoCao_DoanhThu_${appliedRange.startDate}_${appliedRange.endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      notify('Đã lưu báo cáo đối soát và xuất tệp CSV.', 'success', { record: true });
    } catch (err: unknown) {
      const msg = errorMessage(err, 'Xuất báo cáo thất bại.');
      notify(msg, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // 403 Forbidden Guard
  if (!hasAccess) {
    return (
      <div data-i18n-managed className="portal-container" data-testid="reports-forbidden-guard">
        <div className="portal-card">
          <div className="portal-state" style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '2.25rem', fontWeight: 700, color: 'var(--portal-danger, #fca5a5)', marginBottom: '12px' }} role="img" aria-label="Forbidden">
              403
            </div>
            <h2 className="portal-state__title" style={{ fontSize: '1.5rem', marginBottom: '8px' }}>
              {t("403 - Quyền truy cập bị từ chối")}</h2>
            <p style={{ color: 'var(--color-text-muted)', maxWidth: '480px', margin: '0 auto 20px auto' }}>
              {t("Chỉ Quản lý trung tâm (Center Manager) mới có quyền truy cập báo cáo tài chính & doanh thu.")}</p>
            <Link to="/portal" className="btn-secondary">
              {t("Về trang chủ Portal")}</Link>
          </div>
        </div>
      </div>
    );
  }

  // Tìm giá trị max doanh thu trong chart để chuẩn hóa tỷ lệ cột
  const dailyData = summary?.dailyRevenue || [];
  const maxDailyRevenue = Math.max(...dailyData.map((d) => d.revenue), 1);

  return (
    <div data-i18n-managed className="portal-container">
      <PageHeader
        eyebrow={t("Quản lý trung tâm")}
        title={t("Báo cáo doanh thu")}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleExportReport}
              disabled={isExporting || loading || !summary}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 600,
              }}
            >
              {isExporting ? (
                <>
                  <span data-i18n-managed className="spinner" />
                  <span data-i18n-managed>{t("Đang xuất...")}</span>
                </>
              ) : (
                <>
                  <span data-i18n-managed>{t("Xuất báo cáo")}</span>
                </>
              )}
            </button>
          </div>
        }
      />

      {/* Bộ lọc khoảng ngày (Interactive Filter) */}
      <div className="portal-card" style={{ marginBottom: '24px' }}>
        <form onSubmit={handleApplyFilter} style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t("Từ ngày:")}</span>
            <DatePicker
              value={startDate}
              max={endDate || undefined}
              onChange={handleStartDateChange}
              style={{ width: '160px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t("Đến ngày:")}</span>
            <DatePicker
              value={endDate}
              min={startDate || undefined}
              onChange={handleEndDateChange}
              style={{ width: '160px' }}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading || isInvalidRange}>
            {loading ? t('Đang lọc...') : t('Áp dụng')}
          </button>

          {isInvalidRange && (
            <span data-i18n-managed style={{ fontSize: '0.82rem', color: 'var(--portal-danger, #fca5a5)', fontWeight: 500 }}>
              {t("Ngày kết thúc không được nhỏ hơn ngày bắt đầu.")}</span>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.82rem' }}
              onClick={() => handleQuickRange(7)}
            >
              {t("7 ngày qua")}</button>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.82rem' }}
              onClick={() => handleQuickRange(30)}
            >
              {t("30 ngày qua")}</button>
          </div>
        </form>
      </div>

      {/* Duyệt yêu cầu hủy gói tập & Hoàn tiền về Ví (từ Lễ tân) */}
      <div className="portal-card" style={{ marginBottom: '24px' }}>
        <div className="portal-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 className="portal-card-title">
              {t("Duyệt yêu cầu hủy gói tập & Hoàn tiền về Ví (")}{cancellationRequests.filter((r) => r.status === 'PENDING').length})
            </h2>
          </div>
          <RefreshButton label={t("Làm mới yêu cầu hủy")} onClick={() => void loadCancellations()} disabled={loadingCancellations} />
        </div>

        {loadingCancellations ? (
          <p data-i18n-managed className="row-card__meta" role="status" style={{ marginTop: 12 }}>{t("Đang tải danh sách yêu cầu hủy gói…")}</p>
        ) : cancellationRequests.length === 0 ? (
          <div data-i18n-managed style={{ padding: '16px 0 4px', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            {t("Hiện không có yêu cầu hủy gói tập & hoàn tiền nào cần duyệt.")}</div>
        ) : (
          <div data-i18n-managed style={{ display: 'grid', gap: '12px', marginTop: '14px' }}>
            {cancellationRequests.map((req) => {
              const isBusy = decidingCancelId === req.id;
              const isPending = req.status === 'PENDING';
              return (
                <div data-i18n-managed
                  key={req.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '14px',
                    padding: '16px 18px',
                    borderRadius: '10px',
                    border: isPending ? '1px solid var(--color-accent-gold)' : '1px solid var(--color-border-subtle)',
                    backgroundColor: isPending ? 'var(--color-bg-warm)' : 'var(--color-bg-card)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-accent-gold)', fontSize: '0.92rem' }}>
                        {t("Yêu cầu #")}{req.id}
                      </span>
                      <strong>{req.memberName || t(`Hội viên #${req.memberId}`, `Member #${req.memberId}`)}</strong>
                      <span
                        className={`badge ${
                          req.status === 'PENDING'
                            ? 'badge-warning'
                            : req.status === 'APPROVED'
                              ? 'badge-success'
                              : 'badge-neutral'
                        }`}
                      >
                        {req.status === 'PENDING' ? t('CHỜ DUYỆT') : req.status === 'APPROVED' ? t('ĐÃ HOÀN VỀ VÍ') : t('ĐÃ TỪ CHỐI')}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--color-text-main)', marginTop: '6px' }}>
                      {t("Gói tập: ")}<strong>{req.packageName}</strong> {t(" • Số tiền hoàn về Ví:")}{' '}
                      <strong style={{ color: 'var(--portal-success, #86efac)' }}>{vnd(Number(req.refundAmount ?? 0))}</strong>
                      {req.requestedByName && <span> {t(" • Trình bởi: ")}{req.requestedByName}</span>}
                    </div>
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--color-bg-card)',
                        border: '1px solid var(--color-border-subtle)',
                        fontSize: '0.88rem',
                        color: 'var(--color-text-main)',
                      }}
                    >
                      <strong>{t("Lý do hủy gói:")}</strong> {req.reason}
                    </div>
                  </div>

                  {isPending && (
                    <div data-i18n-managed style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={decidingCancelId !== null}
                        onClick={() => void handleRejectCancellation(req)}
                      >
                        {isBusy ? t('Đang xử lý...') : t('Từ chối')}
                      </button>
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        disabled={decidingCancelId !== null}
                        onClick={() => void handleApproveCancellation(req)}
                      >
                        {isBusy ? t('Đang xử lý...') : t('Phê duyệt & Hoàn tiền về Ví')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Error state */}
      {error && !loading && (
        <div data-i18n-managed className="portal-card" style={{ marginBottom: '24px' }}>
          <div className="portal-state" style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--portal-danger, #fca5a5)', marginBottom: '12px' }}>{t("LỖI DỮ LIỆU")}</div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>{t("Lỗi khi tải dữ liệu báo cáo")}</h3>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '16px' }}>{t(error)}</p>
            <button type="button" className="btn-primary" onClick={() => fetchReports(startDate, endDate)}>
              {t("Thử lại")}</button>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div data-i18n-managed role="status" aria-busy="true">
          <span className="sr-only">{t("Đang tải số liệu...")}</span>
          <div className="metrics-grid" style={{ marginBottom: '24px' }} aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <div data-i18n-managed key={i} className="metric-card">
                <div data-i18n-managed className="portal-skeleton-line" style={{ width: '58%', height: 14, marginBottom: 12 }} />
                <div data-i18n-managed className="portal-skeleton-line" style={{ width: '75%', height: 28, marginBottom: 10 }} />
                <div data-i18n-managed className="portal-skeleton-line" style={{ width: '50%', height: 12 }} />
              </div>
            ))}
          </div>
          <div className="reports-charts-grid" aria-hidden="true">
            <div className="portal-card">
              <div className="portal-skeleton-line" style={{ width: '45%', height: 20, marginBottom: 18 }} />
              <div className="portal-skeleton-line" style={{ width: '100%', height: 190 }} />
            </div>
            <div className="portal-card">
              <div className="portal-skeleton-line" style={{ width: '55%', height: 20, marginBottom: 18 }} />
              <div className="portal-skeleton-line" style={{ width: '100%', height: 190 }} />
            </div>
          </div>
        </div>
      )}

      {/* 4 Thẻ KPI Metrics (AC: Doanh thu ngày, Doanh thu tháng, Số gói bán ra, Tỷ lệ gia hạn) */}
      {!loading && !error && summary && (
        <div data-i18n-managed className="metrics-grid" style={{ marginBottom: '24px' }}>
          <div className="metric-card">
            <div className="metric-label">{t("Doanh thu hôm nay")}</div>
            <div className="metric-value">{vnd(summary.todayRevenue)}</div>
            <div className="metric-trend" style={{ color: summary.todayRevenue > 0 ? 'var(--portal-success, #86efac)' : 'var(--color-text-muted)' }}>
              {summary.todayRevenue > 0 ? t('↑ Giao dịch phát sinh trong ngày') : t('Chưa có giao dịch hôm nay')}
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-label">{t("Doanh thu trong kỳ")}</div>
            <div className="metric-value">{vnd(summary.periodRevenue)}</div>
            <div className="metric-trend">{t("Từ ")}{formatCenterDate(appliedRange.startDate)} {t(" đến ")}{formatCenterDate(appliedRange.endDate)}</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">{t("Gói đã bán")}</div>
            <div className="metric-value">{summary.packagesSoldCount}</div>
            <div className="metric-trend">{t("Gói dịch vụ đã thanh toán")}</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">{t("Tỷ lệ gia hạn")}</div>
            {/* BR-03: Tỷ lệ gia hạn = số lượt gia hạn / số gói hết hạn trong kỳ; mẫu số bằng 0 hiển thị "—" thay vì lỗi chia 0 */}
            <div className="metric-value">
              {summary.renewalRate !== null ? `${summary.renewalRate.toFixed(1)}%` : '—'}
            </div>
            <div className="metric-trend">
              {summary.renewalRate !== null ? t('Gói hết hạn trong kỳ được gia hạn') : t('Chưa có gói hết hạn trong kỳ')}
            </div>
          </div>
        </div>
      )}

      {/* Biểu đồ doanh thu hàng ngày & Cơ cấu doanh thu */}
      {!loading && !error && summary && (
        <div data-i18n-managed className="reports-charts-grid">
          {/* Biểu đồ cột SVG */}
          <div className="portal-card" style={{ minWidth: 0, overflow: 'hidden' }}>
            <div className="portal-card-header" style={{ marginBottom: '16px' }}>
              <h2 className="portal-card-title">{t("Doanh thu theo ngày")}</h2>
            </div>

            {dailyData.length === 0 || dailyData.every((d) => d.revenue === 0) ? (
              <div data-i18n-managed style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
                {t("Không có dữ liệu phát sinh doanh thu trong kỳ được chọn.")}</div>
            ) : (
              <div data-i18n-managed>
                {/* Khu vực tooltip hiển thị khi hover */}
                <div style={{ minHeight: '28px', marginBottom: '8px', fontSize: '0.88rem', fontWeight: 600 }}>
                  {hoveredBar && (
                    <span data-i18n-managed style={{ color: 'var(--color-accent-gold)' }}>
                      {t("Ngày ")}{formatCenterDate(hoveredBar.date)}: <strong>{vnd(hoveredBar.revenue)}</strong> ({hoveredBar.count} {t(" giao dịch)")}</span>
                  )}
                </div>

                {/* Khung vẽ cột */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: dailyData.length > 15 ? '4px' : '8px',
                    height: '210px',
                    paddingBottom: '32px',
                    borderBottom: '1px solid var(--color-border-subtle)',
                    overflowX: 'auto',
                    overflowY: 'hidden',
                  }}
                >
                  {dailyData.map((d) => {
                    const heightPercent = d.revenue > 0 ? Math.max(8, Math.round((d.revenue / maxDailyRevenue) * 100)) : 0;
                    const isHovered = hoveredBar?.date === d.date;
                    const dateFormatted = d.date.slice(5).replace('-', '/');
                    return (
                      <div data-i18n-managed
                        key={d.date}
                        style={{
                          flex: '1 0 16px',
                          maxWidth: '40px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          height: '100%',
                          justifyContent: 'flex-end',
                        }}
                        onMouseEnter={() => setHoveredBar({ date: d.date, revenue: d.revenue, count: d.transactionCount })}
                        onMouseLeave={() => setHoveredBar(null)}
                      >
                        <div data-i18n-managed
                          style={{
                            width: '100%',
                            height: `${heightPercent}%`,
                            background: isHovered ? 'var(--portal-hover)' : 'var(--portal-salmon)',
                            borderRadius: '4px 4px 0 0',
                            transition: 'all 0.2s ease',
                            cursor: 'pointer',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '0.65rem',
                            color: 'var(--color-text-muted)',
                            marginTop: '8px',
                            transform: 'rotate(-45deg)',
                            whiteSpace: 'nowrap',
                            display: 'inline-block',
                          }}
                        >
                          {dateFormatted}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Cơ cấu doanh thu theo gói */}
          <div className="portal-card" style={{ minWidth: 0, overflow: 'hidden' }}>
            <div className="portal-card-header" style={{ marginBottom: '16px' }}>
              <h2 className="portal-card-title">{t("Doanh thu theo gói tập")}</h2>
            </div>

            {summary.packageRevenue.length === 0 ? (
              <div data-i18n-managed style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
                {t("Chưa có gói tập nào phát sinh doanh thu trong kỳ này.")}</div>
            ) : (
              <div data-i18n-managed style={{ display: 'grid', gap: '16px' }}>
                {summary.packageRevenue.map((pkg) => (
                  <div data-i18n-managed key={pkg.packageId}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '6px' }}>
                      <span><strong>{pkg.packageName}</strong> ({pkg.subscriptionCount} {t(" lượt)")}</span>
                      <span><strong>{vnd(pkg.revenue)}</strong> ({pkg.percentage}%)</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'var(--color-bg-warm)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, pkg.percentage)}%`,
                          height: '100%',
                          background: 'var(--portal-salmon)',
                          borderRadius: '4px',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bảng danh sách giao dịch gần nhất */}
      {!loading && !error && summary && (
        <div data-i18n-managed className="portal-card">
          <div className="portal-card-header" style={{ marginBottom: '16px' }}>
            <h2 className="portal-card-title">{t("Giao dịch gần đây")}</h2>
          </div>

          {summary.recentTransactions.length === 0 ? (
            <div data-i18n-managed style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-muted)' }}>
              {t("Chưa có giao dịch thanh toán nào được ghi nhận.")}</div>
          ) : (
            <div data-i18n-managed className="portal-table-wrapper" tabIndex={0} role="region" aria-label={t("Giao dịch gần đây, cuộn ngang để xem đầy đủ")}>
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>{t("Mã hóa đơn")}</th>
                    <th>{t("Hội viên")}</th>
                    <th>{t("Dịch vụ / gói tập")}</th>
                    <th>{t("Số tiền")}</th>
                    <th>{t("Hình thức")}</th>
                    <th>{t("Thời gian")}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentTransactions.map((tx) => (
                    <tr data-i18n-managed key={tx.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{tx.invoiceNumber ?? t('Chưa xuất hóa đơn')}</td>
                      <td>{tx.memberName}</td>
                      <td>{tx.packageName ?? '—'}</td>
                      <td style={{ fontWeight: 600, color: 'var(--portal-success, #86efac)' }}>{vnd(tx.amount)}</td>
                      <td>
                        <span className="badge badge-success" style={{ textTransform: 'uppercase', fontSize: '0.75rem' }}>
                          {t(paymentMethods[tx.method]) ?? tx.method}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {(() => {
                          const { date, time } = formatTransactionTime(tx.paidAt);
                          return (
                            <div data-i18n-managed style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--color-text-main)', fontSize: '0.86rem' }}>
                                {date}
                              </span>
                              {time && (
                                <span data-i18n-managed style={{ fontSize: '0.78rem', color: 'var(--color-accent-gold)', fontWeight: 500, letterSpacing: '0.02em' }}>
                                  {time}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
