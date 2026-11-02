import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { Select } from '../../shared/ui/Select';
import { Modal } from '../../shared/ui/Modal';
import {
  auditApi,
  type AuditLogItem,
  type ClassOccupancyItem,
} from './auditApi';
import './manager-audit-logs.css';

type ActiveTab = 'audit' | 'occupancy';

export function ManagerAuditLogsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('audit');

  // Audit Logs state
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(true);
  const [logsError, setLogsError] = useState<string>('');
  const [logsReload, setLogsReload] = useState<number>(0);
  const [totalElements, setTotalElements] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(0);

  // Audit Filter state
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedEntityType, setSelectedEntityType] = useState<string>('ALL');
  const [actorSearch, setActorSearch] = useState<string>('');

  // Diff Modal state
  const [diffLog, setDiffLog] = useState<AuditLogItem | null>(null);

  // Occupancy Report state
  const [occupancyList, setOccupancyList] = useState<ClassOccupancyItem[]>([]);
  const [loadingOccupancy, setLoadingOccupancy] = useState<boolean>(true);
  const [occupancyError, setOccupancyError] = useState<string>('');
  const [occupancyReload, setOccupancyReload] = useState<number>(0);

  // Fetch Audit Logs
  useEffect(() => {
    let mounted = true;
    const fetchAudit = async () => {
      setLoadingLogs(true);
      setLogsError('');
      try {
        const res = await auditApi.getAuditLogs({
          action: selectedAction,
          entityType: selectedEntityType,
          page: currentPage,
          size: 8,
        });
        if (mounted) {
          setLogs(res.content);
          setTotalElements(res.totalElements);
          setTotalPages(Math.max(1, res.totalPages));
        }
      } catch (err) {
        if (mounted) {
          setLogs([]);
          setTotalElements(0);
          setLogsError(err instanceof Error ? err.message : 'Không thể tải nhật ký kiểm toán.');
        }
      } finally {
        if (mounted) setLoadingLogs(false);
      }
    };

    fetchAudit();
    return () => {
      mounted = false;
    };
  }, [selectedAction, selectedEntityType, currentPage, logsReload]);

  // Fetch Occupancy
  useEffect(() => {
    let mounted = true;
    const fetchOccupancy = async () => {
      setLoadingOccupancy(true);
      setOccupancyError('');
      try {
        const data = await auditApi.getClassOccupancy();
        if (mounted) {
          setOccupancyList(data);
        }
      } catch (err) {
        if (mounted) {
          setOccupancyList([]);
          setOccupancyError(err instanceof Error ? err.message : 'Không thể tải tỷ lệ lấp đầy lớp học.');
        }
      } finally {
        if (mounted) setLoadingOccupancy(false);
      }
    };

    if (activeTab === 'occupancy') {
      fetchOccupancy();
    }
    return () => {
      mounted = false;
    };
  }, [activeTab, occupancyReload]);

  // Filter logs by actor search locally
  const filteredLogs = useMemo(() => {
    if (!actorSearch.trim()) return logs;
    const q = actorSearch.toLowerCase().trim();
    return logs.filter(
      (l) =>
        l.userFullName.toLowerCase().includes(q) ||
        l.userEmail.toLowerCase().includes(q)
    );
  }, [logs, actorSearch]);

  // Overall Occupancy Metrics
  const occupancyMetrics = useMemo(() => {
    if (occupancyList.length === 0) {
      return { avgUtilization: 0, highestClass: '—', totalCapacity: 0, totalEnrolled: 0 };
    }
    const totalCap = occupancyList.reduce((acc, c) => acc + c.capacity, 0);
    const totalEnr = occupancyList.reduce((acc, c) => acc + c.enrolledCount, 0);
    const avg = totalCap > 0 ? (totalEnr / totalCap) * 100 : 0;
    const sorted = [...occupancyList].sort((a, b) => b.utilizationRate - a.utilizationRate);

    return {
      avgUtilization: Math.round(avg * 10) / 10,
      highestClass: sorted[0]?.className || '—',
      totalCapacity: totalCap,
      totalEnrolled: totalEnr,
    };
  }, [occupancyList]);

  const formatJsonPretty = (val: unknown) => {
    if (val === null || val === undefined) {
      return 'null';
    }
    if (typeof val === 'string') {
      try {
        return JSON.stringify(JSON.parse(val), null, 2);
      } catch {
        return val;
      }
    }
    return JSON.stringify(val, null, 2);
  };

  const getActionBadgeClass = (act: string) => {
    const a = act.toUpperCase();
    if (a === 'CREATE' || a === 'GRANTED' || a === 'USER_CREATE') return 'is-create';
    if (a === 'UPDATE' || a === 'USER_UPDATE' || a === 'RECEPTIONIST_PROFILE_UPDATE') return 'is-update';
    if (a === 'DELETE' || a === 'CANCEL' || a === 'DENIED' || a === 'USER_DELETE' || a === 'USER_CLEANUP_INACTIVE') return 'is-delete';
    if (a === 'SCAN') return 'is-scan';
    return '';
  };

  const getActionLabel = (act: string) => {
    const a = act.toUpperCase();
    switch (a) {
      case 'CREATE': return 'Tạo mới';
      case 'UPDATE': return 'Cập nhật';
      case 'DELETE': return 'Xóa';
      case 'CANCEL': return 'Hủy gói';
      case 'SCAN': return 'Quét QR';
      case 'USER_CREATE': return 'Tạo tài khoản';
      case 'USER_UPDATE': return 'Sửa tài khoản';
      case 'USER_DELETE': return 'Xóa tài khoản';
      case 'USER_STATUS_CHANGE': return 'Đổi trạng thái';
      case 'USER_CLEANUP_INACTIVE': return 'Dọn dẹp tự động';
      case 'RECEPTIONIST_PROFILE_UPDATE': return 'Đổi ca trực';
      case 'GRANTED': return 'Cấp quyền';
      case 'DENIED': return 'Thu hồi quyền';
      default: return act;
    }
  };

  const getEntityLabel = (type: string) => {
    switch (type) {
      case 'membership_subscriptions': return 'Gói tập';
      case 'payments': return 'Thanh toán';
      case 'session_attendance': return 'Điểm danh';
      case 'center_checkins': return 'Lượt ra vào';
      case 'cancellation_requests': return 'Yêu cầu hủy';
      case 'users': return 'Tài khoản';
      case 'receptionists': return 'Lễ tân';
      case 'classes': return 'Lớp học';
      case 'class_sessions': return 'Buổi học';
      default: return type;
    }
  };

  return (
    <div className="audit-page portal-container">
      <PageHeader
        eyebrow="Quản trị trung tâm"
        title="Giám sát audit log & báo cáo lấp đầy lớp"
        subtitle="Tra cứu nhật ký kiểm toán hệ thống, phân tích diff thay đổi và theo dõi tỷ lệ lấp đầy phòng học theo bộ môn."
      />

      {/* Navigation Tabs */}
      <div className="audit-view-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'audit'}
          className={`audit-tab-btn ${activeTab === 'audit' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          Nhật ký kiểm toán (Audit Trail)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'occupancy'}
          className={`audit-tab-btn ${activeTab === 'occupancy' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('occupancy')}
        >
          Tỷ lệ lấp đầy phòng học theo bộ môn
        </button>
      </div>

      {activeTab === 'audit' ? (
        <section aria-label="Bảng tra cứu Audit Log">
          {/* Filters Bar */}
          <div className="audit-filter-bar">
            <div className="audit-filter-group" style={{ flex: 1.2, minWidth: '220px' }}>
              <span className="filter-label">Tìm kiếm Người thực hiện</span>
              <input
                type="text"
                className="portal-input"
                placeholder="Nhập tên hoặc email..."
                value={actorSearch}
                onChange={(e) => setActorSearch(e.target.value)}
                aria-label="Tìm kiếm người thực hiện"
              />
            </div>

            <div className="audit-filter-group" style={{ minWidth: '160px' }}>
              <span className="filter-label">Hành động (Action)</span>
              <Select
                className="portal-select"
                value={selectedAction}
                onChange={(e) => {
                  setSelectedAction(e.target.value);
                  setCurrentPage(0);
                }}
                aria-label="Lọc theo hành động"
              >
                <option value="ALL">Tất cả hành động</option>
                <option value="CREATE">Tạo mới (CREATE)</option>
                <option value="UPDATE">Cập nhật (UPDATE)</option>
                <option value="DELETE">Xóa (DELETE)</option>
                <option value="CANCEL">Hủy gói (CANCEL)</option>
                <option value="SCAN">Quét mã (SCAN)</option>
                <option value="USER_CREATE">Tạo người dùng (USER_CREATE)</option>
                <option value="USER_UPDATE">Sửa người dùng (USER_UPDATE)</option>
                <option value="USER_CLEANUP_INACTIVE">Dọn dẹp tự động (USER_CLEANUP)</option>
              </Select>
            </div>

            <div className="audit-filter-group" style={{ minWidth: '180px' }}>
              <span className="filter-label">Đối tượng (Entity Type)</span>
              <Select
                className="portal-select"
                value={selectedEntityType}
                onChange={(e) => {
                  setSelectedEntityType(e.target.value);
                  setCurrentPage(0);
                }}
                aria-label="Lọc theo đối tượng"
              >
                <option value="ALL">Tất cả đối tượng</option>
                <option value="membership_subscriptions">Gói tập (subscriptions)</option>
                <option value="payments">Thanh toán (payments)</option>
                <option value="session_attendance">Điểm danh (attendance)</option>
                <option value="center_checkins">Lượt ra vào (check-ins)</option>
                <option value="cancellation_requests">Yêu cầu hủy (cancellations)</option>
                <option value="users">Tài khoản (users)</option>
                <option value="receptionists">Ca trực lễ tân (receptionists)</option>
              </Select>
            </div>
          </div>

          {/* Audit Table */}
          <div className="audit-table-card">
            {loadingLogs ? (
              <LoadingSkeleton label="Đang tải nhật ký kiểm toán…" variant="table" count={8} />
            ) : logsError ? (
              <div className="portal-alert" role="alert">
                <span>{logsError}</span>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setLogsReload((n) => n + 1)}>Thử lại</button>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-muted)' }}>
                <p>Không tìm thấy bản ghi nhật ký kiểm toán nào phù hợp.</p>
              </div>
            ) : (
              <table className="audit-table" aria-label="Bảng nhật ký kiểm toán">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Người thực hiện</th>
                    <th>Hành động</th>
                    <th>Đối tượng</th>
                    <th>Bản ghi ID</th>
                    <th style={{ textAlign: 'right' }}>Chi tiết thay đổi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
                        {log.createdAt ? log.createdAt.replace('T', ' ') : '—'}
                      </td>
                      <td>
                        <div className="actor-meta">
                          <span className="actor-name">{log.userFullName || 'Hệ thống'}</span>
                          <span className="actor-email">{log.userEmail || `User #${log.userId}`}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`action-badge ${getActionBadgeClass(log.action)}`}>
                          {getActionLabel(log.action)}
                        </span>
                        <div style={{ fontSize: '0.72rem', color: 'var(--portal-muted)', marginTop: 2, fontFamily: 'monospace' }}>
                          {log.action}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--portal-paper)' }}>
                          {getEntityLabel(log.entityType)}
                        </div>
                        <code style={{ fontSize: '0.75rem', color: 'var(--portal-salmon)' }}>
                          {log.entityType}
                        </code>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>#{log.entityId}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-view-diff"
                          onClick={() => setDiffLog(log)}
                          aria-label={`Xem diff bản ghi #${log.id}`}
                        >
                          Xem Diff
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Pagination Controls */}
            <div className="audit-pagination-bar">
              <span>
                Hiển thị trang <strong>{currentPage + 1}</strong> / <strong>{totalPages}</strong> ({totalElements} bản ghi)
              </span>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="btn-page-nav"
                  disabled={currentPage <= 0}
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  aria-label="Trang trước"
                >
                  ← Trang trước
                </button>
                <button
                  type="button"
                  className="btn-page-nav"
                  disabled={currentPage >= totalPages - 1}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  aria-label="Trang sau"
                >
                  Trang sau →
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        /* Tab 2: Occupancy Chart Section */
        <section aria-label="Biểu đồ tỷ lệ lấp đầy phòng học theo bộ môn">
          {occupancyError && !loadingOccupancy && (
            <div className="portal-alert" role="alert">
              <span>{occupancyError}</span>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setOccupancyReload((n) => n + 1)}>Thử lại</button>
            </div>
          )}
          {loadingOccupancy ? <LoadingSkeleton label="Đang tải tổng quan công suất lớp học…" variant="cards" count={3} /> : occupancyError ? null : <div className="occupancy-summary-cards">
            <div className="occupancy-stat-card">
              <span className="stat-card-title">Tỷ lệ lấp đầy trung bình</span>
              <span className="stat-card-number">{occupancyMetrics.avgUtilization}%</span>
            </div>
            <div className="occupancy-stat-card">
              <span className="stat-card-title">Lớp công suất cao nhất</span>
              <span className="stat-card-number" style={{ fontSize: '1.25rem', lineHeight: 1.3 }}>
                {occupancyMetrics.highestClass}
              </span>
            </div>
            <div className="occupancy-stat-card">
              <span className="stat-card-title">Tổng học viên đã book / Sức chứa</span>
              <span className="stat-card-number">
                {occupancyMetrics.totalEnrolled} / {occupancyMetrics.totalCapacity}
              </span>
            </div>
          </div>}

          <div className="occupancy-chart-card">
            <h3 style={{ fontSize: '1.15rem', color: 'var(--color-text-main)', margin: '0 0 6px' }}>
              Biểu đồ trực quan tỷ lệ lấp đầy theo lớp & bộ môn
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--color-text-muted)', margin: 0 }}>
              Thước đo tỷ lệ học viên ghi danh so với sức chứa tối đa của phòng học (Capacity).
            </p>

            {loadingOccupancy ? (
              <LoadingSkeleton label="Đang tải biểu đồ công suất lớp học…" count={4} />
            ) : occupancyError ? null : occupancyList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--color-text-muted)' }}>
                <p>Không có dữ liệu lớp học nào.</p>
              </div>
            ) : (
              <div className="chart-discipline-list">
                {occupancyList.map((item) => (
                  <div key={item.classId} className="discipline-chart-item">
                    <div className="discipline-chart-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="discipline-name-bold">{item.className}</span>
                        {item.disciplineName && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                            ({item.disciplineName})
                          </span>
                        )}
                      </div>
                      <span className="discipline-rate-badge">{item.utilizationRate}%</span>
                    </div>

                    <div className="progress-track-bg">
                      <div
                        className="progress-fill-bar"
                        style={{ width: `${Math.min(100, Math.max(0, item.utilizationRate))}%` }}
                      />
                    </div>

                    <div className="discipline-chart-footer">
                      <span>
                        Sĩ số: <strong>{item.enrolledCount}</strong> / <strong>{item.capacity}</strong> học viên
                      </span>
                      <span>
                        Tỷ lệ chuyên cần (thực tế đi học): <strong>{item.attendanceRate}%</strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Modal xem chi tiết thay đổi diff (old_value vs new_value) */}
      {diffLog && (
        <Modal
          title={`Chi tiết thay đổi bản ghi #${diffLog.id} (${diffLog.action} trên ${diffLog.entityType})`}
          onClose={() => setDiffLog(null)}
        >
          <div className="diff-modal-container">
            <div className="diff-header-summary">
              <div>
                <strong>Người thực hiện:</strong> {diffLog.userFullName} ({diffLog.userEmail})
              </div>
              <div>
                <strong>Thời gian:</strong> {diffLog.createdAt ? diffLog.createdAt.replace('T', ' ') : '—'}
              </div>
              {diffLog.ipAddress && (
                <div>
                  <strong>Địa chỉ IP:</strong> {diffLog.ipAddress}
                </div>
              )}
            </div>

            <div className="diff-grid-comparison">
              <div className="diff-box is-old">
                <div className="diff-box-title">
                  <span>Giá trị cũ (old_value)</span>
                </div>
                <pre className="diff-code-content">
                  {diffLog.oldValue ? formatJsonPretty(diffLog.oldValue) : '(Không có giá trị cũ - Bản ghi tạo mới)'}
                </pre>
              </div>

              <div className="diff-box is-new">
                <div className="diff-box-title">
                  <span>Giá trị mới (new_value)</span>
                </div>
                <pre className="diff-code-content">
                  {diffLog.newValue ? formatJsonPretty(diffLog.newValue) : '(Không có giá trị mới - Bản ghi bị xóa)'}
                </pre>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDiffLog(null)}
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
