import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { subscribeChat } from './chatRealtime';
import { apiFetch } from '../../shared/api/client';

const fake = vi.hoisted(() => {
  const on = vi.fn(); const subscribe = vi.fn();
  return { on, subscribe, setAuth: vi.fn(), removeAllChannels: vi.fn(), disconnect: vi.fn(), channel: vi.fn(), createClient: vi.fn() };
});
vi.mock('../../shared/api/client', () => ({ apiFetch: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: fake.createClient }));
const session = { enabled: true, userId: 42, url: 'https://test.supabase.co', publishableKey: 'sb_publishable_test', topic: 'scms:chat:42', token: 'signed-token', expiresAt: '2026-10-29T01:05:00Z' };
let dispose = () => {};
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T01:00:00Z'));
  fake.on.mockReturnValue({ subscribe: fake.subscribe }); fake.subscribe.mockReturnValue({});
  fake.channel.mockReturnValue({ on: fake.on }); fake.setAuth.mockResolvedValue(undefined);
  fake.removeAllChannels.mockResolvedValue([]);
  fake.createClient.mockReturnValue({ realtime: { setAuth: fake.setAuth, disconnect: fake.disconnect }, channel: fake.channel, removeAllChannels: fake.removeAllChannels });
  vi.mocked(apiFetch).mockResolvedValue(session);
});
afterEach(() => { dispose(); vi.useRealTimers(); vi.clearAllMocks(); });
const settle = async () => { await vi.advanceTimersByTimeAsync(0); };

it('authenticates before joining a private channel and catches up on subscribe and broadcast', async () => {
  const changed = vi.fn(), status = vi.fn();
  dispose = subscribeChat(changed, status); await settle();
  expect(fake.setAuth).toHaveBeenCalledWith('signed-token');
  expect(fake.channel).toHaveBeenCalledWith('scms:chat:42', { config: { private: true } });
  expect(fake.setAuth.mock.invocationCallOrder[0]).toBeLessThan(fake.channel.mock.invocationCallOrder[0]);
  fake.subscribe.mock.calls[0][0]('SUBSCRIBED');
  expect(status).toHaveBeenLastCalledWith('connected'); expect(changed).toHaveBeenCalledTimes(1);
  fake.on.mock.calls[0][2]({ payload: { message: 'untrusted' } });
  expect(changed).toHaveBeenCalledTimes(2);
});

it('uses the caller authorized support session instead of a Direct Message session', async () => {
  vi.mocked(apiFetch).mockResolvedValue({ ...session, topic: 'scms:support:ticket:17' });
  dispose = subscribeChat(vi.fn(), vi.fn(), '/support/requests/17/realtime-session'); await settle();
  expect(apiFetch).toHaveBeenCalledWith('/support/requests/17/realtime-session', { method: 'POST' });
  expect(fake.channel).toHaveBeenCalledWith('scms:support:ticket:17', { config: { private: true } });
});

it('renews the token before expiry without recreating the existing channel', async () => {
  dispose = subscribeChat(vi.fn(), vi.fn()); await settle();
  vi.mocked(apiFetch).mockResolvedValue({ ...session, token: 'new-token', expiresAt: '2026-10-29T01:09:00Z' });
  await vi.advanceTimersByTimeAsync(240_000);
  expect(fake.setAuth).toHaveBeenLastCalledWith('new-token');
  expect(fake.channel).toHaveBeenCalledTimes(1);
});

it('cleans up timers and channels and ignores late events', async () => {
  const changed = vi.fn(); dispose = subscribeChat(changed, vi.fn()); await settle();
  const broadcast = fake.on.mock.calls[0][2]; dispose();
  broadcast(); await vi.advanceTimersByTimeAsync(600_000);
  expect(changed).not.toHaveBeenCalled(); expect(apiFetch).toHaveBeenCalledTimes(1);
  expect(fake.disconnect).toHaveBeenCalled();
});

it('reports disabled configuration without opening a socket', async () => {
  vi.mocked(apiFetch).mockResolvedValue({ enabled: false, userId: 42 });
  const status = vi.fn(); dispose = subscribeChat(vi.fn(), status); await settle();
  expect(status).toHaveBeenLastCalledWith('disabled'); expect(fake.createClient).not.toHaveBeenCalled();
});

it('retries a failed connection and catches up after online/focus', async () => {
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error('offline'));
  const changed = vi.fn(), status = vi.fn(); dispose = subscribeChat(changed, status); await settle();
  expect(status).toHaveBeenLastCalledWith('reconnecting');
  await vi.advanceTimersByTimeAsync(3000);
  expect(fake.channel).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('online')); await settle();
  expect(changed).toHaveBeenCalled();
});

it('does not open a socket if unmounted while session request was pending', async () => {
  let resolve!: (v: unknown) => void;
  vi.mocked(apiFetch).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  dispose = subscribeChat(vi.fn(), vi.fn()); dispose(); resolve(session); await settle();
  expect(fake.createClient).not.toHaveBeenCalled();
});

it('keeps the scoped token when the installed SDK refreshes auth on connect or heartbeat', async () => {
  const sdk = await vi.importActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js');
  let realClient: ReturnType<typeof sdk.createClient> | undefined;
  fake.createClient.mockImplementationOnce((url, key, options) => {
    realClient = sdk.createClient(url, key, options);
    // Keep the real SDK's auth machinery; replace only the external socket boundary.
    vi.spyOn(realClient, 'channel').mockReturnValue({ on: fake.on } as unknown as ReturnType<typeof realClient.channel>);
    return realClient;
  });
  dispose = subscribeChat(vi.fn(), vi.fn()); await settle();
  await realClient!.realtime.setAuth();
  expect(realClient!.realtime.accessTokenValue).toBe('signed-token');
  vi.mocked(apiFetch).mockResolvedValue({ ...session, token: 'renewed-scoped-token', expiresAt: '2026-10-29T01:09:00Z' });
  await vi.advanceTimersByTimeAsync(240_000);
  await realClient!.realtime.setAuth();
  expect(realClient!.realtime.accessTokenValue).toBe('renewed-scoped-token');
});
