import { sourceText, useSourceLanguage, sourceFormat, sourceError } from './shopI18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatCenterDateTime } from '../../shared/lib/centerTime';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { PageHeader } from '../../shared/ui/PageHeader';
import { RefreshButton } from '../../shared/ui/RefreshButton';
import { useCart } from './cart';
import { MemberAddressBook } from './components/MemberAddressBook';
import { MemberShopCatalog } from './components/MemberShopCatalog';
import { CartDrawer } from './components/CartDrawer';
import { OrderStatusPill } from './components/OrderStatusPill';
import './shop-portal.css';
import { shopApi } from './shopApi';
import { formatVnd } from './shopFormat';
import type { OrderSummaryDto, Page } from './shopTypes';

const STATUS_FILTERS: Array<{ id: string; label: string }> = [
  { id: '', get label() { return sourceText('Tất cả'); } },
  { id: 'pending', get label() { return sourceText('Chờ thanh toán'); } },
  { id: 'active', get label() { return sourceText('Đang xử lý'); } },
  { id: 'done', get label() { return sourceText('Hoàn tất'); } },
  { id: 'cancelled', get label() { return sourceText('Đã hủy'); } },
];

export function MemberOrdersPage({
  defaultTab = 'orders',
}: {
  defaultTab?: 'orders' | 'shop' | 'addresses';
} = {}) {
  useSourceLanguage();
  const [cartOpen, setCartOpen] = useState(false);
  const cartFocusRef = useRef<HTMLElement | null>(null);
  const openCart = () => {
    cartFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCartOpen(true);
  };
  const cartLines = useCart();
  const cartCount = cartLines.reduce((sum, l) => sum + l.quantity, 0);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab: 'orders' | 'shop' | 'addresses' =
    rawTab === 'addresses'
      ? 'addresses'
      : rawTab === 'shop'
        ? 'shop'
        : rawTab === 'orders'
          ? 'orders'
          : defaultTab;
  const [statusGroup, setStatusGroup] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page<OrderSummaryDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | Error>('');

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await shopApi.listMyOrders({
        status: statusGroup || undefined,
        page,
        size: 10,
      });
      setData(res);
    } catch (err) {
      setError(sourceError(err, 'Không thể tải danh sách đơn hàng. Vui lòng thử lại.'));
    } finally {
      setLoading(false);
    }
  }, [statusGroup, page]);

  useEffect(() => {
    if (activeTab === 'orders') {
      void loadOrders();
    }
  }, [activeTab, loadOrders]);

  const switchTab = (next: 'orders' | 'shop' | 'addresses') => {
    if (next === 'addresses') {
      setSearchParams({ tab: 'addresses' }, { replace: true });
    } else if (next === 'shop') {
      setSearchParams({ tab: 'shop' }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  return (
    <div className="portal-container stack">
      <PageHeader
        eyebrow={sourceText("Hội viên")}
        title={activeTab === 'shop' ? sourceText('Sản phẩm') : sourceText('Đơn hàng')}
        actions={
          <button
            type="button"
            onClick={openCart}
            className="shop-cart-btn"
            aria-expanded={cartOpen}
            aria-label={sourceFormat("Giỏ hàng · {0} sản phẩm", cartCount)}
          >
            <span>{sourceText("Giỏ hàng")}</span>
            {cartCount > 0 && <span className="shop-cart-badge">{cartCount}</span>}
          </button>
        }
      />

      <div className="shop-tabs-row">
      <div className="portal-tabs shop-tabs" role="tablist" aria-label={sourceText("Quản lý sản phẩm, đơn hàng và địa chỉ")}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'orders'}
          className={`portal-tab ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => switchTab('orders')}
        >
          {sourceText("Đơn hàng")}</button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'shop'}
          className={`portal-tab ${activeTab === 'shop' ? 'active' : ''}`}
          onClick={() => switchTab('shop')}
        >
          {sourceText("Sản phẩm")}</button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'addresses'}
          className={`portal-tab ${activeTab === 'addresses' ? 'active' : ''}`}
          onClick={() => switchTab('addresses')}
        >
          {sourceText("Địa chỉ giao hàng")}</button>
      </div>
        {activeTab === 'orders' && (
          <RefreshButton
            variant="bare"
            label={sourceText("Làm mới đơn hàng")}
            disabled={loading}
            className={loading ? 'is-loading' : ''}
            onClick={() => void loadOrders()}
          />
        )}
      </div>

      {activeTab === 'addresses' ? (
        <MemberAddressBook />
      ) : activeTab === 'shop' ? (
        <MemberShopCatalog onOpenCart={openCart} />
      ) : (
        <section className="stack" aria-label={sourceText("Danh sách đơn hàng")}>
          <div className="portal-tabs shop-tabs" aria-label={sourceText("Lọc trạng thái đơn hàng")}>
            {STATUS_FILTERS.map(filter => {
              const active = statusGroup === filter.id;
              return (
                <button
                  key={filter.id || 'all'}
                  type="button"
                  aria-pressed={active}
                  className={`portal-tab ${active ? 'active' : ''}`}
                  onClick={() => {
                    setStatusGroup(filter.id);
                    setPage(0);
                  }}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          {loading ? (
            <LoadingSkeleton label={sourceText("Đang tải đơn hàng…")} variant="rows" count={3} />
          ) : error ? (
            <div className="portal-alert" role="alert">
              <span>{sourceText(error)}</span>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => void loadOrders()}
              >
                {sourceText("Thử lại")}</button>
            </div>
          ) : !data?.content.length ? (
            <div className="portal-card portal-state stack" style={{ alignItems: 'flex-start' }}>
              <p style={{ margin: 0 }}>{sourceText("Chưa có đơn hàng nào trong mục này.")}</p>
              <Link to="/products" className="btn-secondary">
                {sourceText("Xem sản phẩm")}</Link>
            </div>
          ) : (
            <>
              <div className="stack">
                {data.content.map(o => (
                  <article key={o.id} className="portal-card stack" style={{ gap: 10 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <strong>{o.code}</strong>
                        <span className="muted"> · {formatCenterDateTime(o.createdAt)}</span>
                      </div>
                      <OrderStatusPill
                        status={o.status}
                        fulfillment={o.fulfillment}
                        paymentMethod={o.paymentMethod}
                      />
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>
                        {o.firstItemName}
                        {o.itemCount > 1 ? sourceFormat(" và {0} sản phẩm khác", o.itemCount - 1) : ''}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatVnd(o.total)}
                        </strong>
                        {o.canPay && (
                          <Link className="btn-primary btn-sm" to={`/member/orders/${o.id}`}>
                            {sourceText("Thanh toán")}</Link>
                        )}
                        <Link className="btn-secondary btn-sm" to={`/member/orders/${o.id}`}>
                          {sourceText("Xem chi tiết")}</Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {data.totalPages > 1 && (
                <nav className="court-pagination" aria-label={sourceText("Phân trang đơn hàng")}>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                  >
                    {sourceText("Trang trước")}</button>
                  <span>
                    {sourceText("Trang ")}{page + 1} / {data.totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={page + 1 >= data.totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    {sourceText("Trang sau")}</button>
                </nav>
              )}
            </>
          )}
        </section>
      )}
      {cartOpen && <CartDrawer onClose={() => setCartOpen(false)} returnFocusRef={cartFocusRef} />}
    </div>
  );
}
