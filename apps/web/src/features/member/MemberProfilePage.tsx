import { Select } from '../../shared/ui/Select';
import React, { useCallback, useEffect, useState } from 'react';
import {
  addHealthMetric,
  updateHealthMetric,
  deleteHealthMetric,
  getProfile,
  listHealthMetrics,
  updateProfile,
  type HealthMetric,
  type Profile,
} from './profileApi';
import { getCurrentUser } from '../../shared/api/client';
import { errorMessage } from '../../shared/lib/errorMessage';
import { notify } from '../../shared/lib/portalNotices';
import { useConfirm } from '../../shared/ui/ConfirmDialog';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatCenterDate } from '../../shared/lib/centerTime';

// Mã chỉ số hợp lệ theo backend (HealthMetricService.ALLOWED_METRICS)
const METRIC_LABELS: Record<string, string> = {
  weight: 'Cân nặng (kg)',
  height: 'Chiều cao (cm)',
  bmi: 'BMI',
  body_fat: 'Tỷ lệ mỡ (%)',
  muscle_mass: 'Khối lượng cơ (kg)',
};

const DEFAULT_UNITS: Record<string, string> = {
  weight: 'kg',
  height: 'cm',
  bmi: '',
  body_fat: '%',
  muscle_mass: 'kg',
};

const EMPTY_METRIC = { metricName: '', metricValue: '', unit: '' };

