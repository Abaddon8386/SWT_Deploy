import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { Modal } from '../../shared/ui/Modal';
import { ApiError } from '../../shared/api/client';
import { getCurrentUser } from '../../shared/api/client';
import { formatCenterDateTime } from '../../shared/lib/centerTime';
import { escalateSupportTicket, getSupportInbox, getSupportTicket, getSupportMessages, sendSupportMessage, updateSupportStatus, type SupportTicket, type SupportMessage } from '../member/memberSupportApi';
import { subscribeSupport } from '../member/supportRealtime';
import type { ChatConnection } from '../chat/chatRealtime';
import '../member/member-support.css';
import './staff-support.css';

const labels: Record<SupportTicket['status'], string> = { open: 'Đang chờ', in_progress: 'Đang xử lý', resolved: 'Đã giải quyết', closed: 'Đã đóng' };
const connections: Record<ChatConnection, string> = { connecting: 'Đang kết nối cập nhật', connected: 'Đã kết nối cập nhật', reconnecting: 'Đang kết nối lại', disabled: 'Cập nhật trực tiếp chưa khả dụng. Dùng Làm mới.' };
const transitions: Record<SupportTicket['status'], SupportTicket['status'][]> = { open: ['open', 'in_progress', 'resolved'], in_progress: ['in_progress', 'open', 'resolved', 'closed'], resolved: ['resolved', 'in_progress', 'closed'], closed: ['closed'] };
const failure = (error: unknown) => error instanceof ApiError ? error.message : 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.';

