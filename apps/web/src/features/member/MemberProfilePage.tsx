import { Select } from '../../shared/ui/Select';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as profileApi from './profileApi';
import { getProfile, updateProfile, uploadAvatar, type Profile } from './profileApi';
import { getCurrentUser } from '../../shared/api/client';
import { errorMessage } from '../../shared/lib/errorMessage';
import { notify } from '../../shared/lib/portalNotices';
import { PageHeader } from '../../shared/ui/PageHeader';

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MIN_AVATAR_DIMENSION = 100;
const MAX_AVATAR_DIMENSION = 4096;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Không thể đọc dữ liệu ảnh.'));
    };
    reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh.'));
    reader.readAsDataURL(file);
  });
}

function validateAndProcessImage(dataUrl: string, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (
        width < MIN_AVATAR_DIMENSION ||
        height < MIN_AVATAR_DIMENSION ||
        width > MAX_AVATAR_DIMENSION ||
        height > MAX_AVATAR_DIMENSION
      ) {
        reject(new Error(`Kích thước ảnh phải từ ${MIN_AVATAR_DIMENSION}x${MIN_AVATAR_DIMENSION} đến ${MAX_AVATAR_DIMENSION}x${MAX_AVATAR_DIMENSION} pixel.`));
        return;
      }
      try {
        const maxSide = 512;
        if (width > maxSide || height > maxSide) {
          const scale = Math.min(maxSide / width, maxSide / height);
          const targetW = Math.max(1, Math.round(width * scale));
          const targetH = Math.max(1, Math.round(height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, targetW, targetH);
            const outType = ALLOWED_AVATAR_TYPES.includes(mimeType) ? mimeType : 'image/jpeg';
            const compressed = canvas.toDataURL(outType, 0.88);
            if (compressed && compressed.startsWith('data:image/')) {
              resolve(compressed);
              return;
            }
          }
        }
      } catch {
        // Fallback to original dataUrl if canvas is unsupported in test environment
      }
      resolve(dataUrl);
    };
    img.onerror = () => reject(new Error('Tệp ảnh bị hỏng hoặc không hợp lệ.'));
    img.src = dataUrl;
  });
}

