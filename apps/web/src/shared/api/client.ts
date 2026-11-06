import { clearNotices } from '../lib/portalNotices';
import { getLanguage, sourceMessage, type SourceMessage } from '../i18n';
export interface UserSession {
  id: string;
  name: string;
  identifier: string;
  role: 'MEMBER' | 'STAFF' | 'COACH' | 'MANAGER' | 'ADMIN';
}

export interface LoginResponse {
  token: string;
  user: UserSession;
}

export const AUTH_STORAGE_KEY = 'fitcenter_auth_session';

export const TOKEN_STORAGE_KEY = 'fitcenter_token';

const sessionListeners = new Set<() => void>();

function notifySessionChange(): void {
  sessionListeners.forEach((listener) => listener());
}

/** Theo dõi thay đổi session ở tab hiện tại và (qua sự kiện `storage`) ở các tab khác. */
export function subscribeAuthSession(listener: () => void): () => void {
  sessionListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === AUTH_STORAGE_KEY || event.key === TOKEN_STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    sessionListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Chuỗi session thô: dùng làm snapshot ổn định cho useSyncExternalStore. */
export function readRawAuthSession(): string | null {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function parseAuthSession(raw: string | null): UserSession | null {
  try {
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserSession;
    return { ...parsed, role: SESSION_ROLE[parsed.role] ?? parsed.role };
  } catch {
    return null;
  }
}

// Lấy thông tin user hiện tại
export function getCurrentUser(): UserSession | null {
  return parseAuthSession(readRawAuthSession());
}

// Lưu session
export function setCurrentUser(user: UserSession): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  notifySessionChange();
}

// Xóa session (Logout hoặc khi gặp 401)
export function clearAuthSession(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  clearNotices();
  notifySessionChange();
}

/**
 * Chỉ kết thúc phiên khi token gây ra 401 vẫn là token đang lưu. Nếu người dùng đã đăng nhập tài khoản khác
 * trong lúc request cũ còn bay, response muộn đó không được xóa phiên mới.
 * Trả về true nếu phiên đã bị thay thế (response cần bị bỏ qua).
 */
function handleUnauthorized(token: string): boolean {
  if (localStorage.getItem(TOKEN_STORAGE_KEY) !== token) return true;
  clearAuthSession();
  window.location.assign(expiredLoginPath());
  return false;
}

const SESSION_REPLACED_MESSAGE = 'Phiên đăng nhập đã thay đổi. Vui lòng tải lại trang.';

function expiredLoginPath(): string {
  const target = window.location.pathname === '/member/packages' ? window.location.pathname + window.location.search : null;
  return '/login?expired=1' + (target ? `&returnTo=${encodeURIComponent(target)}` : '');
}

export class ApiError extends Error {
  status: number;
  code?: string;
  translation?: SourceMessage;
  constructor(message: string, status: number, code?: string, translation?: SourceMessage) {
    super(translation ? (getLanguage() === 'en' ? translation.en : translation.vi) : message);
    this.translation = translation;
    this.status = status;
    this.code = code;
  }
}

// Map backend role codes to the UI session roles
const SESSION_ROLE: Record<string, UserSession['role']> = {
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  COACH: 'COACH',
  RECEPTIONIST: 'STAFF',
  CENTER_MANAGER: 'MANAGER',
};

// Calls the real API with the stored JWT; unwraps ApiResponse.data and throws ApiError on failure
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': getLanguage(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError('Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại.', 0, undefined, sourceMessage('Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại.', 'Unable to connect to the server. Check your connection and try again.'));
  }
  const body = await res.json().catch(() => null);
  if (res.status === 401 && token && (!path.startsWith('/auth/') || path === '/auth/me')) {
    // Phiên đăng nhập hết hạn: đưa người dùng về trang đăng nhập kèm lời giải thích
    if (handleUnauthorized(token)) throw new ApiError(SESSION_REPLACED_MESSAGE, 401, 'SESSION_REPLACED', sourceMessage(SESSION_REPLACED_MESSAGE, 'Your login session has changed. Please reload the page.'));
  }
  if (!res.ok) throw new ApiError(body?.message ?? `Yêu cầu thất bại (HTTP ${res.status})`, res.status, body?.code, body?.message ? undefined : sourceMessage(`Yêu cầu thất bại (HTTP ${res.status})`, `Request failed (HTTP ${res.status})`));
  // ApiResponse omits null data (Jackson NON_NULL); never pass its HTTP status to feature DTOs.
  if (body && typeof body === 'object' && ('data' in body || body.success === true)) {
    return (body.data ?? null) as T;
  }
  return body as T;
}

