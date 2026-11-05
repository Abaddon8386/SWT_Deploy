import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentUser } from '../../shared/api/client';
import { errorMessage } from '../../shared/lib/errorMessage';
import { PageHeader } from '../../shared/ui/PageHeader';
import { DatePicker } from '../../shared/ui/DatePicker';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import { notify } from '../../shared/lib/portalNotices';
import { formatCenterDate } from '../../shared/lib/centerTime';
import { reportsApi, type CancellationRequestDto, type ReportSummary } from './reportsApi';
import { Link } from 'react-router-dom';

const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} đ`;
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
  const [error, setError] = useState<string | null>(null);
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
        `Đã phê duyệt hủy gói "${item.packageName}" của ${item.memberName || `#${item.memberId}`} và hoàn ${vnd(Number(item.refundAmount ?? 0))} vào Ví hội viên.`,
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
      notify(`Đã từ chối yêu cầu hủy gói "${item.packageName}" của ${item.memberName || `#${item.memberId}`}.`, 'success', { record: true });
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
      csv += 'TRUNG TÂM THỂ THAO SCMS - BÁO CÁO DOANH THU & THỐNG KÊ TÀI CHÍNH\n';
      csv += `Kỳ Báo Cáo: Từ ngày ${appliedRange.startDate} đến ngày ${appliedRange.endDate}\n`;
      csv += `Thời gian Xuất: ${new Date().toLocaleString('vi-VN')}\n`;
      csv += `Người Xuất: Quản lý trung tâm (Center Manager)\n\n`;

      csv += '1. TỔNG QUAN CHỈ SỐ KPI\n';
      csv += `Doanh Thu Kỳ Lọc,${summary.periodRevenue} VNĐ\n`;
      csv += `Doanh Thu Hôm Nay,${summary.todayRevenue} VNĐ\n`;
      csv += `Số Gói Đã Bán,${summary.packagesSoldCount} gói\n`;
      csv += `Tỷ Lệ Gia Hạn,${summary.renewalRate !== null ? `${summary.renewalRate.toFixed(1)}%` : '—'}\n\n`;

      csv += '2. DOANH THU THEO GÓI TẬP\n';
      csv += 'Tên Gói Tập,Số Lượng Bán,Doanh Thu (VNĐ),Tỷ Trọng (%)\n';
      summary.packageRevenue.forEach((pkg) => {
        csv += `${csvText(pkg.packageName)},${pkg.subscriptionCount},${pkg.revenue},${pkg.percentage.toFixed(1)}%\n`;
      });
      csv += '\n';

      csv += '3. DOANH THU THEO TỪNG NGÀY\n';
      csv += 'Ngày,Doanh Thu (VNĐ),Số Lượng Giao Dịch\n';
      summary.dailyRevenue.forEach((d) => {
        csv += `${csvText(d.date)},${d.revenue},${d.transactionCount}\n`;
      });
      csv += '\n';

      csv += '4. GIAO DỊCH GẦN NHẤT\n';
      csv += 'Mã hóa đơn,Hội viên,Gói Tập,Số tiền (VNĐ),Hình thức,Thời gian\n';
      summary.recentTransactions.forEach((tx) => {
        const timeObj = formatTransactionTime(tx.paidAt);
        const timeStr = `${timeObj.time} ${timeObj.date}`.trim();
        csv += [
          csvText(tx.invoiceNumber ?? 'Chưa xuất'),
          csvText(tx.memberName),
          csvText(tx.packageName ?? '—'),
          tx.amount,
          csvText(paymentMethods[tx.method] ?? tx.method),
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
      <div className="portal-container" data-testid="reports-forbidden-guard">
        <div className="portal-card">
          <div className="portal-state" style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '2.25rem', fontWeight: 700, color: 'var(--portal-danger, #fca5a5)', marginBottom: '12px' }} role="img" aria-label="Forbidden">
              403
            </div>
            <h2 className="portal-state__title" style={{ fontSize: '1.5rem', marginBottom: '8px' }}>
              403 - Quyền truy cập bị từ chối
            </h2>
            <p style={{ color: 'var(--color-text-muted)', maxWidth: '480px', margin: '0 auto 20px auto' }}>
              Chỉ Quản lý trung tâm (Center Manager) mới có quyền truy cập báo cáo tài chính &amp; doanh thu.
            </p>
            <Link to="/portal" className="btn-secondary">
              Về trang chủ Portal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Tìm giá trị max doanh thu trong chart để chuẩn hóa tỷ lệ cột
  const dailyData = summary?.dailyRevenue || [];
  const maxDailyRevenue = Math.max(...dailyData.map((d) => d.revenue), 1);

  return (
    <div className="portal-container">
      <PageHeader
        eyebrow="Quản lý trung tâm"
        title="Báo cáo doanh thu"
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
                  <span className="spinner" />
                  <span>Đang xuất...</span>
                </>
              ) : (
                <>
                  <span>Xuất báo cáo</span>
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
            <span style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Từ ngày:</span>
            <DatePicker
              value={startDate}
              max={endDate || undefined}
              onChange={handleStartDateChange}
              style={{ width: '160px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Đến ngày:</span>
            <DatePicker
              value={endDate}
              min={startDate || undefined}
              onChange={handleEndDateChange}
              style={{ width: '160px' }}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading || isInvalidRange}>
            {loading ? 'Đang lọc...' : 'Áp dụng'}
          </button>

          {isInvalidRange && (
            <span style={{ fontSize: '0.82rem', color: 'var(--portal-danger, #fca5a5)', fontWeight: 500 }}>
              Ngày kết thúc không được nhỏ hơn ngày bắt đầu.
            </span>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.82rem' }}
              onClick={() => handleQuickRange(7)}
            >
              7 ngày qua
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.82rem' }}
              onClick={() => handleQuickRange(30)}
            >
              30 ngày qua
            </button>
          </div>
        </form>
      </div>

      {/* Duyệt yêu cầu hủy gói tập & Hoàn tiền về Ví (từ Lễ tân) */}
      <div className="portal-card" style={{ marginBottom: '24px' }}>
        <div className="portal-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 className="portal-card-title">
              Duyệt yêu cầu hủy gói tập &amp; Hoàn tiền về Ví ({cancellationRequests.filter((r) => r.status === 'PENDING').length})
            </h2>
          </div>
          <RefreshButton label="Làm mới yêu cầu hủy" onClick={() => void loadCancellations()} disabled={loadingCancellations} />
        </div>

        {loadingCancellations ? (
          <p className="row-card__meta" role="status" style={{ marginTop: 12 }}>Đang tải danh sách yêu cầu hủy gói…</p>
        ) : cancellationRequests.length === 0 ? (
          <div style={{ padding: '16px 0 4px', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            Hiện không có yêu cầu hủy gói tập &amp; hoàn tiền nào cần duyệt.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '12px', marginTop: '14px' }}>
            {cancellationRequests.map((req) => {
              const isBusy = decidingCancelId === req.id;
              const isPending = req.status === 'PENDING';
              return (
                <div
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
                        Yêu cầu #{req.id}
                      </span>
                      <strong>{req.memberName || `Hội viên #${req.memberId}`}</strong>
                      <span
                        className={`badge ${
                          req.status === 'PENDING'
                            ? 'badge-warning'
                            : req.status === 'APPROVED'
                              ? 'badge-success'
                              : 'badge-neutral'
                        }`}
                      >
                        {req.status === 'PENDING' ? 'CHỜ DUYỆT' : req.status === 'APPROVED' ? 'ĐÃ HOÀN VỀ VÍ' : 'ĐÃ TỪ CHỐI'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--color-text-main)', marginTop: '6px' }}>
                      Gói tập: <strong>{req.packageName}</strong> • Số tiền hoàn về Ví:{' '}
                      <strong style={{ color: 'var(--portal-success, #86efac)' }}>{vnd(Number(req.refundAmount ?? 0))}</strong>
                      {req.requestedByName && <span> • Trình bởi: {req.requestedByName}</span>}
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
                      <strong>Lý do hủy gói:</strong> {req.reason}
                    </div>
                  </div>

                  {isPending && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={decidingCancelId !== null}
                        onClick={() => void handleRejectCancellation(req)}
                      >
                        {isBusy ? 'Đang xử lý...' : 'Từ chối'}
                      </button>
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        disabled={decidingCancelId !== null}
                        onClick={() => void handleApproveCancellation(req)}
                      >
                        {isBusy ? 'Đang xử lý...' : 'Phê duyệt & Hoàn tiền về Ví'}
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
        <div className="portal-card" style={{ marginBottom: '24px' }}>
          <div className="portal-state" style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--portal-danger, #fca5a5)', marginBottom: '12px' }}>LỖI DỮ LIỆU</div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Lỗi khi tải dữ liệu báo cáo</h3>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '16px' }}>{error}</p>
            <button type="button" className="btn-primary" onClick={() => fetchReports(startDate, endDate)}>
              Thử lại
            </button>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div role="status" aria-busy="true">
          <span className="sr-only">Đang tải số liệu...</span>
          <div className="metrics-grid" style={{ marginBottom: '24px' }} aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="metric-card">
                <div className="portal-skeleton-line" style={{ width: '58%', height: 14, marginBottom: 12 }} />
                <div className="portal-skeleton-line" style={{ width: '75%', height: 28, marginBottom: 10 }} />
                <div className="portal-skeleton-line" style={{ width: '50%', height: 12 }} />
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
        <div className="metrics-grid" style={{ marginBottom: '24px' }}>
          <div className="metric-card">
            <div className="metric-label">Doanh thu hôm nay</div>
            <div className="metric-value">{vnd(summary.todayRevenue)}</div>
            <div className="metric-trend" style={{ color: summary.todayRevenue > 0 ? 'var(--portal-success, #86efac)' : 'var(--color-text-muted)' }}>
              {summary.todayRevenue > 0 ? '↑ Giao dịch phát sinh trong ngày' : 'Chưa có giao dịch hôm nay'}
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Doanh thu trong kỳ</div>
            <div className="metric-value">{vnd(summary.periodRevenue)}</div>
            <div className="metric-trend">Từ {formatCenterDate(appliedRange.startDate)} đến {formatCenterDate(appliedRange.endDate)}</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Gói đã bán</div>
            <div className="metric-value">{summary.packagesSoldCount}</div>
            <div className="metric-trend">Gói dịch vụ đã thanh toán</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Tỷ lệ gia hạn</div>
            {/* BR-03: Tỷ lệ gia hạn = số lượt gia hạn / số gói hết hạn trong kỳ; mẫu số bằng 0 hiển thị "—" thay vì lỗi chia 0 */}
            <div className="metric-value">
              {summary.renewalRate !== null ? `${summary.renewalRate.toFixed(1)}%` : '—'}
            </div>
            <div className="metric-trend">
              {summary.renewalRate !== null ? 'Gói hết hạn trong kỳ được gia hạn' : 'Chưa có gói hết hạn trong kỳ'}
            </div>
          </div>
        </div>
      )}

      {/* Biểu đồ doanh thu hàng ngày & Cơ cấu doanh thu */}
      {!loading && !error && summary && (
        <div className="reports-charts-grid">
          {/* Biểu đồ cột SVG */}
          <div className="portal-card" style={{ minWidth: 0, overflow: 'hidden' }}>
            <div className="portal-card-header" style={{ marginBottom: '16px' }}>
              <h2 className="portal-card-title">Doanh thu theo ngày</h2>
            </div>

            {dailyData.length === 0 || dailyData.every((d) => d.revenue === 0) ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
                Không có dữ liệu phát sinh doanh thu trong kỳ được chọn.
              </div>
            ) : (
              <div>
                {/* Khu vực tooltip hiển thị khi hover */}
                <div style={{ minHeight: '28px', marginBottom: '8px', fontSize: '0.88rem', fontWeight: 600 }}>
                  {hoveredBar && (
                    <span style={{ color: 'var(--color-accent-gold)' }}>
                      Ngày {formatCenterDate(hoveredBar.date)}: <strong>{vnd(hoveredBar.revenue)}</strong> ({hoveredBar.count} giao dịch)
                    </span>
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
                      <div
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
                        <div
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
              <h2 className="portal-card-title">Doanh thu theo gói tập</h2>
            </div>

            {summary.packageRevenue.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
                Chưa có gói tập nào phát sinh doanh thu trong kỳ này.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '16px' }}>
                {summary.packageRevenue.map((pkg) => (
                  <div key={pkg.packageId}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '6px' }}>
                      <span><strong>{pkg.packageName}</strong> ({pkg.subscriptionCount} lượt)</span>
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
        <div className="portal-card">
          <div className="portal-card-header" style={{ marginBottom: '16px' }}>
            <h2 className="portal-card-title">Giao dịch gần đây</h2>
          </div>

          {summary.recentTransactions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-muted)' }}>
              Chưa có giao dịch thanh toán nào được ghi nhận.
            </div>
          ) : (
            <div className="portal-table-wrapper" tabIndex={0} role="region" aria-label="Giao dịch gần đây, cuộn ngang để xem đầy đủ">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>Mã hóa đơn</th>
                    <th>Hội viên</th>
                    <th>Dịch vụ / gói tập</th>
                    <th>Số tiền</th>
                    <th>Hình thức</th>
                    <th>Thời gian</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentTransactions.map((tx) => (
                    <tr key={tx.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{tx.invoiceNumber ?? 'Chưa xuất hóa đơn'}</td>
                      <td>{tx.memberName}</td>
                      <td>{tx.packageName ?? '—'}</td>
                      <td style={{ fontWeight: 600, color: 'var(--portal-success, #86efac)' }}>{vnd(tx.amount)}</td>
                      <td>
                        <span className="badge badge-success" style={{ textTransform: 'uppercase', fontSize: '0.75rem' }}>
                          {paymentMethods[tx.method] ?? tx.method}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {(() => {
                          const { date, time } = formatTransactionTime(tx.paidAt);
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--color-text-main)', fontSize: '0.86rem' }}>
                                {date}
                              </span>
                              {time && (
                                <span style={{ fontSize: '0.78rem', color: 'var(--color-accent-gold)', fontWeight: 500, letterSpacing: '0.02em' }}>
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