export function MemberProfilePage() {
  const currentUser = getCurrentUser();
  const isMember = currentUser?.role === 'MEMBER';
  const isCoach = currentUser?.role === 'COACH';
  const isStaff = currentUser?.role === 'STAFF';
  const roleName = isCoach
    ? 'Huấn luyện viên'
    : isStaff
    ? 'Lễ tân'
    : currentUser?.role === 'MANAGER'
    ? 'Quản lý trung tâm'
    : currentUser?.role === 'ADMIN'
    ? 'Quản trị hệ thống'
    : 'Hội viên';

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !profile || avatarBusy) return;

    setError('');
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setError('Định dạng ảnh không hợp lệ. Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError('Dung lượng ảnh không được vượt quá 2MB.');
      return;
    }

    setAvatarBusy(true);
    try {
      const rawDataUrl = await readFileAsDataUrl(file);
      const validDataUrl = await validateAndProcessImage(rawDataUrl, file.type);
      const updated = await uploadAvatar(validDataUrl);
      setProfile(current => current ? { ...current, avatarUrl: updated.avatarUrl } : updated);
      window.dispatchEvent(new Event('profile-updated'));
      notify('Đã cập nhật ảnh đại diện.', 'success');
    } catch (err) {
      setError(errorMessage(err, 'Không thể tải ảnh đại diện lên.'));
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!profile || avatarBusy) return;
    setError('');
    setAvatarBusy(true);
    try {
      const updated = await uploadAvatar(null);
      setProfile(current => current ? { ...current, avatarUrl: updated.avatarUrl } : updated);
      window.dispatchEvent(new Event('profile-updated'));
      notify('Đã đặt lại ảnh đại diện mặc định.', 'success');
    } catch (err) {
      setError(errorMessage(err, 'Không thể đặt lại ảnh đại diện.'));
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || saving) return;
    setError('');
    setSaving(true);
    try {
      const updated = await updateProfile(profile);
      if (isCoach && typeof profileApi.updateCoachProfile === 'function') {
        await profileApi.updateCoachProfile({
          specialization: profile.specialization ?? null,
          bio: profile.bio ?? null,
          certification: profile.certification ?? null,
        });
      }
      if (isStaff && typeof profileApi.updateReceptionistProfile === 'function') {
        await profileApi.updateReceptionistProfile({
          shift: profile.shift ?? null,
        });
      }
      setProfile({
        ...updated,
        specialization: profile.specialization ?? updated.specialization,
        bio: profile.bio ?? updated.bio,
        certification: profile.certification ?? updated.certification,
        shift: profile.shift ?? updated.shift,
      });
      window.dispatchEvent(new Event('profile-updated'));
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

          {/* Khu vực Ảnh đại diện */}
          <div
            className="profile-avatar-section"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 20,
              padding: '16px 20px',
              marginBottom: 22,
              borderRadius: 16,
              background: 'var(--portal-raised, #303030)',
              border: '1px solid var(--portal-border, #ffffff1a)',
            }}
          >
            <div
              className="portal-avatar"
              style={{
                width: 72,
                height: 72,
                flex: '0 0 72px',
                fontSize: 22,
                overflow: 'hidden',
              }}
            >
              <img
                src={profile.avatarUrl || '/images/default-avatar.png'}
                alt="Ảnh đại diện hiện tại"
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.src.endsWith('/images/default-avatar.png')) {
                    target.src = '/images/default-avatar.png';
                  }
                }}
              />
            </div>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Ảnh đại diện tài khoản</div>
              <input
                ref={fileInputRef}
                id="avatar-file-input"
                data-testid="avatar-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => void handleAvatarFileChange(e)}
                style={{ display: 'none' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={avatarBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {avatarBusy ? 'Đang xử lý…' : 'Tải ảnh đại diện lên'}
                </button>
                {profile.avatarUrl && profile.avatarUrl !== '/images/default-avatar.png' && (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={avatarBusy}
                    onClick={() => void handleRemoveAvatar()}
                  >
                    Đặt lại ảnh mặc định
                  </button>
                )}
              </div>
            </div>
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
                  maxLength={100}
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
                  maxLength={20}
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
                maxLength={255}
                placeholder="Vd: 123 Lê Duẩn, Quận 1, TP. HCM"
                value={profile.address ?? ''}
                onChange={(e) => patch({ address: e.target.value })}
              />
            </div>

            {/* Các trường chuyên môn dành cho Huấn luyện viên (COACH) */}
            {isCoach && (
              <>
                <div className="grid-2">
                  <div className="portal-form-group">
                    <label className="portal-label" htmlFor="specialization">Chuyên môn</label>
                    <input
                      id="specialization"
                      type="text"
                      className="portal-input"
                      maxLength={150}
                      placeholder="Vd: Yoga, Strength & Conditioning, Pilates..."
                      value={profile.specialization ?? ''}
                      onChange={(e) => patch({ specialization: e.target.value })}
                    />
                  </div>
                  <div className="portal-form-group">
                    <label className="portal-label" htmlFor="certification">Chứng chỉ</label>
                    <input
                      id="certification"
                      type="text"
                      className="portal-input"
                      maxLength={255}
                      placeholder="Vd: NASM CPT, RYT-500..."
                      value={profile.certification ?? ''}
                      onChange={(e) => patch({ certification: e.target.value })}
                    />
                  </div>
                </div>
                <div className="portal-form-group">
                  <label className="portal-label" htmlFor="bio">Giới thiệu</label>
                  <textarea
                    id="bio"
                    rows={3}
                    className="portal-textarea"
                    placeholder="Kinh nghiệm huấn luyện và phương pháp giảng dạy..."
                    value={profile.bio ?? ''}
                    onChange={(e) => patch({ bio: e.target.value })}
                  />
                </div>
              </>
            )}

            {/* Trường ca trực dành cho Lễ tân (STAFF / RECEPTIONIST) */}
            {isStaff && (
              <div className="portal-form-group">
                <label className="portal-label" htmlFor="shift">Ca trực</label>
                <input
                  id="shift"
                  type="text"
                  className="portal-input"
                  maxLength={50}
                  placeholder="Vd: Ca sáng (06:00 - 14:00)"
                  value={profile.shift ?? ''}
                  onChange={(e) => patch({ shift: e.target.value })}
                />
              </div>
            )}

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
                      maxLength={100}
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
                    maxLength={20}
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
                    maxLength={255}
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
