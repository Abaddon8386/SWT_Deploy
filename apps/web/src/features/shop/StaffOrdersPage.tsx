import { sourceText, useSourceLanguage, sourceError } from './shopI18n';
import { useCallback, useEffect, useState } from 'react';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { PageHeader } from '../../shared/ui/PageHeader';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import { OrderTable } from './components/OrderTable';
import { StaffOrderDialog } from './components/StaffOrderDialog';
import './shop-portal.css';
import { shopApi } from './shopApi';
import type { OrderCountsDto, OrderDto, Page } from './shopTypes';

const STAFF_TABS: Array<{
  id: string;
  label: string;
  countKey?: keyof OrderCountsDto;
}> = [
  { id: 'paid', get label() { return sourceText('Cần xử lý'); }, countKey: 'paid' },
  { id: 'processing', get label() { return sourceText('Đang chuẩn bị'); }, countKey: 'processing' },
  { id: 'ready_for_pickup', get label() { return sourceText('Chờ nhận tại quầy'); }, countKey: 'ready_for_pickup' },
  { id: 'shipping', get label() { return sourceText('Đang giao'); }, countKey: 'shipping' },
  { id: 'pending_payment', get label() { return sourceText('Chờ trả tại quầy'); }, countKey: 'counter_pending' },
  { id: 'completed', get label() { return sourceText('Hoàn tất'); } },
  { id: 'cancelled', get label() { return sourceText('Đã hủy'); } },
  { id: '', get label() { return sourceText('Tất cả'); } },
];

export function StaffOrdersSection({
  status,
  onStatusChange,
  q,
  onQueryChange,
  page,
  onPageChange,
  data,
  counts,
  loading,
  error,
  onRetry,
}: {
  status: string;
  onStatusChange: (next: string) => void;
  q: string;
  onQueryChange: (next: string) => void;
  page: number;
  onPageChange: (next: number) => void;
  data: Page<OrderDto> | null;
  counts: OrderCountsDto | null;
  loading: boolean;
  error: string | Error;
  onRetry: () => void;
}) {
  useSourceLanguage();
  const [selectedOrder, setSelectedOrder] = useState<OrderDto | null>(null);

  return (
    <div className="stack">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div className="portal-tabs shop-tabs" role="tablist" aria-label={sourceText("Trạng thái đơn hàng")}>
          {STAFF_TABS.map(tab => {
            const count = tab.countKey && counts ? counts[tab.countKey] : null;
            const active = status === tab.id;
            return (
              <button
                key={tab.id || 'all'}
                type="button"
                role="tab"
                aria-selected={active}
                className={`portal-tab ${active ? 'active' : ''}`}
                onClick={() => {
                  onStatusChange(tab.id);
                  onPageChange(0);
                }}
              >
                {tab.label}
                {count != null ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>

        <div className="shop-field" style={{ minWidth: 240 }}>
          <label className="shop-sr-only" htmlFor="staff-order-search">
            {sourceText("Tìm mã đơn, tên, SĐT")}</label>
          <input
            id="staff-order-search"
            type="search"
            className="shop-input"
            placeholder={sourceText("Tìm mã đơn, tên, SĐT…")}
            value={q}
            onChange={e => {
              onQueryChange(e.target.value);
              onPageChange(0);
            }}
          />
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton label={sourceText("Đang tải đơn hàng…")} variant="table" count={4} />
      ) : error ? (
        <div className="portal-alert" role="alert">
          <span>{sourceText(error)}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>
            {sourceText("Thử lại")}</button>
        </div>
      ) : !data?.content.length ? (
        <div className="portal-card portal-state">
          <p style={{ margin: 0 }}>{sourceText("Chưa có đơn hàng nào khớp bộ lọc.")}</p>
        </div>
      ) : (
        <>
          <OrderTable orders={data.content} onOpen={order => setSelectedOrder(order)} />
          {data.totalPages > 1 && (
            <nav className="court-pagination" aria-label={sourceText("Phân trang đơn hàng")}>
              <button
                type="button"
                className="btn-secondary"
                disabled={page === 0}
                onClick={() => onPageChange(page - 1)}
              >
                {sourceText("Trang trước")}</button>
              <span>
                {sourceText("Trang ")}{page + 1} / {data.totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={page + 1 >= data.totalPages}
                onClick={() => onPageChange(page + 1)}
              >
                {sourceText("Trang sau")}</button>
            </nav>
          )}
        </>
      )}

      {selectedOrder && (
        <StaffOrderDialog
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdated={updated => {
            setSelectedOrder(updated);
            onRetry();
          }}
        />
      )}
    </div>
  );
}

export function StaffOrdersPage() {
  useSourceLanguage();
  const [status, setStatus] = useState('paid');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page<OrderDto> | null>(null);
  const [counts, setCounts] = useState<OrderCountsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | Error>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [orderPage, orderCounts] = await Promise.all([
        shopApi.staff.listOrders({ status: status || undefined, q: q.trim() || undefined, page, size: 20 }),
        shopApi.staff.counts(),
      ]);
      setData(orderPage);
      setCounts(orderCounts);
    } catch (err) {
      setError(sourceError(err, 'Không thể tải danh sách đơn hàng. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  }, [status, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="portal-container stack">
      <PageHeader
        eyebrow={sourceText("Vận hành")}
        title={sourceText("Đơn hàng sản phẩm")}
        actions={
          <RefreshButton
            label={sourceText("Làm mới đơn hàng")}
            disabled={loading}
            onClick={() => void load()}
          />
        }
      />
      <StaffOrdersSection
        status={status}
        onStatusChange={setStatus}
        q={q}
        onQueryChange={setQ}
        page={page}
        onPageChange={setPage}
        data={data}
        counts={counts}
        loading={loading}
        error={error}
        onRetry={() => void load()}
      />
    </div>
  );
}
