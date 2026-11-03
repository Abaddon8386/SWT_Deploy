import { Select } from '../../shared/ui/Select';
import React, { useCallback, useEffect, useState } from 'react';
import {
  getProfile,
  updateProfile,
  type Profile,
} from './profileApi';
import { getCurrentUser } from '../../shared/api/client';
import { errorMessage } from '../../shared/lib/errorMessage';
import { notify } from '../../shared/lib/portalNotices';
import { PageHeader } from '../../shared/ui/PageHeader';

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const p = await getProfile();
      setProfile(p);
    } catch (err) {
      setError(errorMessage(err, 'Không thể tải hồ sơ.'));
    } finally {
      setLoading(false);
    }
  }, []);

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

  if (loading) {
    return (
      <div className="portal-container" role="status" aria-busy="true">
        <span className="sr-only">Đang tải thông tin hồ sơ...</span>
        <PageHeader eyebrow={isMember ? 'Hội viên' : 'Tài khoản'} title="Hồ sơ cá nhân" />
        <div className="profile-grid profile-grid--single" aria-hidden="true">
          <div className="portal-card">
            <div className="portal-skeleton-line" style={{ width: '45%', height: 22, marginBottom: 20 }} />
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="portal-skeleton-line" style={{ width: '100%', height: 42, marginBottom: 14 }} />
            ))}
          </div>

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
        title="Hồ sơ cá nhân"
      />

      {error && (
        <div role="alert" className="portal-alert">
          <span>{error}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setError('')}>
            Đóng
          </button>
        </div>
      )}

      <div className="profile-grid profile-grid--single">
        {/* Thông tin cá nhân */}
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

      </div>

    </div>
  );
}
