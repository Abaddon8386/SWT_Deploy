import { subscribeChat, type ChatConnection } from '../chat/chatRealtime';

/** Reuse the private DM transport, with a separately authorized ticket/inbox session. */
export function subscribeSupport(changed: () => void, status: (state: ChatConnection) => void, ticketId?: number) {
  const path = ticketId == null ? '/support/requests/realtime-session' : `/support/requests/${ticketId}/realtime-session`;
  return subscribeChat(changed, status, path);
}
