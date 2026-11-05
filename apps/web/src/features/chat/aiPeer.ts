import type { ChatContact } from './chatApi';

/**
 * Trợ lý SÖL AI hiển thị như một người trong danh sách tin nhắn (không còn nút AI tách riêng).
 * `id` âm để không bao giờ trùng tài khoản thật; hội thoại AI đi qua `/ai/chat/*`, không qua `/chat/*`.
 */
export const AI_PEER: ChatContact = { id: -1, name: 'SÖL AI', role: 'AI', available: true, avatarUrl: null };

export const isAiPeer = (contact: Pick<ChatContact, 'role'>) => contact.role === 'AI';

/** Câu trả lời của AI có thể chứa Markdown; khung chat chỉ hiển thị chữ thuần. */
export function formatAiText(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\r?\n?/g, '').trim())
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*[*+-][ \t]+/gm, '• ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
