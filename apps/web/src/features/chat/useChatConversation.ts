import { useCallback, useEffect, useRef, useState } from 'react';
import { getHistory, sendMessage, type ChatMessage } from './chatApi';
import { useI18n } from '../../shared/i18n';
import { chatError, type ChatError } from './chatMessages';

interface Thread {
  id: number; messages: ChatMessage[]; cursor: number | null; syncing: boolean; again: boolean;
}
const errorText = (error: unknown) => chatError(error, 'Không thể tải tin nhắn. Vui lòng thử lại.', 'Unable to load messages. Please try again.');

export function useChatConversation(onSent: () => void) {
  const { t } = useI18n();
  const thread = useRef<Thread | null>(null);
  const mounted = useRef(true);
  const onSentRef = useRef(onSent);
  const drafts = useRef(new Map<number, string>());
  const retries = useRef(new Map<number, { text: string; key: string }>());
  const sendingIds = useRef(new Set<number>());
  const sendErrors = useRef(new Map<number, ChatError>());
  const olderRequest = useRef<Thread | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraftState] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<ChatError | null>(null);
  useEffect(() => { onSentRef.current = onSent; }, [onSent]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; thread.current = null; };
  }, []);

  const merge = useCallback((target: Thread, items: ChatMessage[]) => {
    if (!mounted.current || thread.current !== target) return;
    const byId = new Map(target.messages.map(m => [m.id, m]));
    for (const m of items) if (m.conversationId === target.id) byId.set(m.id, m);
    target.messages = [...byId.values()].sort((a, b) => a.id - b.id);
    setMessages(target.messages);
  }, []);

  const refresh = useCallback(async () => {
    const target = thread.current;
    if (!target) return;
    if (target.syncing) { target.again = true; return; }
    target.syncing = true;
    try {
      do {
        target.again = false;
        const initial = target.cursor === null;
        const page = await getHistory(target.id, initial ? {} : { afterId: target.cursor! });
        if (!mounted.current || thread.current !== target) return;
        merge(target, page.items);
        if (initial) setHasOlder(page.hasMore);
        target.cursor = page.items.at(-1)?.id ?? target.cursor ?? 0;
        if (!initial && page.hasMore && page.items.length > 0) target.again = true;
        setError(null);
      } while (target.again && thread.current === target);
    } catch (e) { if (mounted.current && thread.current === target) setError(errorText(e)); }
    finally {
      target.syncing = false;
      if (mounted.current && thread.current === target) setLoading(false);
    }
  }, [merge]);

  const select = useCallback((id: number) => {
    if (thread.current?.id === id) return;
    thread.current = { id, messages: [], cursor: null, syncing: false, again: false };
    setSelectedId(id); setMessages([]); setError(null); setHasOlder(false); setLoading(true); setOlderLoading(false);
    setDraftState(drafts.current.get(id) ?? ''); setSending(sendingIds.current.has(id));
    setSendError(sendErrors.current.get(id) ?? null);
    void refresh();
  }, [refresh]);

  const setDraft = useCallback((text: string) => {
    const id = thread.current?.id;
    if (id === undefined) return;
    drafts.current.set(id, text); setDraftState(text);
    sendErrors.current.delete(id); setSendError(null);
  }, []);

  const loadOlder = useCallback(async () => {
    const target = thread.current;
    if (!target || !target.messages.length || olderRequest.current === target) return;
    olderRequest.current = target; setOlderLoading(true);
    try {
      const page = await getHistory(target.id, { beforeId: target.messages[0].id });
      if (!mounted.current || thread.current !== target) return;
      merge(target, page.items); setHasOlder(page.hasMore); setError(null);
    } catch (e) { if (mounted.current && thread.current === target) setError(errorText(e)); }
    finally {
      if (olderRequest.current === target) olderRequest.current = null;
      if (mounted.current && thread.current === target) setOlderLoading(false);
    }
  }, [merge]);

  const send = useCallback(async () => {
    const target = thread.current;
    if (!target || sendingIds.current.has(target.id)) return;
    const originalDraft = drafts.current.get(target.id) ?? '';
    const text = originalDraft.trim();
    if (!text || text.length > 2000) return;
    const last = retries.current.get(target.id);
    const attempt = last?.text === text ? last : { text, key: crypto.randomUUID() };
    retries.current.set(target.id, attempt);
    sendingIds.current.add(target.id); setSending(true); setSendError(null);
    try {
      const saved = await sendMessage(target.id, text, attempt.key);
      retries.current.delete(target.id); sendErrors.current.delete(target.id);
      if (!mounted.current) return;
      if (drafts.current.get(target.id) === originalDraft) {
        drafts.current.set(target.id, '');
        if (thread.current?.id === target.id) setDraftState('');
      }
      const current = thread.current;
      if (current?.id === target.id) {
        // Optimistic display must not advance the synchronized cursor: a peer's
        // message may have committed between the last fetch and our send.
        merge(current, [saved]); await refresh();
      }
      onSentRef.current();
    } catch (e) {
      const message = errorText(e); sendErrors.current.set(target.id, message);
      if (mounted.current && thread.current?.id === target.id) setSendError(message);
    } finally {
      sendingIds.current.delete(target.id);
      if (mounted.current && thread.current?.id === target.id) setSending(false);
    }
  }, [merge, refresh]);

  return { selectedId, messages, draft, setDraft, select, refresh, loadOlder, send,
    loading, error: error ? t(error) : null, hasOlder, olderLoading, sending, sendError: sendError ? t(sendError) : null };
}