export function MemberProfilePage() {
  const currentUser = getCurrentUser();
  const isMember = currentUser?.role === 'MEMBER';
  const roleName = currentUser?.role === 'COACH'
    ? 'Huấn luyện viên'
    : currentUser?.role === 'STAFF'
    ? 'Lễ tân'
    : currentUser?.role === 'MANAGER'
    ? 'Quản lý trung tâm'
    : currentUser?.role === 'ADMIN'
    ? 'Quản trị hệ thống'
    : 'Hội viên';

  const [profile, setProfile] = useState<Profile | null>(null);
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [metric, setMetric] = useState(EMPTY_METRIC);
  const [editingMetricId, setEditingMetricId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submittingMetric, setSubmittingMetric] = useState(false);
  const [deletingMetricId, setDeletingMetricId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const p = await getProfile();
      setProfile(p);
      if (isMember) {
        setMetrics(await listHealthMetrics(p.userId).catch(() => []));
      } else {
        setMetrics([]);
      }
    } catch (err) {
      setError(errorMessage(err, 'Không thể tải hồ sơ.'));
    } finally {
      setLoading(false);
    }
  }, [isMember]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (changes: Partial<Profile>) => profile && setProfile({ ...profile, ...changes });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || saving) return;
    setError('');
    setSaving(true);
    try {
      const updated = await updateProfile(profile);
      setProfile(updated);
      notify('Đã cập nhật hồ sơ cá nhân.', 'success');
    } catch (err) {
      setError(errorMessage(err, 'Không thể lưu hồ sơ.'));
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (m: HealthMetric) => {
    setEditingMetricId(m.id);
    setMetric({
      metricName: m.metricName,
      metricValue: String(m.metricValue),
      unit: m.unit ?? DEFAULT_UNITS[m.metricName] ?? '',
    });
    setError('');
  };

  const handleCancelEdit = () => {
    setEditingMetricId(null);
    setMetric(EMPTY_METRIC);
    setError('');
  };

  const handleDeleteMetric = async (metricId: number) => {
    if (!profile) return;
    const confirmed = await confirm({ title: 'Xóa chỉ số sức khỏe?', message: 'Chỉ số này sẽ bị xóa khỏi lịch sử của bạn.', confirmLabel: 'Xóa chỉ số', danger: true });
    if (!confirmed) return;
    setError('');
    setDeletingMetricId(metricId);
    try {
      await deleteHealthMetric(profile.userId, metricId);
      if (editingMetricId === metricId) {
        handleCancelEdit();
      }
      setMetrics(await listHealthMetrics(profile.userId));
      notify('Đã xóa chỉ số sức khỏe.', 'success');
    } catch (err) {
      setError(errorMessage(err, 'Không thể xóa chỉ số.'));
    } finally {
      setDeletingMetricId(null);
    }
  };

  const handleMetricSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || submittingMetric) return;
    if (!metric.metricName) {
      setError('Vui lòng chọn loại chỉ số.');
      return;
    }
    setError('');
    setSubmittingMetric(true);
    try {
      if (editingMetricId !== null) {
        await updateHealthMetric(profile.userId, editingMetricId, {
          metricName: metric.metricName.trim(),
          metricValue: Number(metric.metricValue),
          unit: metric.unit.trim() || null,
        });
        notify('Đã cập nhật chỉ số sức khỏe.', 'success');
        setEditingMetricId(null);
      } else {
        await addHealthMetric(profile.userId, {
          metricName: metric.metricName.trim(),
          metricValue: Number(metric.metricValue),
          unit: metric.unit.trim() || null,
        });
        notify('Đã ghi nhận chỉ số sức khỏe.', 'success');
      }
      setMetric(EMPTY_METRIC);
      setMetrics(await listHealthMetrics(profile.userId));
    } catch (err) {
      setError(errorMessage(err, editingMetricId ? 'Không thể cập nhật chỉ số.' : 'Không thể ghi chỉ số.'));
    } finally {
      setSubmittingMetric(false);
    }
  };

  if (loading) {
    return (
      <div className="portal-container" role="status" aria-busy="true">
        <span className="sr-only">Đang tải thông tin hồ sơ...</span>
        <PageHeader eyebrow={isMember ? 'Hội viên' : 'Tài khoản'} title={isMember ? 'Hồ sơ & Chỉ số sức khỏe' : 'Hồ sơ cá nhân'} />
        <div className={isMember ? 'profile-grid' : 'profile-grid profile-grid--single'} aria-hidden="true">
          <div className="portal-card">
            <div className="portal-skeleton-line" style={{ width: '45%', height: 22, marginBottom: 20 }} />
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="portal-skeleton-line" style={{ width: '100%', height: 42, marginBottom: 14 }} />
            ))}
          </div>
          {isMember && (
            <div className="portal-card">
              <div className="portal-skeleton-line" style={{ width: '52%', height: 22, marginBottom: 20 }} />
              {[1, 2, 3].map((row) => (
                <div key={row} className="portal-skeleton-line" style={{ width: '100%', height: 48, marginBottom: 14 }} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="portal-container">
        <div className="portal-state" role="alert">
          <h2 className="portal-state__title">Không tìm thấy thông tin hồ sơ</h2>
          <p>{error || 'Hệ thống chưa tìm thấy dữ liệu hồ sơ của bạn.'}</p>
          <button type="button" className="btn-primary" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-container">
      <PageHeader
        eyebrow={isMember ? 'Hội viên' : 'Tài khoản'}
        title={isMember ? 'Hồ sơ & Chỉ số sức khỏe' : 'Hồ sơ cá nhân'}
      />

      {error && (
        <div role="alert" className="portal-alert">
          <span>{error}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setError('')}>
            Đóng
          </button>
        </div>
      )}

      <div className={isMember ? 'profile-grid' : 'profile-grid profile-grid--single'}>
        {/* Cột 1: Thông tin cá nhân */}
        <div className="portal-card">
          <div className="portal-card-header">
            <h2 className="portal-card-title">Thông tin cá nhân</h2>
            {!isMember && (
              <span className="badge badge-info">{roleName}</span>
            )}
          </div>

          <form onSubmit={handleSave}>
            <div className="grid-2">
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="fullName">Họ và tên</label>
                <input
                  id="fullName"
                  type="text"
                  className="portal-input"
                  required
                  value={profile.fullName}
                  onChange={(e) => patch({ fullName: e.target.value })}
                />
              </div>

              {isMember ? (
                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="membershipCode">Mã hội viên</label>
                  <input
                    id="membershipCode"
                    type="text"
                    className="portal-input"
                    value={profile.membershipCode ?? 'Chưa cấp mã'}
                    disabled
                    readOnly
                  />
                </div>
              ) : (
                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="roleBadge">Vai trò tài khoản</label>
                  <input
                    id="roleBadge"
                    type="text"
                    className="portal-input"
                    value={roleName}
                    disabled
                    readOnly
                  />
                </div>
              )}
            </div>

            <div className="grid-2">
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  className="portal-input"
                  value={profile.email ?? ''}
                  disabled
                  readOnly
                />
              </div>
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="phone">Số điện thoại</label>
                <input
                  id="phone"
                  type="tel"
                  className="portal-input"
                  placeholder="Vd: 0912345678"
                  value={profile.phone ?? ''}
                  onChange={(e) => patch({ phone: e.target.value })}
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="dob">Ngày sinh</label>
                <input
                  id="dob"
                  type="date"
                  className="portal-input"
                  value={profile.dob ?? ''}
                  onChange={(e) => patch({ dob: e.target.value || null })}
                />
              </div>
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="gender">Giới tính</label>
                <Select
                  id="gender"
                  className="portal-select"
                  value={profile.gender ?? ''}
                  onChange={(e) => patch({ gender: e.target.value || null })}
                >
                  <option value="">Chưa chọn</option>
                  <option value="male">Nam</option>
                  <option value="female">Nữ</option>
                  <option value="other">Khác</option>
                </Select>
              </div>
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="address">Địa chỉ</label>
              <input
                id="address"
                type="text"
                className="portal-input"
                placeholder="Vd: 123 Lê Duẩn, Quận 1, TP. HCM"
                value={profile.address ?? ''}
                onChange={(e) => patch({ address: e.target.value })}
              />
            </div>

            {/* Các trường thể lực & sức khỏe - Dành riêng cho Hội viên (MEMBER) */}
            {isMember && (
              <>
                <div className="grid-2">
                  <div className="portal-form-group">
                    <label className="portal-label" htmlFor="fitnessLevel">Trình độ thể lực</label>
                    <Select
                      id="fitnessLevel"
                      className="portal-select"
                      value={profile.fitnessLevel ?? 'beginner'}
                      onChange={(e) => patch({ fitnessLevel: e.target.value })}
                    >
                      <option value="beginner">Beginner (Mới bắt đầu)</option>
                      <option value="intermediate">Intermediate (Trung cấp)</option>
                      <option value="advanced">Advanced (Nâng cao / Chuyên nghiệp)</option>
                    </Select>
                  </div>
                  <div className="portal-form-group">
                    <label className="portal-label" htmlFor="emergencyName">Người liên hệ khẩn cấp</label>
                    <input
                      id="emergencyName"
                      type="text"
                      className="portal-input"
                      placeholder="Họ tên người thân"
                      value={profile.emergencyContactName ?? ''}
                      onChange={(e) => patch({ emergencyContactName: e.target.value })}
                    />
                  </div>
                </div>

                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="emergencyPhone">Số điện thoại khẩn cấp</label>
                  <input
                    id="emergencyPhone"
                    type="tel"
                    className="portal-input"
                    placeholder="0912 345 678"
                    value={profile.emergencyContactPhone ?? ''}
                    onChange={(e) => patch({ emergencyContactPhone: e.target.value })}
                  />
                </div>

                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="fitnessGoal">Mục tiêu thể lực</label>
                  <textarea
                    id="fitnessGoal"
                    rows={2}
                    className="portal-textarea"
                    placeholder="Vd: Cải thiện sức bền, giảm mỡ nội tạng, tăng độ dẻo dai..."
                    value={profile.fitnessGoal ?? ''}
                    onChange={(e) => patch({ fitnessGoal: e.target.value })}
                  />
                </div>

                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="healthNotes">Ghi chú sức khỏe &amp; chấn thương</label>
                  <textarea
                    id="healthNotes"
                    rows={2}
                    className="portal-textarea"
                    placeholder="Vd: Tiền sử thoát vị đĩa đệm nhẹ, cần tránh động tác gập lưng quá sâu..."
                    value={profile.healthNotes ?? ''}
                    onChange={(e) => patch({ healthNotes: e.target.value })}
                  />
                </div>
              </>
            )}

            <button type="submit" className="btn-primary" disabled={saving} style={{ marginTop: '8px' }}>
              {saving ? (
                <>
                  <span className="spinner" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                'Lưu hồ sơ'
              )}
            </button>
          </form>
        </div>

        {/* Cột 2: Lịch sử chỉ số sức khỏe - Chỉ hiển thị cho Hội viên (MEMBER) */}
        {isMember && (
          <div className="portal-card">
            <div className="portal-card-header">
              <div>
                <h2 className="portal-card-title">Chỉ số sức khỏe</h2>
              </div>
              <span className="badge badge-info">{metrics.length} bản ghi</span>
            </div>

            {editingMetricId && (
              <div className="profile-metric-editing-bar">
                <span>
                  Đang sửa chỉ số <strong>#{editingMetricId}</strong> ({METRIC_LABELS[metric.metricName] ?? metric.metricName})
                </span>
                <button type="button" className="btn-secondary btn-sm" onClick={handleCancelEdit}>
                  Hủy sửa
                </button>
              </div>
            )}

            <form onSubmit={handleMetricSubmit} className="profile-metric-form">
              <div className="profile-metric-form__type">
                <label className="portal-label" htmlFor="health-metric-name">Chỉ số</label>
                <Select
                  id="health-metric-name"
                  className="portal-select"
                  required
                  value={metric.metricName}
                  aria-label="Chọn chỉ số"
                  onChange={(e) => {
                    const name = e.target.value;
                    setMetric({
                      ...metric,
                      metricName: name,
                      unit: DEFAULT_UNITS[name] ?? metric.unit,
                    });
                  }}
                >
                  <option value="">Chọn chỉ số</option>
                  {Object.entries(METRIC_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="portal-label" htmlFor="health-metric-value">Giá trị</label>
                <input
                  id="health-metric-value"
                  className="portal-input"
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Giá trị"
                  value={metric.metricValue}
                  onChange={(e) => setMetric({ ...metric, metricValue: e.target.value })}
                />
              </div>
              <div>
                <label className="portal-label" htmlFor="health-metric-unit">Đơn vị</label>
                <input
                  id="health-metric-unit"
                  className="portal-input"
                  placeholder="Đơn vị"
                  value={metric.unit}
                  onChange={(e) => setMetric({ ...metric, unit: e.target.value })}
                />
              </div>
              <div className="profile-metric-form-btns">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submittingMetric}
                  title={editingMetricId ? 'Lưu cập nhật chỉ số' : 'Thêm chỉ số'}
                >
                  {submittingMetric ? (
                    <>
                      <span className="spinner" />
                      <span>{editingMetricId ? 'Đang cập nhật...' : 'Đang thêm...'}</span>
                    </>
                  ) : editingMetricId ? (
                    'Lưu cập nhật'
                  ) : (
                    'Thêm'
                  )}
                </button>
                {editingMetricId && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleCancelEdit}
                    disabled={submittingMetric}
                  >
                    Hủy
                  </button>
                )}
              </div>
            </form>

            {metrics.length === 0 ? (
              <div className="portal-state" style={{ minHeight: '140px', padding: '24px 16px' }}>
                <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>Chưa có chỉ số nào được ghi nhận.</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>
                  Chọn chỉ số ở biểu mẫu trên và nhấn "Thêm" để bắt đầu theo dõi.
                </p>
              </div>
            ) : (
              <div className="profile-metric-table-container">
                <table className="profile-metric-table">
                  <thead>
                    <tr>
                      <th style={{ width: '24%' }}>Ngày ghi</th>
                      <th style={{ width: '28%' }}>Chỉ số</th>
                      <th style={{ width: '18%' }}>Giá trị</th>
                      <th style={{ width: '30%', textAlign: 'right', whiteSpace: 'nowrap' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map((m) => (
                      <tr key={m.id}>
                        <td style={{ fontWeight: 600 }}>{formatCenterDate(m.recordedAt)}</td>
                        <td>{METRIC_LABELS[m.metricName] ?? m.metricName}</td>
                        <td>
                          <strong>{m.metricValue}</strong> <span className="muted">{m.unit ?? ''}</span>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div className="profile-metric-actions">
                            <button
                              type="button"
                              className="btn-metric-action btn-metric-edit"
                              onClick={() => handleEditClick(m)}
                              title={`Sửa chỉ số ${METRIC_LABELS[m.metricName] ?? m.metricName}`}
                              disabled={submittingMetric || deletingMetricId === m.id}
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              className="btn-metric-action btn-metric-delete"
                              onClick={() => handleDeleteMetric(m.id)}
                              title={`Xóa chỉ số ${METRIC_LABELS[m.metricName] ?? m.metricName}`}
                              disabled={submittingMetric || deletingMetricId === m.id}
                            >
                              {deletingMetricId === m.id ? '...' : 'Xóa'}
                            </button>
                          </div>
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
      {confirmDialog}
    </div>
  );
}
