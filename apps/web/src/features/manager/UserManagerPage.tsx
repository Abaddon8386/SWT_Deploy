import { staffTranslation, useStaffI18n, type StaffMessage, staffMessage, staffError as errorMessage, staffNotify as notify } from '../operations/staffI18n';
import { Select } from '../../shared/ui/Select';
import React, { useState, useEffect, useMemo } from 'react';
import {
  userApi,
  UserAccount,
  SystemRole,
  UserGender,
  CORE_ROLES,
  Permission,
} from './userApi';
import { Modal } from '../../shared/ui/Modal';
import { formatCenterDate, formatCenterDateTime } from '../../shared/lib/centerTime';
import { useConfirm } from '../../shared/ui/ConfirmDialog';
import { PageHeader } from '../../shared/ui/PageHeader';
import { ActionMenu } from '../../shared/ui/ActionMenu';

export function UserManagerPage() {
  const { t } = useStaffI18n();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [rolePerms, setRolePerms] = useState<Record<SystemRole, string[]>>({
    ADMIN: [],
    CENTER_MANAGER: [],
    COACH: [],
    RECEPTIONIST: [],
    MEMBER: [],
  });
  const [activeTab, setActiveTab] = useState<'USERS' | 'ROLES'>('USERS');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<StaffMessage | null>(null);
  const [editError, setEditError] = useState<StaffMessage | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'COACH' as SystemRole,
    gender: 'female' as UserGender,
  });

  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    phone?: string;
    password?: string;
    gender?: string;
  }>({});

  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    phone: '',
    role: 'COACH' as SystemRole,
    gender: 'female' as UserGender,
  });
  const [editFieldErrors, setEditFieldErrors] = useState<{
    name?: string;
    phone?: string;
  }>({});

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<StaffMessage>('');
  const [permissions, setPermissions] = useState<Permission[]>([]);

  const [deletingUser, setDeletingUser] = useState<UserAccount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isCleaning, setIsCleaning] = useState(false);
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{ deletedCount: number; message?: string } | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      setLoadError('');
      const [u, r, p] = await Promise.all([
        userApi.getUsers(),
        userApi.getRolePermissions(),
        userApi.getPermissions(),
      ]);
      setUsers(u);
      setRolePerms(r);
      setPermissions(p);
    } catch (err) {
      setLoadError(errorMessage(err, 'Không thể tải dữ liệu.'));
    } finally {
      setLoading(false);
    }
  }

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return users.filter((u) => {
      const matchSearch =
        !term ||
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.phone.includes(term);
      const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [users, searchTerm, roleFilter]);

  async function handleToggleLock(user: UserAccount) {
    const locking = user.status === 'ACTIVE';
    const confirmed = await confirm({
      title: locking ? staffMessage('Khóa tài khoản?', staffTranslation('Khóa tài khoản?')) : staffMessage('Mở khóa tài khoản?', staffTranslation('Mở khóa tài khoản?')),
      message: locking
        ? staffMessage(`"${user.name}" sẽ không thể đăng nhập cho tới khi được mở khóa.`, `"${user.name}" will not be able to sign in until unlocked.`)
        : staffMessage(`"${user.name}" sẽ đăng nhập lại được ngay.`, `"${user.name}" will be able to sign in immediately.`),
      confirmLabel: locking ? staffMessage('Khóa tài khoản', staffTranslation('Khóa tài khoản')) : staffMessage('Mở khóa', staffTranslation('Mở khóa')),
      danger: locking,
    });
    if (!confirmed) return;

    try {
      const updated = await userApi.toggleLockUser(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      notify(
        updated.status === 'ACTIVE'
          ? staffMessage(`Đã mở khóa tài khoản "${user.name}".`, `Unlocked account "${user.name}".`)
          : staffMessage(`Đã khóa tài khoản "${user.name}".`, `Locked account "${user.name}".`),
        'success'
      );
    } catch (err) {
      const msg = errorMessage(err, 'Thao tác thất bại.');
      notify(msg, 'error');
    }
  }

  async function handleConfirmDelete() {
    if (!deletingUser) return;
    setIsDeleting(true);
    try {
      await userApi.deleteUser(deletingUser.id);
      setUsers((prev) => prev.filter((u) => u.id !== deletingUser.id));
      notify(staffMessage(`Đã xóa tài khoản "${deletingUser.name}".`, `Deleted account "${deletingUser.name}".`), 'success');
      setDeletingUser(null);
    } catch (err) {
      const msg = errorMessage(err, 'Không thể xóa tài khoản.');
      notify(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRunCleanup() {
    setIsCleaning(true);
    try {
      const res = await userApi.cleanupInactiveUsers();
      setCleanupResult(res);
      notify(res.message ? new Error(res.message) : staffMessage(`Đã dọn dẹp ${res.deletedCount} tài khoản không hoạt động.`, `Cleaned up ${res.deletedCount} inactive accounts.`), 'success');
      // Refresh user list
      const u = await userApi.getUsers();
      setUsers(u);
    } catch (err) {
      const msg = errorMessage(err, 'Dọn dẹp tài khoản thất bại.');
      notify(msg, 'error');
    } finally {
      setIsCleaning(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();

    const cleanName = formData.name.trim();
    const cleanEmail = formData.email.trim();
    const cleanPhone = formData.phone.trim();

    const errors: { name?: string; email?: string; phone?: string; password?: string; gender?: string } = {};

    if (!cleanName) {
      errors.name = 'Vui lòng nhập họ và tên.';
    } else if (cleanName.length < 2) {
      errors.name = 'Họ và tên quá ngắn (tối thiểu 2 ký tự).';
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (!cleanEmail) {
      errors.email = 'Vui lòng nhập email liên hệ.';
    } else if (cleanEmail.toLowerCase().endsWith('@gmail.co')) {
      errors.email = 'Có vẻ bạn gõ nhầm @gmail.co? Vui lòng sửa thành @gmail.com';
    } else if (!emailRegex.test(cleanEmail)) {
      errors.email = 'Email liên hệ không đúng định dạng (vd: mai@sol-wellness.vn).';
    }

    const phoneRegex = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;
    if (!cleanPhone) {
      errors.phone = 'Vui lòng nhập số điện thoại.';
    } else if (!phoneRegex.test(cleanPhone)) {
      errors.phone = 'Số điện thoại không hợp lệ (Phải là 10 số, vd: 0912345678).';
    }

    if (formData.password.length < 6 || formData.password.length > 50) {
      errors.password = 'Mật khẩu phải từ 6 đến 50 ký tự.';
    }

    if (!formData.gender) {
      errors.gender = 'Vui lòng chọn giới tính.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setCreateError(null);
    setIsCreating(true);

    try {
      const created = await userApi.createUser({
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        password: formData.password,
        role: formData.role,
        gender: formData.gender,
      });
      setUsers((prev) => [created, ...prev]);
      setIsModalOpen(false);
      setFormData({ name: '', email: '', phone: '', password: '', role: 'COACH', gender: 'female' });
      notify(staffMessage(`Đã tạo tài khoản "${created.name}".`, `Created account "${created.name}".`), 'success');
    } catch (err) {
      setCreateError(errorMessage(err, 'Không thể tạo người dùng.'));
    } finally {
      setIsCreating(false);
    }
  }

  function handleOpenEdit(user: UserAccount) {
    setEditError(null);
    setEditingUser(user);
    setEditFormData({
      name: user.name,
      phone: user.phone || '',
      role: user.role,
      gender: user.gender || 'other',
    });
    setEditFieldErrors({});
  }

  async function handleUpdateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;

    const cleanName = editFormData.name.trim();
    const cleanPhone = editFormData.phone.trim();

    const errors: { name?: string; phone?: string } = {};

    if (!cleanName) {
      errors.name = 'Vui lòng nhập họ và tên.';
    } else if (cleanName.length < 2) {
      errors.name = 'Họ và tên quá ngắn (tối thiểu 2 ký tự).';
    }

    const phoneRegex = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;
    if (cleanPhone && !phoneRegex.test(cleanPhone)) {
      errors.phone = 'Số điện thoại không hợp lệ (Phải là 10 số, vd: 0912345678).';
    }

    if (Object.keys(errors).length > 0) {
      setEditFieldErrors(errors);
      return;
    }

    setEditFieldErrors({});
    setEditError(null);
    setIsUpdating(true);

    try {
      const updated = await userApi.updateUser(editingUser.id, {
        name: cleanName,
        phone: cleanPhone || undefined,
        role: editFormData.role,
        gender: editFormData.gender,
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setEditingUser(null);
      notify(staffMessage(`Đã cập nhật tài khoản "${updated.name}".`, `Updated account "${updated.name}".`), 'success');
    } catch (err) {
      setEditError(errorMessage(err, 'Không thể cập nhật tài khoản.'));
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleTogglePermission(role: SystemRole, permId: string) {
    if (role === 'ADMIN') return;

    // Optimistic update
    const previous = rolePerms[role] ?? [];
    const hasPerm = previous.includes(permId);
    const updatedList = hasPerm
      ? previous.filter((id) => id !== permId)
      : [...previous, permId];

    setRolePerms((prev) => ({ ...prev, [role]: updatedList }));

    try {
      await userApi.toggleRolePermission(role, permId);
      notify('Đã cập nhật quyền.', 'success');
    } catch (err) {
      // Revert on error
      setRolePerms((prev) => ({ ...prev, [role]: previous }));
      const msg = errorMessage(err, 'Không thể cập nhật quyền.');
      notify(msg, 'error');
    }
  }

  const getRoleBadge = (role: SystemRole) => {
    switch (role) {
      case 'ADMIN':
        return <span data-i18n-managed className="portal-badge">{t("Quản trị hệ thống")}</span>;
      case 'CENTER_MANAGER':
        return <span data-i18n-managed className="badge badge-warning">{t("Quản lý trung tâm")}</span>;
      case 'COACH':
        return <span data-i18n-managed className="badge badge-info">{t("Huấn luyện viên")}</span>;
      case 'RECEPTIONIST':
        return <span data-i18n-managed className="badge badge-neutral">{t("Lễ tân")}</span>;
      case 'MEMBER':
        return <span data-i18n-managed className="badge">{t("Hội viên")}</span>;
    }
  };

  return (
    <div data-i18n-managed className="portal-container">
      <PageHeader
        eyebrow={t("Quản trị hệ thống")}
        title={t("Tài khoản & phân quyền")}
      />

      {/* Tabs */}
      <div className="portal-tabs">
        <button
          type="button"
          className={`portal-tab ${activeTab === 'USERS' ? 'active' : ''}`}
          onClick={() => setActiveTab('USERS')}
        >
          {t("Danh sách tài khoản (")}{users.length})
        </button>
        <button
          type="button"
          className={`portal-tab ${activeTab === 'ROLES' ? 'active' : ''}`}
          onClick={() => setActiveTab('ROLES')}
        >
          {t("Phân quyền")}</button>
      </div>

      {loadError && (
        <div data-i18n-managed role="alert" className="portal-alert">
          <span>{t(loadError)}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void loadData()}>
            {t("Thử lại")}</button>
        </div>
      )}

      {loading ? (
        <div data-i18n-managed className="portal-card" aria-busy="true">
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="portal-skeleton" style={{ height: 42, borderRadius: 8 }} />
            {[1, 2, 3, 4, 5].map((n) => (
              <div data-i18n-managed key={n} className="portal-skeleton" style={{ height: 52, borderRadius: 8 }} />
            ))}
          </div>
        </div>
      ) : activeTab === 'USERS' ? (
        <div data-i18n-managed>
          {/* Controls / Filter Bar */}
          <div className="portal-toolbar">
            <input
              type="text"
              className="portal-input"
              placeholder={t("Tìm kiếm theo họ tên, email hoặc SĐT...")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Select
              className="portal-select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="ALL">{t("Tất cả vai trò")}</option>
              <option value="CENTER_MANAGER">{t("Quản lý trung tâm")}</option>
              <option value="ADMIN">{t("Quản trị hệ thống")}</option>
              <option value="COACH">{t("Huấn luyện viên")}</option>
              <option value="RECEPTIONIST">{t("Lễ tân")}</option>
              <option value="MEMBER">{t("Hội viên")}</option>
            </Select>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setFieldErrors({});
                setCreateError(null);
                setIsModalOpen(true);
              }}
            >
              {t("Thêm tài khoản")}</button>
            <ActionMenu label={t("Tùy chọn quản trị")}>
              <button
                type="button"
                className="btn-secondary btn-sm"
                title={t("Tài khoản không đăng nhập quá 6 tháng sẽ tự động xóa mềm (ngoại trừ hội viên đang bảo lưu)")}
                onClick={() => {
                  setCleanupResult(null);
                  setShowCleanupModal(true);
                }}
              >
                {t("Quét & Dọn dẹp ngay")}</button>
            </ActionMenu>
          </div>

          {/* User Table */}
          <div className="portal-card portal-card--flush">
            {filteredUsers.length === 0 ? (
              <div data-i18n-managed className="portal-state" style={{ minHeight: '180px' }}>
                <p style={{ margin: 0 }}>
                  {t("Không tìm thấy tài khoản nào phù hợp với bộ lọc hiện tại.")}</p>
                {(searchTerm || roleFilter !== 'ALL') && (
                  <button data-i18n-managed
                    type="button"
                    className="btn-secondary btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      setSearchTerm('');
                      setRoleFilter('ALL');
                    }}
                  >
                    {t("Xóa bộ lọc tìm kiếm")}</button>
                )}
              </div>
            ) : (
              <div data-i18n-managed className="portal-table-wrapper">
                <table className="portal-table">
                  <thead>
                    <tr>
                      <th>{t("Họ và tên")}</th>
                      <th>{t("Giới tính")}</th>
                      <th>{t("Liên hệ")}</th>
                      <th>{t("Vai trò")}</th>
                      <th>{t("Trạng thái")}</th>
                      <th>{t("Đăng nhập / Ngày tạo")}</th>
                      <th className="actions">{t("Thao tác")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr data-i18n-managed key={u.id}>
                        <td>
                          <strong>{u.name}</strong>
                          <div className="muted">ID: {u.id}</div>
                        </td>
                        <td>
                          {u.gender === 'male' ? (
                            <span data-i18n-managed className="badge badge-neutral">{t("Nam")}</span>
                          ) : u.gender === 'female' ? (
                            <span data-i18n-managed className="badge badge-neutral" style={{ color: 'var(--portal-salmon)' }}>{t("Nữ")}</span>
                          ) : (
                            <span data-i18n-managed className="badge badge-neutral">{t("Khác")}</span>
                          )}
                        </td>
                        <td>
                          <div>{u.email}</div>
                          <div className="muted">{u.phone || '—'}</div>
                        </td>
                        <td>{getRoleBadge(u.role)}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                            {u.status === 'ACTIVE' ? (
                              <span data-i18n-managed className="badge badge-success">{t("Đang hoạt động")}</span>
                            ) : (
                              <span data-i18n-managed className="badge badge-warning">{t("Đã khóa")}</span>
                            )}
                            {u.is_frozen && (
                              <span data-i18n-managed
                                className="badge"
                                style={{
                                  background: 'color-mix(in srgb, var(--portal-info) 12%, transparent)',
                                  color: 'var(--portal-info)',
                                  border: '1px solid color-mix(in srgb, var(--portal-info) 30%, transparent)',
                                  fontSize: '0.72rem',
                                }}
                                title={t("Hội viên đang có gói bảo lưu tập (được miễn trừ tự động xóa)")}
                              >
                                {t("Đang bảo lưu tập")}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: '0.85rem' }}>
                            {u.last_login_at ? (
                              <span data-i18n-managed>{t("Đăng nhập: ")}{formatCenterDateTime(u.last_login_at.replace(' ', 'T'))}</span>
                            ) : (
                              <span data-i18n-managed className="muted" style={{ fontStyle: 'italic' }}>{t("Chưa đăng nhập")}</span>
                            )}
                          </div>
                          <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>{t("Tạo: ")}{formatCenterDate(u.created_at)}</div>
                        </td>
                        <td className="actions">
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              title={t("Chỉnh sửa thông tin tài khoản")}
                              onClick={() => handleOpenEdit(u)}
                            >
                              {t("Sửa")}</button>
                            <ActionMenu label={t(`Thao tác khác với ${u.name}`, `More actions for ${u.name}`)}>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              disabled={u.role === 'CENTER_MANAGER'}
                              title={
                                u.role === 'CENTER_MANAGER'
                                  ? t('Không thể khóa tài khoản Quản lý trung tâm')
                                  : u.status === 'ACTIVE'
                                    ? t('Khóa tài khoản')
                                    : t('Mở khóa tài khoản')
                              }
                              onClick={() => handleToggleLock(u)}
                            >
                              {u.status === 'ACTIVE' ? t('Khóa') : t('Kích hoạt')}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              style={{ color: 'var(--portal-danger)', borderColor: 'color-mix(in srgb, var(--portal-danger) 35%, transparent)' }}
                              disabled={u.role === 'CENTER_MANAGER'}
                              title={
                                u.role === 'CENTER_MANAGER'
                                  ? t('Không thể xóa tài khoản Quản lý trung tâm')
                                  : t('Xóa tài khoản')
                              }
                              onClick={() => setDeletingUser(u)}
                            >
                              {t("Xóa")}</button>
                            </ActionMenu>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Matrix Phân quyền RBAC */
        <div data-i18n-managed className="portal-card portal-card--flush">
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--portal-border)' }}>
            <h2 className="portal-card-title">{t("Phân quyền vai trò")}</h2>
          </div>

          <div className="portal-table-wrapper">
            <table className="portal-table">
              <thead>
                <tr>
                  <th style={{ width: '42%' }}>{t("Chức năng")}</th>
                  {CORE_ROLES.map((r) => (
                    <th data-i18n-managed key={r.id} style={{ textAlign: 'center' }}>
                      {t(r.name)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissions.map((perm) => (
                  <tr data-i18n-managed key={perm.id}>
                    <td>
                      <strong>{perm.name}</strong>
                    </td>
                    {CORE_ROLES.map((role) => {
                      const isManager = role.id === 'ADMIN';
                      const isChecked = rolePerms[role.id]?.includes(perm.id) ?? false;

                      return (
                        <td data-i18n-managed key={role.id} style={{ textAlign: 'center' }}>
                          <input data-i18n-managed
                            type="checkbox"
                            checked={isChecked}
                            disabled={isManager}
                            title={
                              isManager
                                ? t('Quyền quản trị hệ thống')
                                : t('Nhấp để gán hoặc hủy quyền')
                            }
                            onChange={() => handleTogglePermission(role.id, perm.id)}
                            style={{
                              width: '18px',
                              height: '18px',
                              accentColor: 'var(--portal-salmon)',
                              cursor: isManager ? 'not-allowed' : 'pointer',
                              opacity: isManager ? 0.7 : 1,
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Thêm tài khoản mới */}
      {isModalOpen && (
        <Modal
          title={t("Thêm tài khoản")}
          onClose={() => {
            if (!isCreating) {
              setIsModalOpen(false);
              setFieldErrors({});
            }
          }}
        >
          <form onSubmit={handleCreateUser} style={{ display: 'grid', gap: 14 }} noValidate>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="user-name">{t("Họ và tên *")}</label>
              <input
                id="user-name"
                type="text"
                className="portal-input"
                autoFocus
                placeholder={t("Vd: Nguyễn Thị Mai")}
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                }}
              />
              {fieldErrors.name && (
                <div data-i18n-managed className="form-error">
                  {t(fieldErrors.name)}
                </div>
              )}
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="user-email">Email *</label>
              <input
                id="user-email"
                type="email"
                className="portal-input"
                placeholder="mai.nguyen@sol-wellness.vn"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }}
              />
              {fieldErrors.email && (
                <div data-i18n-managed className="form-error">
                  {t(fieldErrors.email)}
                </div>
              )}
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="user-phone">{t("Số điện thoại *")}</label>
              <input
                id="user-phone"
                type="tel"
                className="portal-input"
                placeholder="0912345678"
                maxLength={11}
                value={formData.phone}
                onChange={(e) => {
                  const onlyNums = e.target.value.replace(/[^0-9]/g, '');
                  setFormData({ ...formData, phone: onlyNums });
                  if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                }}
              />
              {fieldErrors.phone && (
                <div data-i18n-managed className="form-error">
                  {t(fieldErrors.phone)}
                </div>
              )}
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="user-pass">{t("Mật khẩu khởi tạo *")}</label>
              <input
                id="user-pass"
                type="password"
                className="portal-input"
                autoComplete="new-password"
                placeholder={t("Tối thiểu 6 ký tự")}
                value={formData.password}
                onChange={(e) => {
                  setFormData({ ...formData, password: e.target.value });
                  if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }}
              />
              {fieldErrors.password && (
                <div data-i18n-managed className="form-error">
                  {t(fieldErrors.password)}
                </div>
              )}
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="user-gender">{t("Giới tính *")}</label>
              <Select
                id="user-gender"
                className="portal-select"
                value={formData.gender}
                onChange={(e) => {
                  setFormData({ ...formData, gender: e.target.value as UserGender });
                  if (fieldErrors.gender) setFieldErrors((prev) => ({ ...prev, gender: undefined }));
                }}
              >
                <option value="male">{t("Nam (Male)")}</option>
                <option value="female">{t("Nữ (Female)")}</option>
                <option value="other">{t("Khác (Other)")}</option>
              </Select>
              {fieldErrors.gender && (
                <div data-i18n-managed className="form-error">
                  {t(fieldErrors.gender)}
                </div>
              )}
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="user-role">{t("Vai trò *")}</label>
              <Select
                id="user-role"
                className="portal-select"
                value={formData.role}
                onChange={(e) =>
                  setFormData({ ...formData, role: e.target.value as SystemRole })
                }
              >
                <option value="COACH">{t("Huấn luyện viên (Coach)")}</option>
                <option value="RECEPTIONIST">{t("Lễ tân (Receptionist)")}</option>
                <option value="MEMBER">{t("Hội viên (Member)")}</option>
                <option value="CENTER_MANAGER">{t("Quản lý trung tâm (Center Manager)")}</option>
                <option value="ADMIN">{t("Quản trị hệ thống (Admin)")}</option>
              </Select>
            </div>

            {createError && <p className="form-error" role="alert">{t(createError)}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={isCreating}
                onClick={() => {
                  setIsModalOpen(false);
                  setFieldErrors({});
                }}
              >
                {t("Hủy")}</button>
              <button type="submit" className="btn-primary" disabled={isCreating}>
                {isCreating ? (
                  <>
                    <span data-i18n-managed className="spinner" />
                    <span data-i18n-managed>{t("Đang tạo...")}</span>
                  </>
                ) : (
                  t('Tạo tài khoản')
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingUser && (
        <Modal
          title={t(`Chỉnh sửa tài khoản — ${editingUser.name}`, `Edit account — ${editingUser.name}`)}
          onClose={() => {
            if (!isUpdating) {
              setEditingUser(null);
              setEditFieldErrors({});
            }
          }}
        >
          <form onSubmit={handleUpdateUser} style={{ display: 'grid', gap: 14 }} noValidate>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="edit-user-email">{t("Email (không thể thay đổi)")}</label>
              <input
                id="edit-user-email"
                type="email"
                className="portal-input"
                disabled
                readOnly
                value={editingUser.email}
              />
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="edit-user-name">{t("Họ và tên *")}</label>
              <input
                id="edit-user-name"
                type="text"
                className="portal-input"
                autoFocus
                placeholder={t("Vd: Nguyễn Thị Mai")}
                value={editFormData.name}
                onChange={(e) => {
                  setEditFormData({ ...editFormData, name: e.target.value });
                  if (editFieldErrors.name) setEditFieldErrors((prev) => ({ ...prev, name: undefined }));
                }}
              />
              {editFieldErrors.name && (
                <div data-i18n-managed className="form-error">
                  {t(editFieldErrors.name)}
                </div>
              )}
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="edit-user-phone">{t("Số điện thoại")}</label>
              <input
                id="edit-user-phone"
                type="tel"
                className="portal-input"
                placeholder="0912345678"
                maxLength={11}
                value={editFormData.phone}
                onChange={(e) => {
                  const onlyNums = e.target.value.replace(/[^0-9]/g, '');
                  setEditFormData({ ...editFormData, phone: onlyNums });
                  if (editFieldErrors.phone) setEditFieldErrors((prev) => ({ ...prev, phone: undefined }));
                }}
              />
              {editFieldErrors.phone && (
                <div data-i18n-managed className="form-error">
                  {t(editFieldErrors.phone)}
                </div>
              )}
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="edit-user-gender">{t("Giới tính *")}</label>
              <Select
                id="edit-user-gender"
                className="portal-select"
                value={editFormData.gender}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, gender: e.target.value as UserGender })
                }
              >
                <option value="male">{t("Nam (Male)")}</option>
                <option value="female">{t("Nữ (Female)")}</option>
                <option value="other">{t("Khác (Other)")}</option>
              </Select>
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="edit-user-role">{t("Vai trò *")}</label>
              <Select
                id="edit-user-role"
                className="portal-select"
                value={editFormData.role}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, role: e.target.value as SystemRole })
                }
              >
                <option value="COACH">{t("Huấn luyện viên (Coach)")}</option>
                <option value="RECEPTIONIST">{t("Lễ tân (Receptionist)")}</option>
                <option value="MEMBER">{t("Hội viên (Member)")}</option>
                <option value="CENTER_MANAGER">{t("Quản lý trung tâm (Center Manager)")}</option>
                <option value="ADMIN">{t("Quản trị hệ thống (Admin)")}</option>
              </Select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              {editError && <p className="form-error" role="alert" style={{ flexBasis: '100%' }}>{t(editError)}</p>}
              <button
                type="button"
                className="btn-secondary"
                disabled={isUpdating}
                onClick={() => {
                  setEditingUser(null);
                  setEditFieldErrors({});
                }}
              >
                {t("Hủy")}</button>
              <button type="submit" className="btn-primary" disabled={isUpdating}>
                {isUpdating ? (
                  <>
                    <span data-i18n-managed className="spinner" />
                    <span data-i18n-managed>{t("Đang lưu...")}</span>
                  </>
                ) : (
                  t('Lưu thay đổi')
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Xác nhận xóa tài khoản */}
      {deletingUser && (
        <Modal
          title={t("Xác nhận xóa tài khoản")}
          onClose={() => {
            if (!isDeleting) setDeletingUser(null);
          }}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              {t("Bạn có chắc chắn muốn xóa tài khoản của ")}<strong>{deletingUser.name}</strong> ({deletingUser.email})?
            </p>
            {deletingUser.is_frozen && (
              <div data-i18n-managed
                style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  background: 'color-mix(in srgb, var(--portal-info) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--portal-info) 25%, transparent)',
                  fontSize: '0.85rem',
                  color: 'var(--portal-info)',
                }}
              >
                {t("Tài khoản này hiện đang có gói tập bảo lưu. Vui lòng cân nhắc trước khi xóa thủ công.")}</div>
            )}
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 6,
                background: 'color-mix(in srgb, var(--portal-danger) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--portal-danger) 20%, transparent)',
                fontSize: '0.85rem',
                color: 'var(--portal-danger)',
              }}
            >
              {t("Lưu ý: Thao tác này sẽ xóa mềm tài khoản khỏi hệ thống và vô hiệu hóa quyền truy cập vĩnh viễn.")}</div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={isDeleting}
                onClick={() => setDeletingUser(null)}
              >
                {t("Hủy")}</button>
              <button
                type="button"
                className="btn-danger"
                disabled={isDeleting}
                onClick={() => void handleConfirmDelete()}
              >
                {isDeleting ? t('Đang xóa...') : t('Xác nhận xóa')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Quét & dọn dẹp tài khoản > 6 tháng */}
      {showCleanupModal && (
        <Modal
          title={t("Quét & dọn dẹp tài khoản quá 6 tháng")}
          onClose={() => {
            if (!isCleaning) {
              setShowCleanupModal(false);
              setCleanupResult(null);
            }
          }}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              {t("Hệ thống sẽ quét toàn bộ tài khoản và tự động xóa mềm những tài khoản thỏa mãn các điều kiện:")}</p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.88rem', display: 'grid', gap: 6 }}>
              <li>{t("Không đăng nhập trong vòng ")}<strong>{t("6 tháng qua")}</strong> {t(" (hoặc tạo quá 6 tháng nhưng chưa từng đăng nhập).")}</li>
              <li><strong>{t("Không")}</strong> {t(" xóa tài khoản Quản lý trung tâm (Center Manager).")}</li>
              <li><strong>{t("Không")}</strong> {t(" xóa tài khoản hội viên đang có gói dịch vụ trong trạng thái ")}<strong>{t("bảo lưu tập (frozen)")}</strong>.</li>
            </ul>

            {cleanupResult && (
              <div data-i18n-managed
                style={{
                  padding: '12px 14px',
                  borderRadius: 6,
                  background: 'color-mix(in srgb, var(--portal-success) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--portal-success) 30%, transparent)',
                  fontSize: '0.88rem',
                  color: 'var(--portal-success)',
                }}
              >
                {cleanupResult.message || t(`Đã dọn dẹp thành công ${cleanupResult.deletedCount} tài khoản không hoạt động.`, `Cleanup completed successfully ${cleanupResult.deletedCount} inactive accounts.`)}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={isCleaning}
                onClick={() => {
                  setShowCleanupModal(false);
                  setCleanupResult(null);
                }}
              >
                {cleanupResult ? t('Đóng') : t('Hủy')}
              </button>
              {!cleanupResult && (
                <button data-i18n-managed
                  type="button"
                  className="btn-primary"
                  disabled={isCleaning}
                  onClick={() => void handleRunCleanup()}
                >
                  {isCleaning ? (
                    <>
                      <span data-i18n-managed className="spinner" />
                      <span data-i18n-managed>{t("Đang quét & dọn dẹp...")}</span>
                    </>
                  ) : (
                    t('Bắt đầu quét & dọn dẹp')
                  )}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
      {confirmDialog}
    </div>
  );
}
