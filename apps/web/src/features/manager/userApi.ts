import { apiFetch } from '../../shared/api/client';

export type SystemRole = 'CENTER_MANAGER' | 'COACH' | 'RECEPTIONIST' | 'MEMBER';
export type UserGender = 'male' | 'female' | 'other';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: SystemRole;
  gender: UserGender;
  status: 'ACTIVE' | 'LOCKED';
  deleted_at: string | null;
  created_at: string;
  last_login_at?: string | null;
  is_frozen?: boolean;
}

export interface Permission {
  id: string;
  code: string;
  name: string;
  module: string;
}

// 4 role gốc bất biến của hệ thống
export const CORE_ROLES: { id: SystemRole; name: string; description: string }[] = [
  { id: 'CENTER_MANAGER', name: 'Quản lý trung tâm', description: 'Toàn quyền kiểm soát và cấu hình hệ thống' },
  { id: 'COACH', name: 'Huấn luyện viên', description: 'Quản lý lịch dạy, giáo án tập luyện và học viên' },
  { id: 'RECEPTIONIST', name: 'Lễ tân / Thu ngân', description: 'Tiếp đón, check-in và ghi nhận thanh toán' },
  { id: 'MEMBER', name: 'Hội viên', description: 'Đặt lớp, quản lý thẻ thành viên và xem lịch tập' },
];

interface UserDto {
  id: number;
  roleCode: SystemRole;
  fullName: string;
  email: string;
  phone: string | null;
  gender?: string | null;
  status: string;
  createdAt: string;
  lastLoginAt?: string | null;
  subscriptionFrozen?: boolean;
}

interface RoleDto {
  id: number;
  code: SystemRole;
}

interface PermissionDto {
  id: number;
  code: string;
  name: string;
  module: string;
}

const normalizeGender = (g?: string | null): UserGender => {
  if (g === 'male' || g === 'female' || g === 'other') return g;
  return 'other';
};

const toAccount = (u: UserDto): UserAccount => ({
  id: String(u.id),
  name: u.fullName,
  email: u.email,
  phone: u.phone ?? '',
  role: u.roleCode,
  gender: normalizeGender(u.gender),
  status: u.status === 'active' ? 'ACTIVE' : 'LOCKED',
  deleted_at: null,
  created_at: u.createdAt?.split('T')[0] ?? '',
  last_login_at: u.lastLoginAt ? u.lastLoginAt.replace('T', ' ').slice(0, 16) : null,
  is_frozen: Boolean(u.subscriptionFrozen),
});

const roleIds = async (): Promise<Record<string, number>> =>
  Object.fromEntries((await apiFetch<RoleDto[]>('/roles')).map((r) => [r.code, r.id]));

export interface CreateUserPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: SystemRole;
  gender?: UserGender;
}

export interface UpdateUserPayload {
  name: string;
  phone?: string;
  role?: SystemRole;
  gender?: UserGender;
}

export const userApi = {
  async getUsers(): Promise<UserAccount[]> {
    return (await apiFetch<UserDto[]>('/users')).map(toAccount);
  },

  async createUser(payload: CreateUserPayload): Promise<UserAccount> {
    const roleId = (await roleIds())[payload.role];
    const body: Record<string, unknown> = {
      fullName: payload.name,
      email: payload.email,
      phone: payload.phone,
      password: payload.password,
      roleId,
    };
    if (payload.gender) {
      body.gender = payload.gender;
    }
    const created = await apiFetch<UserDto>('/users', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return toAccount(created);
  },

  async updateUser(userId: string, payload: UpdateUserPayload): Promise<UserAccount> {
    const roleId = payload.role ? (await roleIds())[payload.role] : undefined;
    const body: Record<string, unknown> = {
      fullName: payload.name,
      phone: payload.phone,
      roleId,
    };
    if (payload.gender) {
      body.gender = payload.gender;
    }
    const updated = await apiFetch<UserDto>(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return toAccount(updated);
  },

  // Khóa / mở khóa tài khoản theo trạng thái hiện tại trên server
  async toggleLockUser(userId: string): Promise<UserAccount> {
    const current = await apiFetch<UserDto>(`/users/${userId}`);
    const action = current.status === 'active' ? 'lock' : 'unlock';
    return toAccount(await apiFetch<UserDto>(`/users/${userId}/${action}`, { method: 'PATCH' }));
  },

  async getPermissions(): Promise<Permission[]> {
    return (await apiFetch<PermissionDto[]>('/roles/permissions')).map((p) => ({ ...p, id: String(p.id) }));
  },

  async getRolePermissions(): Promise<Record<SystemRole, string[]>> {
    const ids = await roleIds();
    const entries = await Promise.all(
      CORE_ROLES.map(async (r) => {
        const perms = ids[r.id] ? await apiFetch<PermissionDto[]>(`/roles/${ids[r.id]}/permissions`) : [];
        return [r.id, perms.map((p) => String(p.id))] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<SystemRole, string[]>;
  },

  // Bật/tắt một quyền của role: PUT nếu chưa có, DELETE nếu đã có
  async toggleRolePermission(role: SystemRole, permId: string): Promise<void> {
    const roleId = (await roleIds())[role];
    const granted = (await apiFetch<PermissionDto[]>(`/roles/${roleId}/permissions`)).some((p) => String(p.id) === permId);
    await apiFetch(`/roles/${roleId}/permissions/${permId}`, { method: granted ? 'DELETE' : 'PUT' });
  },

  // Xóa mềm tài khoản người dùng
  async deleteUser(userId: string): Promise<void> {
    await apiFetch(`/users/${userId}`, { method: 'DELETE' });
  },

  // Quét và tự động xóa tài khoản không hoạt động > 6 tháng (ngoại trừ hội viên đang bảo lưu tập)
  async cleanupInactiveUsers(): Promise<{ deletedCount: number; message?: string }> {
    return apiFetch<{ deletedCount: number }>('/users/cleanup-inactive', {
      method: 'POST',
    });
  },
};