/** Authenticated binary response for endpoints that do not use the JSON ApiResponse envelope. */
export async function apiFetchPdf(path: string): Promise<Blob> {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      headers: { 'Accept-Language': getLanguage(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch {
    throw new ApiError('Không thể kết nối tới máy chủ. Vui lòng thử lại.', 0, undefined, sourceMessage('Không thể kết nối tới máy chủ. Vui lòng thử lại.', 'Unable to connect to the server. Please try again.'));
  }
  if (res.status === 401 && token) {
    if (handleUnauthorized(token)) throw new ApiError(SESSION_REPLACED_MESSAGE, 401, 'SESSION_REPLACED', sourceMessage(SESSION_REPLACED_MESSAGE, 'Your login session has changed. Please reload the page.'));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.message ?? `Yêu cầu thất bại (HTTP ${res.status})`, res.status, body?.code, body?.message ? undefined : sourceMessage(`Yêu cầu thất bại (HTTP ${res.status})`, `Request failed (HTTP ${res.status})`));
  }
  if (!res.headers.get('Content-Type')?.toLowerCase().startsWith('application/pdf')) {
    throw new ApiError('Máy chủ không trả về file PDF hợp lệ.', res.status, undefined, sourceMessage('Máy chủ không trả về file PDF hợp lệ.', 'The server did not return a valid PDF file.'));
  }
  return res.blob();
}

export async function loginApi(identifier: string, password: string): Promise<LoginResponse> {
  const data = await apiFetch<{ token: string; username: string; role: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: identifier.trim(), password }),
  });
  const user = setAuthSession(data.token, data.username, data.role);
  return { token: data.token, user };
}

export function setAuthSession(token: string, username: string, roleCode: string): UserSession {
  const role = SESSION_ROLE[roleCode];
  if (!role) throw new ApiError('Vai trò tài khoản chưa được hỗ trợ trên portal.', 403, undefined, sourceMessage('Vai trò tài khoản chưa được hỗ trợ trên portal.', 'This account role is not supported in the portal.'));
  const user: UserSession = { id: username, name: username, identifier: username, role };
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  setCurrentUser(user);
  return user;
}

/**
 * Đối chiếu role/username trong localStorage với dữ liệu hiện hành trên server (JWT filter luôn đọc role từ DB).
 * Nhờ vậy khi Admin đổi vai trò, portal tự cập nhật route/menu thay vì giữ role cũ cho tới lần đăng nhập sau.
 * Lỗi mạng/5xx bị bỏ qua; 401 do apiFetch xử lý (chỉ khi token vẫn là token hiện tại).
 */
export async function syncSessionWithServer(): Promise<void> {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) return;
  let me: { username?: string; role?: string } | null;
  try {
    me = await apiFetch<{ username?: string; role?: string }>('/auth/me');
  } catch {
    return;
  }
  if (localStorage.getItem(TOKEN_STORAGE_KEY) !== token) return;
  const role = me?.role ? SESSION_ROLE[me.role] : undefined;
  if (!me?.username || !role) {
    // Vai trò hiện tại không được portal hỗ trợ: không thể giữ phiên cũ
    clearAuthSession();
    window.location.assign(expiredLoginPath());
    return;
  }
  const current = getCurrentUser();
  if (!current) return;
  if (current.role === role && current.identifier === me.username) return;
  setCurrentUser(current.identifier === me.username
    ? { ...current, role }
    : { id: me.username, name: me.username, identifier: me.username, role });
}

// Màn hình mặc định sau đăng nhập theo từng vai trò
export const homePath = (role: UserSession['role']): string => {
  switch (role) {
    case 'ADMIN':
      return '/admin/users';
    case 'MANAGER':
      return '/manager/reports';
    case 'STAFF':
      return '/staff/reception';
    case 'COACH':
      return '/staff/attendance';
    case 'MEMBER':
    default:
      return '/member/dashboard';
  }
};