export function StaffSupportPage() {
  // Receptionists take every complaint first; managers only receive what a receptionist escalates.
  const isManager = getCurrentUser()?.role === 'MANAGER';
  const [escalating, setEscalating] = useState(false), [escalationReason, setEscalationReason] = useState('');
  const [tickets, setTickets] = useState<SupportTicket[]>([]), [page, setPage] = useState(0), [pages, setPages] = useState(0), [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true), [listError, setListError] = useState('');
  const [selected, setSelected] = useState<number | null>(null), [ticket, setTicket] = useState<SupportTicket | null>(null), [messages, setMessages] = useState<SupportMessage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState('');
  const [actionErrors, setActionErrors] = useState<Record<number, string>>({}), [notices, setNotices] = useState<Record<number, string>>({});
  const [drafts, setDrafts] = useState<Record<number, string>>({}), [busyIds, setBusyIds] = useState<number[]>([]);
  const [connection, setConnection] = useState<ChatConnection>('connecting');
  const alive = useRef(false), selection = useRef<number | null>(null), listGeneration = useRef(0), detailGeneration = useRef(0), busy = useRef(new Set<number>());
  const listQuery = useRef({ page: 0, filter: '' });
  const listFocus = useRef<HTMLElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null), sendKeys = useRef(new Map<number, { text: string; key: string }>());
  useEffect(() => { alive.current = true; return () => { alive.current = false; selection.current = null; }; }, []);

  const loadList = useCallback(async () => {
    const { page, filter } = listQuery.current;
    const generation = ++listGeneration.current;
    setLoading(true); setListError('');
    try {
      const result = await getSupportInbox(page, filter);
      if (alive.current && generation === listGeneration.current) {
        const lastPage = Math.max(0, result.totalPages - 1);
        if (page > lastPage) {
          listQuery.current = { page: lastPage, filter };
          setPage(lastPage);
          return;
        }
        setTickets(result.content); setPages(result.totalPages);
      }
    }
    catch (error) { if (alive.current && generation === listGeneration.current) setListError(failure(error)); }
    finally { if (alive.current && generation === listGeneration.current) setLoading(false); }
  }, []);
  const loadDetail = useCallback(async (id: number) => {
    const generation = ++detailGeneration.current;
    const current = () => alive.current && selection.current === id && generation === detailGeneration.current;
    setDetailLoading(true); setDetailError('');
    try {
      const [result, history] = await Promise.all([getSupportTicket(id), getSupportMessages(id)]);
      if (current()) { setTicket(result); setMessages([...new Map(history.map(message => [message.id, message])).values()]); }
    } catch (error) { if (current()) { setTicket(null); setMessages([]); setDetailError(failure(error)); } }
    finally { if (current()) setDetailLoading(false); }
  }, []);
  useEffect(() => { void loadList(); }, [loadList, page, filter]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false, running = false, dirty = false;
    const invalidate = () => {
      if (disposed || !alive.current || document.visibilityState === 'hidden') return;
      if (running) { dirty = true; return; }
      if (!timer) timer = setTimeout(async () => { timer = undefined; running = true; await loadList(); running = false; if (dirty) { dirty = false; invalidate(); } }, 80);
    };
    const stop = subscribeSupport(invalidate, state => { if (!disposed && alive.current) { setConnection(state); if (state === 'connected') invalidate(); } });
    return () => { disposed = true; stop(); clearTimeout(timer); };
  }, [loadList]);
  useEffect(() => {
    if (selected === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false, running = false, dirty = false;
    const invalidate = () => {
      if (disposed || !alive.current || selection.current !== selected || document.visibilityState === 'hidden') return;
      if (running) { dirty = true; return; }
      if (!timer) timer = setTimeout(async () => { timer = undefined; running = true; await loadDetail(selected); running = false; if (dirty) { dirty = false; invalidate(); } }, 80);
    };
    void loadDetail(selected);
    const stop = subscribeSupport(invalidate, state => { if (state === 'connected') invalidate(); }, selected);
    return () => { disposed = true; stop(); clearTimeout(timer); };
  }, [selected, loadDetail]);

  function close() {
    returnFocus.current = listFocus.current?.querySelector<HTMLElement>(`[data-support-ticket="${selection.current}"]`) ?? listFocus.current;
    selection.current = null; detailGeneration.current++; setSelected(null); setTicket(null);
  }
  function changeQuery(nextPage: number, nextFilter: string) {
    // Invalidate old responses immediately; pending mutations use this latest query.
    listQuery.current = { page: nextPage, filter: nextFilter };
    listGeneration.current++;
    setPage(nextPage); setFilter(nextFilter);
  }
  async function actOnTicket(operation: () => Promise<unknown>, sentDraft?: string, notice?: string) {
    if (!ticket || busy.current.has(ticket.id) || detailLoading || detailError) return;
    const id = ticket.id;
    busy.current.add(id); setBusyIds(ids => [...ids, id]); setActionErrors(values => ({ ...values, [id]: '' })); setNotices(values => ({ ...values, [id]: '' }));
    try {
      await operation();
      if (!alive.current) return;
      if (sentDraft !== undefined) { setDrafts(values => values[id] === sentDraft ? { ...values, [id]: '' } : values); sendKeys.current.delete(id); }
      setNotices(values => ({ ...values, [id]: notice ?? (sentDraft !== undefined ? 'Đã gửi tin nhắn.' : 'Đã cập nhật trạng thái.') }));
      void loadList();
      // Always read after the write, invalidating GETs that began before commit.
      if (selection.current === id) await loadDetail(id);
    } catch (error) { if (alive.current) setActionErrors(values => ({ ...values, [id]: failure(error) })); }
    finally { busy.current.delete(id); if (alive.current) setBusyIds(ids => ids.filter(value => value !== id)); }
  }
  function send(event: FormEvent) {
    event.preventDefault();
    if (!ticket || ticket.status === 'closed') return;
    const draft = drafts[ticket.id] ?? '', text = draft.trim();
    if (!text || text.length > 2000) return;
    let attempt = sendKeys.current.get(ticket.id);
    if (!attempt || attempt.text !== text) { attempt = { text, key: crypto.randomUUID() }; sendKeys.current.set(ticket.id, attempt); }
    void actOnTicket(() => sendSupportMessage(ticket.id, text, attempt.key), draft);
  }
  const isBusy = selected !== null && busyIds.includes(selected);
  // Whoever is not the current handler may read the complaint but cannot act on it.
  const canAct = (item: SupportTicket) => isManager ? !!item.escalatedAt : !item.escalatedAt;
  const canEscalate = (item: SupportTicket) => !isManager && !item.escalatedAt && (item.status === 'open' || item.status === 'in_progress');
  function submitEscalation(event: FormEvent) {
    event.preventDefault();
    const reason = escalationReason.trim();
    if (!ticket || !reason || reason.length > 500) return;
    if (!ticket || !reason || reason.length > 500 || isBusy) return;
    void actOnTicket(async () => { const updated = await escalateSupportTicket(ticket.id, reason); if (alive.current) { setEscalating(false); setEscalationReason(''); } return updated; }, undefined, 'Đã chuyển khiếu nại lên quản lý.');
  }
  return <div className="portal-container member-support staff-support">
    <PageHeader eyebrow={isManager ? 'Quản lý' : 'Lễ tân'} title={isManager ? 'Khiếu nại chuyển lên quản lý' : 'Hộp thư hỗ trợ'} />
    <p role="status" className="member-support-context">{connections[connection]}</p>
    <section className="portal-card" ref={listFocus} tabIndex={-1}>
      <div className="staff-support-toolbar"><label htmlFor="staff-support-filter">Trạng thái</label><select id="staff-support-filter" className="portal-select" value={filter} onChange={event => { changeQuery(0, event.target.value); }}>{<option value="">Tất cả</option>}{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><RefreshButton disabled={loading} onClick={() => void loadList()} /></div>
      {loading ? <LoadingSkeleton label="Đang tải phiếu hỗ trợ…" count={4} /> : listError ? <div role="alert"><p>{listError}</p><button className="member-support-link" onClick={() => void loadList()}>Thử lại</button></div> : !tickets.length ? <p className="portal-empty">Không có phiếu hỗ trợ phù hợp.</p> : <div className="member-support-list">{tickets.map(item => <button key={item.id} data-support-ticket={item.id} className="member-support-ticket" aria-haspopup="dialog" onClick={event => { returnFocus.current = event.currentTarget; selection.current = item.id; detailGeneration.current++; setTicket(null); setMessages([]); setDetailError(''); setSelected(item.id); }}><span className="member-support-ticket-top"><strong>#{item.id} · {item.subject}</strong><span className={`member-support-status member-support-status--${item.status}`}>{labels[item.status]}</span>{item.escalatedAt && !isManager && <span className="member-support-status member-support-status--escalated">Đã chuyển quản lý</span>}</span><span className="member-support-meta">{item.memberName || `Hội viên #${item.memberId}`} · {formatCenterDateTime(item.createdAt)} · {item.assignedToName || 'Chưa phân công'}</span></button>)}</div>}
      {!loading && !listError && pages > 1 && <div className="member-support-pages"><button disabled={!page} onClick={() => changeQuery(page - 1, filter)}>Trước</button><span>{page + 1}/{pages}</span><button disabled={page + 1 >= pages} onClick={() => changeQuery(page + 1, filter)}>Sau</button></div>}
    </section>
    {selected !== null && <Modal title={`Hỗ trợ · Phiếu #${selected}`} onClose={close} returnFocusRef={returnFocus}><div className="member-support-conversation">
      <button className="member-support-link" disabled={detailLoading} onClick={() => void loadDetail(selected)}>Làm mới hội thoại</button>
      {detailLoading && <LoadingSkeleton label="Đang tải hội thoại…" count={3} />}
      {detailError && <div role="alert"><p>{detailError}</p><button className="member-support-link" onClick={() => void loadDetail(selected)}>Thử lại</button></div>}
      {ticket && <><h3>{ticket.subject}</h3><p className="member-support-description">{ticket.description}</p><p className="member-support-context">{ticket.memberName || `Hội viên #${ticket.memberId}`} · {ticket.assignedToName || 'Chưa phân công'}</p>
        {ticket.escalatedAt && <p role="status" className="member-support-notice" data-testid="escalation-info">{isManager ? 'Lễ tân' : 'Đã chuyển lên quản lý'}{ticket.escalatedByName ? ` ${ticket.escalatedByName}` : ''} lúc {formatCenterDateTime(ticket.escalatedAt)}{ticket.escalationReason ? ` — Lý do: ${ticket.escalationReason}` : ''}.{!isManager && ' Quản lý đang xử lý, lễ tân chỉ xem.'}</p>}
        <label className="portal-label" htmlFor="staff-support-status">Trạng thái phiếu</label><select id="staff-support-status" className="portal-select" value={ticket.status} disabled={isBusy || detailLoading || !canAct(ticket)} onChange={event => { const status = event.target.value as SupportTicket['status']; void actOnTicket(() => updateSupportStatus(ticket.id, status)); }}>{transitions[ticket.status].map(value => <option key={value} value={value}>{labels[value]}</option>)}</select>
        {actionErrors[ticket.id] && <p role="alert" className="member-support-error">{actionErrors[ticket.id]}</p>}{notices[ticket.id] && <p role="status" className="member-support-notice">{notices[ticket.id]}</p>}
        {!detailLoading && (!messages.length ? <p className="portal-empty">Chưa có tin nhắn.</p> : <ol className="member-support-messages" tabIndex={0} aria-label={`Tin nhắn phiếu #${selected}`}>{messages.map(message => <li key={message.id} className={message.senderRole === 'MEMBER' ? 'is-member' : 'is-staff'}><strong>{message.senderName || (message.senderRole === 'MEMBER' ? 'Hội viên' : 'Nhân viên')}</strong><p>{message.message}</p><time dateTime={message.createdAt}>{formatCenterDateTime(message.createdAt)}</time></li>)}</ol>)}
        {canEscalate(ticket) && <button type="button" className="btn-secondary" disabled={isBusy || detailLoading} onClick={() => { setEscalationReason(''); setEscalating(true); }}>Chuyển lên quản lý</button>}
        {ticket.status === 'closed' ? <p className="member-support-context">Phiếu đã đóng, không thể gửi thêm tin nhắn.</p> : !canAct(ticket) ? null : <form className="member-support-compose" onSubmit={send}><label className="portal-label" htmlFor="staff-support-message">Tin nhắn</label><textarea id="staff-support-message" className="portal-textarea" rows={3} maxLength={2000} value={drafts[ticket.id] ?? ''} disabled={isBusy} onChange={event => { const value = event.target.value; setDrafts(values => ({ ...values, [ticket.id]: value })); }} /><button type="submit" className="btn-primary" disabled={isBusy || detailLoading || !drafts[ticket.id]?.trim()}>{isBusy ? 'Đang gửi…' : 'Gửi tin nhắn'}</button></form>}
      </>}
    </div></Modal>}
    {escalating && ticket && <Modal title={`Chuyển lên quản lý · Phiếu #${ticket.id}`} busy={isBusy} onClose={() => { if (!isBusy) setEscalating(false); }}>
      <form className="member-support-compose" onSubmit={submitEscalation}>
        <p className="member-support-context">Quản lý sẽ tiếp nhận và phản hồi hội viên. Sau khi chuyển, lễ tân không xử lý phiếu này nữa.</p>
        <label className="portal-label" htmlFor="staff-support-escalation">Lý do chuyển lên quản lý</label>
        <textarea id="staff-support-escalation" className="portal-textarea" rows={3} maxLength={500} required value={escalationReason} onChange={event => setEscalationReason(event.target.value)} />
        {actionErrors[ticket.id] && <p role="alert" className="member-support-error">{actionErrors[ticket.id]}</p>}
        <div className="form-actions"><button type="button" className="btn-secondary" disabled={isBusy} onClick={() => setEscalating(false)}>Hủy</button><button type="submit" className="btn-primary" disabled={isBusy || !escalationReason.trim()}>{isBusy ? 'Đang chuyển…' : 'Chuyển lên quản lý'}</button></div>
      </form>
    </Modal>}
  </div>;
}
