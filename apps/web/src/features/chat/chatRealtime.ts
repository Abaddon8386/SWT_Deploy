import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { apiFetch } from '../../shared/api/client';
import type { ChatRealtimeSession } from './chatApi';

export type ChatConnection = 'connecting' | 'connected' | 'reconnecting' | 'disabled';

/** Broadcast only invalidates data. Never render or trust its payload. */
export function subscribeChat(changed: () => void, status: (state: ChatConnection) => void,
  sessionPath = '/chat/realtime-session'): () => void {
  let disposed = false, connecting = false, failures = 0;
  let client: SupabaseClient | null = null;
  let chatToken: string | null = null;
  let hasChannel = false;
  let renewTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  function closeClient() {
    const previous = client;
    client = null; hasChannel = false; chatToken = null;
    if (previous) {
      void previous.removeAllChannels().catch(() => {});
      previous.realtime.disconnect();
    }
  }
  function retry() {
    if (disposed || retryTimer) return;
    status('reconnecting');
    retryTimer = setTimeout(() => {
      retryTimer = undefined; closeClient(); void connect();
    }, Math.min(30_000, 3000 * 2 ** Math.min(failures++, 4)));
  }
  async function connect() {
    if (disposed || connecting) return;
    connecting = true;
    try {
      const session = await apiFetch<ChatRealtimeSession>(sessionPath, { method: 'POST' });
      if (disposed) return;
      if (!session.enabled) { clearTimeout(renewTimer); closeClient(); status('disabled'); return; }
      if (!session.url || !session.publishableKey?.startsWith('sb_publishable_') || !session.topic || !session.token || !session.expiresAt)
        throw new Error('Incomplete realtime session');
      const expires = Date.parse(session.expiresAt);
      if (!Number.isFinite(expires) || expires <= Date.now()) throw new Error('Expired realtime session');
      chatToken = session.token;
      if (!client) client = createClient(session.url, session.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        // supabase-js installs a callback even without a Supabase Auth session.
        // Keep our scoped JWT as its source of truth on connect and heartbeat.
        accessToken: async () => chatToken,
      });
      const current = client;
      await current.realtime.setAuth(session.token);
      if (disposed || current !== client) return;
      if (!hasChannel) {
        hasChannel = true;
        current.channel(session.topic, { config: { private: true } })
          .on('broadcast', { event: 'changed' }, () => { if (!disposed && current === client) changed(); })
          .subscribe(state => {
            if (disposed || current !== client) return;
            if (state === 'SUBSCRIBED') {
              failures = 0; clearTimeout(retryTimer); retryTimer = undefined;
              status('connected'); changed();
            }
            if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') retry();
          });
      }
      clearTimeout(renewTimer);
      renewTimer = setTimeout(() => { void connect(); }, Math.max(1000, expires - Date.now() - 60_000));
    } catch { if (!disposed) retry(); }
    finally { connecting = false; }
  }
  function resume() {
    if (disposed || document.visibilityState === 'hidden') return;
    changed();
    if (!client || retryTimer) {
      clearTimeout(retryTimer); retryTimer = undefined; closeClient(); void connect();
    }
  }
  status('connecting'); void connect();
  window.addEventListener('online', resume);
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', resume);
  return () => {
    disposed = true; clearTimeout(renewTimer); clearTimeout(retryTimer); closeClient();
    window.removeEventListener('online', resume); window.removeEventListener('focus', resume);
    document.removeEventListener('visibilitychange', resume);
  };
}
