import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Select } from '../../shared/ui/Select';
import {
  getCoachSupportTickets,
  getSupportMessages,
  sendSupportMessage,
  updateSupportTicketStatus,
  type SupportMessage,
  type SupportTicket,
} from './coachSupportApi';
import './coach-support.css';

const statusLabels: Record<SupportTicket['status'], string> = {
  open: 'Đang chờ',
  in_progress: 'Đang xử lý',
  resolved: 'Đã giải quyết',
  closed: 'Đã đóng',
};

const statusBadgeClasses: Record<SupportTicket['status'], string> = {
  open: 'badge-neutral',
  in_progress: 'badge-warning',
  resolved: 'badge-success',
  closed: 'badge-neutral',
};

export function CoachSupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) ?? null;

  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const [replyText, setReplyText] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);

  // Load ticket list
  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCoachSupportTickets(selectedStatus);
      setTickets(res.content);
      if (res.content.length > 0 && !selectedTicketId) {
        setSelectedTicketId(res.content[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải danh sách khiếu nại.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedStatus, selectedTicketId]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  // Load messages when selected ticket changes
  const loadMessages = useCallback(async (ticketId: number) => {
    setMessagesLoading(true);
    setMessagesError(null);
    try {
      const msgs = await getSupportMessages(ticketId);
      setMessages(msgs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải cuộc hội thoại.';
      setMessagesError(msg);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTicketId) {
      void loadMessages(selectedTicketId);
    } else {
      setMessages([]);
    }
  }, [selectedTicketId, loadMessages]);

  // Handle Send Reply
  const handleSendReply = async (e: FormEvent) => {
    e.preventDefault();
    const text = replyText.trim();
    if (!text || !selectedTicketId || sending) return;

    setSending(true);
    try {
      const sent = await sendSupportMessage(selectedTicketId, text);
      setMessages((prev) => [...prev, sent]);
      setReplyText('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gửi phản hồi thất bại.';
      alert(msg);
    } finally {
      setSending(false);
    }
  };

  // Handle Update Status
  const handleStatusChange = async (newStatus: SupportTicket['status']) => {
    if (!selectedTicketId || updatingStatus) return;

    setUpdatingStatus(true);
    try {
      const updated = await updateSupportTicketStatus(selectedTicketId, newStatus);
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cập nhật trạng thái thất bại.';
      alert(msg);
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="portal-container">
      <PageHeader
        eyebrow="Huấn luyện viên"
        title="Khiếu nại & Ý kiến học viên"
        subtitle="Lắng nghe ý kiến đóng góp, giải đáp thắc mắc và hỗ trợ xử lý khiếu nại của học viên."
      />

      {error && (
        <div className="portal-alert portal-alert--error" style={{ marginBottom: 16 }}>
          {error}
          <button
            type="button"
            className="btn-secondary btn-sm"
            style={{ marginLeft: 12 }}
            onClick={() => void loadTickets()}
          >
            Thử lại
          </button>
        </div>
      )}

      <div className="coach-support-layout">
        {/* Cột trái: Bộ lọc & Danh sách ticket */}
        <div className="coach-support-sidebar">
          <div className="coach-support-filter">
            {[
              { id: 'ALL', label: 'Tất cả' },
              { id: 'OPEN', label: 'Đang chờ' },
              { id: 'IN_PROGRESS', label: 'Đang xử lý' },
              { id: 'RESOLVED', label: 'Đã giải quyết' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                className={`filter-chip ${selectedStatus === f.id ? 'is-active' : ''}`}
                onClick={() => setSelectedStatus(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="portal-state">Đang tải danh sách khiếu nại…</div>
          ) : tickets.length === 0 ? (
            <div className="portal-empty" style={{ padding: '32px 16px' }}>
              <h3>Không có khiếu nại nào</h3>
              <p>Hiện chưa có yêu cầu hỗ trợ hoặc khiếu nại nào từ học viên trong mục này.</p>
            </div>
          ) : (
            <div className="coach-support-list" data-testid="support-tickets-list">
              {tickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`coach-support-card ${t.id === selectedTicketId ? 'active' : ''}`}
                  onClick={() => setSelectedTicketId(t.id)}
                >
                  <div className="coach-support-card-header">
                    <span className="coach-support-card-subject">{t.subject}</span>
                    <span className={`badge ${statusBadgeClasses[t.status] || 'badge-neutral'}`}>
                      {statusLabels[t.status] || t.status}
                    </span>
                  </div>
                  <div className="coach-support-card-meta">
                    <span>Mã: #{t.id}</span>
                    <span>{new Date(t.createdAt).toLocaleDateString('vi-VN')}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cột phải: Chi tiết khiếu nại & Trao đổi tin nhắn */}
        <div className="coach-support-detail">
          {selectedTicket ? (
            <>
              <div className="coach-support-detail-header">
                <div>
                  <h3 className="coach-support-detail-title">{selectedTicket.subject}</h3>
                  <p className="coach-support-detail-sub">
                    Yêu cầu #{selectedTicket.id} · Gửi lúc{' '}
                    {new Date(selectedTicket.createdAt).toLocaleString('vi-VN')}
                  </p>
                  {selectedTicket.description && (
                    <p
                      style={{
                        marginTop: 10,
                        fontSize: 13,
                        color: 'var(--portal-paper)',
                        background: 'var(--portal-surface)',
                        padding: '8px 12px',
                        borderRadius: 8,
                      }}
                    >
                      {selectedTicket.description}
                    </p>
                  )}
                </div>

                <div className="coach-support-status-group">
                  <label htmlFor="ticket-status-select" className="coach-support-status-label">
                    Trạng thái:
                  </label>
                  <Select
                    id="ticket-status-select"
                    className="portal-select coach-support-status-select"
                    value={selectedTicket.status}
                    disabled={updatingStatus || selectedTicket.status === 'closed'}
                    onChange={(e) => void handleStatusChange(e.target.value as SupportTicket['status'])}
                  >
                    <option value="open">Đang chờ</option>
                    <option value="in_progress">Đang xử lý</option>
                    <option value="resolved">Đã giải quyết</option>
                    <option value="closed" disabled>Đã đóng</option>
                  </Select>
                </div>
              </div>

              {/* Chat thread */}
              <div className="coach-support-chat">
                {messagesLoading ? (
                  <div className="portal-state">Đang tải nội dung trao đổi…</div>
                ) : messagesError ? (
                  <div className="portal-alert portal-alert--error">{messagesError}</div>
                ) : messages.length === 0 ? (
                  <div className="coach-support-empty-state">
                    <p>Chưa có tin nhắn phản hồi nào cho yêu cầu này.</p>
                    <span style={{ fontSize: 12 }}>Hãy gửi lời chào hoặc giải đáp cho học viên bên dưới.</span>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isFromCoach = m.senderRole !== 'MEMBER';
                    return (
                      <div
                        key={m.id}
                        className={`coach-support-msg ${
                          isFromCoach ? 'coach-support-msg--coach' : 'coach-support-msg--member'
                        }`}
                      >
                        <div className="coach-support-bubble">{m.message}</div>
                        <span className="coach-support-meta-line">
                          {isFromCoach ? 'Bạn (HLV)' : m.senderName || 'Học viên'} ·{' '}
                          {new Date(m.createdAt).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Compose box */}
              {selectedTicket.status !== 'closed' ? (
                <form className="coach-support-compose" onSubmit={(e) => void handleSendReply(e)}>
                  <textarea
                    className="portal-textarea coach-support-input"
                    rows={2}
                    placeholder="Nhập nội dung phản hồi học viên..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    disabled={sending}
                  />
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={sending || !replyText.trim()}
                    style={{ minHeight: 44 }}
                  >
                    {sending ? 'Đang gửi…' : 'Gửi phản hồi'}
                  </button>
                </form>
              ) : (
                <div style={{ padding: '12px 24px', background: 'var(--portal-raised)', fontSize: 13, color: 'var(--portal-muted)' }}>
                  Yêu cầu khiếu nại này đã được đóng.
                </div>
              )}
            </>
          ) : (
            <div className="coach-support-empty-state">
              <h3>Chọn một khiếu nại để xem chi tiết</h3>
              <p>Chọn yêu cầu từ danh sách bên trái để đọc nội dung và trao đổi với học viên.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
