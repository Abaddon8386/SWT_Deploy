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
import { toast } from '../../shared/ui/toast';
import { PageHeader } from '../../shared/ui/PageHeader';
import { ActionMenu } from '../../shared/ui/ActionMenu';

export function UserManagerPage() {
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
  const [loadError, setLoadError] = useState('');
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
      setLoadError(err instanceof Error ? err.message : 'Không thể tải dữ liệu.');
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
    const actionName = user.status === 'ACTIVE' ? 'khóa tài khoản' : 'mở khóa tài khoản';
    if (!window.confirm(`Bạn có chắc muốn ${actionName} "${user.name}"?`)) return;

    try {
      const updated = await userApi.toggleLockUser(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      toast(
        updated.status === 'ACTIVE'
          ? `Đã mở khóa tài khoản "${user.name}".`
          : `Đã khóa tài khoản "${user.name}".`,
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Thao tác thất bại.';
      toast(msg, 'error');
    }
  }

  async function handleConfirmDelete() {
    if (!deletingUser) return;
    setIsDeleting(true);
    try {
      await userApi.deleteUser(deletingUser.id);
      setUsers((prev) => prev.filter((u) => u.id !== deletingUser.id));
      toast(`Đã xóa tài khoản "${deletingUser.name}" thành công!`, 'success');
      setDeletingUser(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể xóa tài khoản.';
      toast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRunCleanup() {
    setIsCleaning(true);
    try {
      const res = await userApi.cleanupInactiveUsers();
      setCleanupResult(res);
      toast(res.message || `Đã dọn dẹp ${res.deletedCount} tài khoản không hoạt động.`, 'success');
      // Refresh user list
      const u = await userApi.getUsers();
      setUsers(u);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Dọn dẹp tài khoản thất bại.';
      toast(msg, 'error');
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
      toast(`Đã tạo tài khoản "${created.name}" thành công!`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể tạo người dùng.';
      toast(msg, 'error');
    } finally {
      setIsCreating(false);
    }
  }

  function handleOpenEdit(user: UserAccount) {
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
      toast(`Đã cập nhật tài khoản "${updated.name}" thành công!`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể cập nhật tài khoản.';
      toast(msg, 'error');
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
      toast('Đã cập nhật quyền thành công!', 'success');
    } catch (err) {
      // Revert on error
      setRolePerms((prev) => ({ ...prev, [role]: previous }));
      const msg = err instanceof Error ? err.message : 'Không thể cập nhật quyền.';
      toast(msg, 'error');
    }
  }

  const getRoleBadge = (role: SystemRole) => {
    switch (role) {
      case 'ADMIN':
        return <span className="portal-badge">Quản trị hệ thống</span>;
      case 'CENTER_MANAGER':
        return <span className="badge badge-warning">Quản lý trung tâm</span>;
      case 'COACH':
        return <span className="badge badge-info">Huấn luyện viên</span>;
      case 'RECEPTIONIST':
        return <span className="badge badge-neutral">Lễ tân</span>;
      case 'MEMBER':
        return <span className="badge">Hội viên</span>;
    }
  };

  return (
    <div className="portal-container">
      <PageHeader
        eyebrow="Quản lý"
        title="Tài khoản & phân quyền"
      />

      {/* Tabs */}
      <div className="portal-tabs">
        <button
          type="button"
          className={`portal-tab ${activeTab === 'USERS' ? 'active' : ''}`}
          onClick={() => setActiveTab('USERS')}
        >
          Danh sách tài khoản ({users.length})
        </button>
        <button
          type="button"
          className={`portal-tab ${activeTab === 'ROLES' ? 'active' : ''}`}
          onClick={() => setActiveTab('ROLES')}
        >
          Phân quyền
        </button>
      </div>

      {loadError && (
        <div role="alert" className="portal-alert">
          <span>{loadError}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => void loadData()}>
            Thử lại
          </button>
        </div>
      )}

      {loading ? (
        <div className="portal-card" aria-busy="true">
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="portal-skeleton" style={{ height: 42, borderRadius: 8 }} />
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="portal-skeleton" style={{ height: 52, borderRadius: 8 }} />
            ))}
          </div>
        </div>
      ) : activeTab === 'USERS' ? (
        <div>
          {/* Controls / Filter Bar */}
          <div className="portal-toolbar">
            <input
              type="text"
              className="portal-input"
              placeholder="Tìm kiếm theo họ tên, email hoặc SĐT..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Select
              className="portal-select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="ALL">Tất cả vai trò</option>
              <option value="CENTER_MANAGER">Quản lý trung tâm</option>
              <option value="ADMIN">Quản trị hệ thống</option>
              <option value="COACH">Huấn luyện viên</option>
              <option value="RECEPTIONIST">Lễ tân</option>
              <option value="MEMBER">Hội viên</option>
            </Select>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setFieldErrors({});
                setIsModalOpen(true);
              }}
            >
              + Thêm tài khoản
            </button>
            <ActionMenu label="Tùy chọn quản trị">
              <button
                type="button"
                className="btn-secondary btn-sm"
                title="Tài khoản không đăng nhập quá 6 tháng sẽ tự động xóa mềm (ngoại trừ hội viên đang bảo lưu)"
                onClick={() => {
                  setCleanupResult(null);
                  setShowCleanupModal(true);
                }}
              >
                Quét & Dọn dẹp ngay
              </button>
            </ActionMenu>
          </div>

          {/* User Table */}
          <div className="portal-card portal-card--flush">
            {filteredUsers.length === 0 ? (
              <div className="portal-state" style={{ minHeight: '180px' }}>
                <p style={{ margin: 0 }}>
                  Không tìm thấy tài khoản nào phù hợp với bộ lọc hiện tại.
                </p>
                {(searchTerm || roleFilter !== 'ALL') && (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      setSearchTerm('');
                      setRoleFilter('ALL');
                    }}
                  >
                    Xóa bộ lọc tìm kiếm
                  </button>
                )}
              </div>
            ) : (
              <div className="portal-table-wrapper">
                <table className="portal-table">
                  <thead>
                    <tr>
                      <th>Họ và tên</th>
                      <th>Giới tính</th>
                      <th>Liên hệ</th>
                      <th>Vai trò</th>
                      <th>Trạng thái</th>
                      <th>Đăng nhập / Ngày tạo</th>
                      <th className="actions">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.name}</strong>
                          <div className="muted">ID: {u.id}</div>
                        </td>
                        <td>
                          {u.gender === 'male' ? (
                            <span className="badge badge-neutral">Nam</span>
                          ) : u.gender === 'female' ? (
                            <span className="badge badge-neutral" style={{ color: 'var(--portal-salmon)' }}>Nữ</span>
                          ) : (
                            <span className="badge badge-neutral">Khác</span>
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
                              <span className="badge badge-success">● Đang hoạt động</span>
                            ) : (
                              <span className="badge badge-warning">● Đã khóa</span>
                            )}
                            {u.is_frozen && (
                              <span
                                className="badge"
                                style={{
                                  background: 'rgba(14, 165, 233, 0.12)',
                                  color: '#0284c7',
                                  border: '1px solid rgba(14, 165, 233, 0.3)',
                                  fontSize: '0.72rem',
                                }}
                                title="Hội viên đang có gói bảo lưu tập (được miễn trừ tự động xóa)"
                              >
                                ❄️ Đang bảo lưu tập
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: '0.85rem' }}>
                            {u.last_login_at ? (
                              <span>ĐN: {u.last_login_at.split('T')[0]}</span>
                            ) : (
                              <span className="muted" style={{ fontStyle: 'italic' }}>Chưa đăng nhập</span>
                            )}
                          </div>
                          <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>Tạo: {u.created_at || '—'}</div>
                        </td>
                        <td className="actions">
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              title="Chỉnh sửa thông tin tài khoản"
                              onClick={() => handleOpenEdit(u)}
                            >
                              Sửa
                            </button>
                            <ActionMenu label={`Thao tác khác với ${u.name}`}>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              disabled={u.role === 'CENTER_MANAGER'}
                              title={
                                u.role === 'CENTER_MANAGER'
                                  ? 'Không thể khóa tài khoản Quản lý trung tâm'
                                  : u.status === 'ACTIVE'
                                    ? 'Khóa tài khoản'
                                    : 'Mở khóa tài khoản'
                              }
                              onClick={() => handleToggleLock(u)}
                            >
                              {u.status === 'ACTIVE' ? 'Khóa' : 'Kích hoạt'}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              style={{ color: 'var(--portal-danger)', borderColor: 'rgba(239, 68, 68, 0.35)' }}
                              disabled={u.role === 'CENTER_MANAGER'}
                              title={
                                u.role === 'CENTER_MANAGER'
                                  ? 'Không thể xóa tài khoản Quản lý trung tâm'
                                  : 'Xóa tài khoản'
                              }
                              onClick={() => setDeletingUser(u)}
                            >
                              Xóa
                            </button>
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
        <div className="portal-card portal-card--flush">
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--portal-border)' }}>
            <h2 className="portal-card-title">Phân quyền vai trò</h2>
          </div>

          <div className="portal-table-wrapper">
            <table className="portal-table">
              <thead>
                <tr>
                  <th style={{ width: '42%' }}>Chức năng</th>
                  {CORE_ROLES.map((r) => (
                    <th key={r.id} style={{ textAlign: 'center' }}>
                      {r.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissions.map((perm) => (
                  <tr key={perm.id}>
                    <td>
                      <strong>{perm.name}</strong>
                    </td>
                    {CORE_ROLES.map((role) => {
                      const isManager = role.id === 'ADMIN';
                      const isChecked = rolePerms[role.id]?.includes(perm.id) ?? false;

                      return (
                        <td key={role.id} style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isManager}
                            title={
                              isManager
                                ? 'Quyền quản trị hệ thống'
                                : 'Nhấp để gán hoặc hủy quyền'
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
          title="Thêm tài khoản"
          onClose={() => {
            if (!isCreating) {
              setIsModalOpen(false);
              setFieldErrors({});
            }
          }}
        >
          <form onSubmit={handleCreateUser} style={{ display: 'grid', gap: 14 }} noValidate>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="user-name">Họ và tên *</label>
              <input
                id="user-name"
                type="text"
                className="portal-input"
                autoFocus
                placeholder="Vd: Nguyễn Thị Mai"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                }}
              />
              {fieldErrors.name && (
                <div style={{ color: 'var(--portal-danger, #fca5a5)', fontSize: '0.78rem', marginTop: 4 }}>
                  {fieldErrors.name}
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
                <div style={{ color: 'var(--portal-danger, #fca5a5)', fontSize: '0.78rem', marginTop: 4 }}>
                  {fieldErrors.email}
                </div>
              )}
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="user-phone">Số điện thoại *</label>
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
                <div style={{ color: 'var(--portal-danger, #fca5a5)', fontSize: '0.78rem', marginTop: 4 }}>
                  {fieldErrors.phone}
                </div>
              )}
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="user-pass">Mật khẩu khởi tạo *</label>
              <input
                id="user-pass"
                type="password"
                className="portal-input"
                autoComplete="new-password"
                placeholder="Tối thiểu 6 ký tự"
                value={formData.password}
                onChange={(e) => {
                  setFormData({ ...formData, password: e.target.value });
                  if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }}
              />
              {fieldErrors.password && (
                <div style={{ color: 'var(--portal-danger, #fca5a5)', fontSize: '0.78rem', marginTop: 4 }}>
                  {fieldErrors.password}
                </div>
              )}
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="user-gender">Giới tính *</label>
              <Select
                id="user-gender"
                className="portal-select"
                value={formData.gender}
                onChange={(e) => {
                  setFormData({ ...formData, gender: e.target.value as UserGender });
                  if (fieldErrors.gender) setFieldErrors((prev) => ({ ...prev, gender: undefined }));
                }}
              >
                <option value="male">Nam (Male)</option>
                <option value="female">Nữ (Female)</option>
                <option value="other">Khác (Other)</option>
              </Select>
              {fieldErrors.gender && (
                <div style={{ color: 'var(--portal-danger, #fca5a5)', fontSize: '0.78rem', marginTop: 4 }}>
                  {fieldErrors.gender}
                </div>
              )}
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="user-role">Vai trò *</label>
              <Select
                id="user-role"
                className="portal-select"
                value={formData.role}
                onChange={(e) =>
                  setFormData({ ...formData, role: e.target.value as SystemRole })
                }
              >
                <option value="COACH">Huấn luyện viên (Coach)</option>
                <option value="RECEPTIONIST">Lễ tân (Receptionist)</option>
                <option value="MEMBER">Hội viên (Member)</option>
                <option value="CENTER_MANAGER">Quản lý trung tâm (Center Manager)</option>
                <option value="ADMIN">Quản trị hệ thống (Admin)</option>
              </Select>
            </div>

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
                Hủy
              </button>
              <button type="submit" className="btn-primary" disabled={isCreating}>
                {isCreating ? (
                  <>
                    <span className="spinner" />
                    <span>Đang tạo...</span>
                  </>
                ) : (
                  'Tạo tài khoản'
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingUser && (
        <Modal
          title={`Chỉnh sửa tài khoản — ${editingUser.name}`}
          onClose={() => {
            if (!isUpdating) {
              setEditingUser(null);
              setEditFieldErrors({});
            }
          }}
        >
          <form onSubmit={handleUpdateUser} style={{ display: 'grid', gap: 14 }} noValidate>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="edit-user-email">Email (không thể thay đổi)</label>
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
              <label className="portal-label" htmlFor="edit-user-name">Họ và tên *</label>
              <input
                id="edit-user-name"
                type="text"
                className="portal-input"
                autoFocus
                placeholder="Vd: Nguyễn Thị Mai"
                value={editFormData.name}
                onChange={(e) => {
                  setEditFormData({ ...editFormData, name: e.target.value });
                  if (editFieldErrors.name) setEditFieldErrors((prev) => ({ ...prev, name: undefined }));
                }}
              />
              {editFieldErrors.name && (
                <div style={{ color: 'var(--portal-danger, #fca5a5)', fontSize: '0.78rem', marginTop: 4 }}>
                  {editFieldErrors.name}
                </div>
              )}
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="edit-user-phone">Số điện thoại</label>
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
                <div style={{ color: 'var(--portal-danger, #fca5a5)', fontSize: '0.78rem', marginTop: 4 }}>
                  {editFieldErrors.phone}
                </div>
              )}
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="edit-user-gender">Giới tính *</label>
              <Select
                id="edit-user-gender"
                className="portal-select"
                value={editFormData.gender}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, gender: e.target.value as UserGender })
                }
              >
                <option value="male">Nam (Male)</option>
                <option value="female">Nữ (Female)</option>
                <option value="other">Khác (Other)</option>
              </Select>
            </div>

            <div className="portal-form-group">
              <label className="portal-label" htmlFor="edit-user-role">Vai trò *</label>
              <Select
                id="edit-user-role"
                className="portal-select"
                value={editFormData.role}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, role: e.target.value as SystemRole })
                }
              >
                <option value="COACH">Huấn luyện viên (Coach)</option>
                <option value="RECEPTIONIST">Lễ tân (Receptionist)</option>
                <option value="MEMBER">Hội viên (Member)</option>
                <option value="CENTER_MANAGER">Quản lý trung tâm (Center Manager)</option>
                <option value="ADMIN">Quản trị hệ thống (Admin)</option>
              </Select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={isUpdating}
                onClick={() => {
                  setEditingUser(null);
                  setEditFieldErrors({});
                }}
              >
                Hủy
              </button>
              <button type="submit" className="btn-primary" disabled={isUpdating}>
                {isUpdating ? (
                  <>
                    <span className="spinner" />
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  'Lưu thay đổi'
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Xác nhận xóa tài khoản */}
      {deletingUser && (
        <Modal
          title="Xác nhận xóa tài khoản"
          onClose={() => {
            if (!isDeleting) setDeletingUser(null);
          }}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              Bạn có chắc chắn muốn xóa tài khoản của <strong>{deletingUser.name}</strong> ({deletingUser.email})?
            </p>
            {deletingUser.is_frozen && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  background: 'rgba(14, 165, 233, 0.1)',
                  border: '1px solid rgba(14, 165, 233, 0.25)',
                  fontSize: '0.85rem',
                  color: '#0284c7',
                }}
              >
                ❄️ Tài khoản này hiện đang có gói tập bảo lưu. Vui lòng cân nhắc trước khi xóa thủ công.
              </div>
            )}
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 6,
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                fontSize: '0.85rem',
                color: '#b91c1c',
              }}
            >
              ⚠️ Lưu ý: Thao tác này sẽ xóa mềm tài khoản khỏi hệ thống và vô hiệu hóa quyền truy cập vĩnh viễn.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={isDeleting}
                onClick={() => setDeletingUser(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={isDeleting}
                onClick={() => void handleConfirmDelete()}
              >
                {isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Quét & dọn dẹp tài khoản > 6 tháng */}
      {showCleanupModal && (
        <Modal
          title="Quét & dọn dẹp tài khoản quá 6 tháng"
          onClose={() => {
            if (!isCleaning) {
              setShowCleanupModal(false);
              setCleanupResult(null);
            }
          }}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              Hệ thống sẽ quét toàn bộ tài khoản và tự động xóa mềm những tài khoản thỏa mãn các điều kiện:
            </p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.88rem', display: 'grid', gap: 6 }}>
              <li>Không đăng nhập trong vòng <strong>6 tháng qua</strong> (hoặc tạo quá 6 tháng nhưng chưa từng đăng nhập).</li>
              <li><strong>Không</strong> xóa tài khoản Quản lý trung tâm (Center Manager).</li>
              <li><strong>Không</strong> xóa tài khoản hội viên đang có gói dịch vụ trong trạng thái <strong>bảo lưu tập (frozen)</strong>.</li>
            </ul>

            {cleanupResult && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 6,
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  fontSize: '0.88rem',
                  color: '#065f46',
                }}
              >
                ✅ {cleanupResult.message || `Đã dọn dẹp thành công ${cleanupResult.deletedCount} tài khoản không hoạt động.`}
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
                {cleanupResult ? 'Đóng' : 'Hủy'}
              </button>
              {!cleanupResult && (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={isCleaning}
                  onClick={() => void handleRunCleanup()}
                >
                  {isCleaning ? (
                    <>
                      <span className="spinner" />
                      <span>Đang quét & dọn dẹp...</span>
                    </>
                  ) : (
                    'Bắt đầu quét & dọn dẹp'
                  )}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
