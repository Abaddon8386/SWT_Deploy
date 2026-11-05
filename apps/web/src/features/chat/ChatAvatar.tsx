import type { ChatContact } from './chatApi';

export function ChatAvatar({ contact, className }: { contact: Pick<ChatContact, 'id' | 'name' | 'avatarUrl'> & { role?: string }; className?: string }) {
  const ai = contact.role === 'AI';
  const seed = Math.abs(contact.id || 0) % 4;
  return (
    <span className={`direct-chat__avatar ${ai ? 'is-ai' : `is-seed-${seed}`}${className ? ` ${className}` : ''}`} aria-hidden="true">
      {ai ? (
        <svg className="direct-chat__avatar-ai" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z" />
          <path d="M18.5 14.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" opacity=".75" />
        </svg>
      ) : contact.avatarUrl ? (
        <img src={contact.avatarUrl} alt="" className="direct-chat__avatar-img" loading="lazy" decoding="async" />
      ) : (
        <svg className="direct-chat__avatar-placeholder" viewBox="0 0 36 36" fill="none">
          <circle cx="18" cy="13.5" r="6" fill="currentColor" />
          <path d="M6.5 32c2-6 6.2-9 11.5-9s9.5 3 11.5 9" fill="currentColor" />
        </svg>
      )}
      <span className="direct-chat__sr">{contact.name.slice(0, 1)}</span>
    </span>
  );
}
