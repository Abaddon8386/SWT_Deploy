import { expect, it, vi } from 'vitest';
import { subscribeChat } from '../chat/chatRealtime';
import { subscribeSupport } from './supportRealtime';

vi.mock('../chat/chatRealtime', () => ({ subscribeChat: vi.fn() }));

it('reuses private transport with distinct authorized ticket and staff endpoints', () => {
  const changed = vi.fn(), status = vi.fn(), cleanup = vi.fn();
  vi.mocked(subscribeChat).mockReturnValue(cleanup);
  expect(subscribeSupport(changed, status, 17)).toBe(cleanup);
  expect(subscribeChat).toHaveBeenLastCalledWith(changed, status, '/support/requests/17/realtime-session');
  subscribeSupport(changed, status);
  expect(subscribeChat).toHaveBeenLastCalledWith(changed, status, '/support/requests/realtime-session');
});
