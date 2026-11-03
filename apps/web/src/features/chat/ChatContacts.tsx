import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { chatRoleLabel, getContacts, type ChatContact } from './chatApi';
import { errorMessage } from '../../shared/lib/errorMessage';

export function ChatContacts({ onChoose, pending }: { onChoose: (contact: ChatContact) => void; pending: number | null }) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef({ value: 0 });
  const search = useCallback(async (term: string, nextPage: number) => {
    const request = ++sequence.current.value;
    setLoading(true); setError(null); setSubmitted(term);
    try {
      const data = await getContacts(term, nextPage);
      if (request !== sequence.current.value) return;
      setContacts(data.content); setPage(nextPage); setTotal(data.totalPages);
    } catch (e) { if (request === sequence.current.value) setError(errorMessage(e, 'Không thể tải danh bạ.')); }
    finally { if (request === sequence.current.value) setLoading(false); }
  }, []);
  useEffect(() => { const requests = sequence.current; void search('', 0); return () => { requests.value++; }; }, [search]);
  function submit(event: FormEvent) { event.preventDefault(); void search(query.trim(), 0); }
  return <section className="direct-chat__contacts" aria-label="Chọn người để trò chuyện">
    <form onSubmit={submit} className="direct-chat__search">
      <label className="portal-label" htmlFor="chat-contact-query">Tìm lễ tân hoặc huấn luyện viên</label>
      <div><input id="chat-contact-query" className="portal-input" type="search" value={query} maxLength={80} onChange={e => setQuery(e.target.value)} placeholder="Nhập tên người nhận" />
        <button type="submit" className="btn-secondary" disabled={loading}>Tìm</button></div>
    </form>
    {loading ? <LoadingSkeleton label="Đang tải danh bạ…" count={3} /> : error ? <div role="alert"><p>{error}</p><button className="direct-chat__link" type="button" onClick={() => void search(submitted, page)}>Thử lại</button></div>
      : contacts.length === 0 ? <p className="direct-chat__muted">Không tìm thấy lễ tân hoặc huấn luyện viên phù hợp.</p>
        : <ul className="direct-chat__list">{contacts.map(contact => <li key={contact.id}><button type="button" data-contact-id={contact.id} className="direct-chat__person" disabled={pending !== null} onClick={() => onChoose(contact)}>
          <span className="direct-chat__avatar" aria-hidden="true">{contact.name.slice(0, 1)}</span>
          <span><strong>{contact.name}</strong><small>{pending === contact.id ? 'Đang mở hội thoại…' : chatRoleLabel(contact.role)}</small></span>
          <span className="direct-chat__person-arrow" aria-hidden="true">↗</span>
        </button></li>)}</ul>}
    {!loading && !error && total > 1 && <nav className="direct-chat__pagination" aria-label="Trang danh bạ">
      <button type="button" className="direct-chat__link" disabled={page === 0} onClick={() => void search(submitted, page - 1)}>Trước</button>
      <span>{page + 1}/{total}</span><button type="button" className="direct-chat__link" disabled={page + 1 >= total} onClick={() => void search(submitted, page + 1)}>Sau</button>
    </nav>}
  </section>;
}
