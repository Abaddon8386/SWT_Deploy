import { useMemo, useSyncExternalStore } from 'react';
import { parseAuthSession, readRawAuthSession, subscribeAuthSession, type UserSession } from './client';

/** Session hiện tại, render lại khi đổi tài khoản/role ở tab này hoặc tab khác. */
export function useCurrentUser(): UserSession | null {
  const raw = useSyncExternalStore(subscribeAuthSession, readRawAuthSession, () => null);
  return useMemo(() => parseAuthSession(raw), [raw]);
}

/** Khóa danh tính: đổi tài khoản hoặc role thì mọi state gắn với phiên cũ phải bị bỏ. */
export function sessionIdentityKey(user: UserSession | null): string {
  return user ? `${user.identifier}:${user.role}` : 'anonymous';
}
