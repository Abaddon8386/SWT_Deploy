import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { chatRoleLabel, getContacts, type ChatContact } from './chatApi';
import { ChatAvatar } from './ChatAvatar';
import { chatError, type ChatError } from './chatMessages';
import { useI18n } from '../../shared/i18n';

export function ChatContacts({ onChoose, pending }: { onChoose: (contact: ChatContact) => void; pending: number | null }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ChatError | null>(null);
  const sequence = useRef({ value: 0 });
  const search = useCallback(async (term: string, nextPage: number) => {
    const request = ++sequence.current.value;
    setLoading(true); setError(null); setSubmitted(term);
    try {
      const data = await getContacts(term, nextPage);
      if (request !== sequence.current.value) return;
      setContacts(data.content); setPage(nextPage); setTotal(data.totalPages);
    } catch (e) { if (request === sequence.current.value) setError(chatError(e, 'Không thể tải danh bạ.', 'Unable to load contacts.')); }
    finally { if (request === sequence.current.value) setLoading(false); }
  }, []);
  useEffect(() => { const requests = sequence.current; void search('', 0); return () => { requests.value++; }; }, [search]);
  function submit(event: FormEvent) { event.preventDefault(); void search(query.trim(), 0); }
  return <section data-i18n-managed className="direct-chat__contacts" aria-label={t("Chọn người để trò chuyện", "Choose a chat recipient")}>
    <form onSubmit={submit} className="direct-chat__search">
      <label className="portal-label" htmlFor="chat-contact-query">{t("Tìm lễ tân hoặc huấn luyện viên", "Find a receptionist or coach")}</label>
      <div><input id="chat-contact-query" className="portal-input" type="search" value={query} maxLength={80} onChange={e => setQuery(e.target.value)} placeholder={t("Tìm kiếm người nhận...", "Search recipients...")} />
        <button type="submit" className="btn-secondary" disabled={loading}>{t("Tìm", "Search")}</button></div>
    </form>
    {loading ? <LoadingSkeleton label={t("Đang tải danh bạ…", "Loading contacts…")} count={3} /> : error ? <div role="alert"><p>{t(error)}</p><button className="direct-chat__link" type="button" onClick={() => void search(submitted, page)}>{t("Thử lại", "Retry")}</button></div>
      : contacts.length === 0 ? <p className="direct-chat__muted">{t("Không tìm thấy lễ tân hoặc huấn luyện viên phù hợp.", "No matching receptionists or coaches found.")}</p>
        : <ul className="direct-chat__list">{contacts.map(contact => <li key={contact.id}><button type="button" data-contact-id={contact.id} className="direct-chat__person" disabled={pending !== null} onClick={() => onChoose(contact)}>
          <ChatAvatar contact={contact} />
          <span className="direct-chat__person-info"><strong>{contact.name}</strong><small className="direct-chat__role">{pending === contact.id ? t('Đang mở hội thoại…', 'Opening conversation…') : chatRoleLabel(contact.role, t)}</small></span>
          <span className="direct-chat__person-arrow" aria-hidden="true">↗</span>
        </button></li>)}</ul>}
    {!loading && !error && total > 1 && <nav className="direct-chat__pagination" aria-label={t("Trang danh bạ", "Contact pages")}>
      <button type="button" className="direct-chat__link" disabled={page === 0} onClick={() => void search(submitted, page - 1)}>{t("Trước", "Previous")}</button>
      <span>{page + 1}/{total}</span><button type="button" className="direct-chat__link" disabled={page + 1 >= total} onClick={() => void search(submitted, page + 1)}>{t("Sau", "Next")}</button>
    </nav>}
  </section>;
}
